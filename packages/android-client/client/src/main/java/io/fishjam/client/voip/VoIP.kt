package io.fishjam.client.voip

import android.content.Context
import android.os.Build
import android.telecom.DisconnectCause
import android.util.Log
import androidx.annotation.RequiresApi
import com.google.firebase.installations.FirebaseInstallations
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
/** Lifecycle state of the current VoIP call. */
enum class VoIPCallStatus {
    Available,
    Incoming,
    Connecting,
    Active
}

/**
 * Why a call ended.
 * - `Local` — this device hung up
 * - `Rejected` — the callee declined a ringing incoming call
 * - `Missed` — rang and was never answered (or outgoing timed out)
 * - `Remote` — the other party ended the call
 * - `AnsweredElsewhere` — answered on another of the user's devices
 * - `Failed` — call setup failed
 */
enum class CallEndedReason {
    Local,
    Rejected,
    Missed,
    Remote,
    AnsweredElsewhere,
    Failed
}

/** Details of the call currently being handled. */
data class VoIPCurrentCall(
    val roomName: String,
    val displayName: String,
    val handle: String,
    val isVideo: Boolean,
    val avatarUrl: String? = null,
    val startedAt: Long? = null,
    val isOutgoing: Boolean
)

/** Payload of an incoming VoIP push, or a waiting call that was declined. */
data class VoIPIncomingPayload(
    val roomName: String,
    val displayName: String,
    val handle: String,
    val isVideo: Boolean,
    val avatarUrl: String? = null
)

/**
 * Things that happen once, delivered through [VoIP.events]. Read [VoIP.callStatus] and the
 * other state flows for values that stay true over time.
 *
 * Events are not replayed. Collect [VoIP.events] while your app is running.
 */
sealed class VoIPEvent {
    /** A new incoming call is ringing. */
    data class Incoming(
        val payload: VoIPIncomingPayload
    ) : VoIPEvent()

    /** The user answered an incoming call. Join the room now, then call [VoIP.reportConnected]. */
    data class Answered(
        val call: VoIPCurrentCall
    ) : VoIPEvent()

    /** The current call ended. The same value is in [VoIP.lastEndedReason]. */
    data class Ended(
        val reason: CallEndedReason
    ) : VoIPEvent()

    /** The call was put on hold or resumed, from the system UI or from [VoIP.setCallHeld]. */
    data class HeldChanged(
        val onHold: Boolean
    ) : VoIPEvent()

    /** The microphone was muted or unmuted from the system UI. */
    data class MuteChanged(
        val muted: Boolean
    ) : VoIPEvent()

    /** A second incoming call was declined while another call was active. */
    data class WaitingCallDeclined(
        val payload: VoIPIncomingPayload
    ) : VoIPEvent()

    /** The push token was issued or changed. Send it to your server. */
    data class TokenUpdated(
        val token: String
    ) : VoIPEvent()
}

internal fun parseVoIPIncoming(data: Map<String, String>): VoIPIncomingPayload? {
    val roomName = data["roomName"]?.trim().orEmpty()
    if (roomName.isEmpty()) return null
    val displayName = data["displayName"]?.trim()?.takeIf { it.isNotEmpty() } ?: "Incoming call"
    val handle = data["handle"]?.trim()?.takeIf { it.isNotEmpty() } ?: displayName
    val isVideo = data["isVideo"]?.toBoolean() ?: false
    val avatarUrl = data["avatarUrl"]?.takeIf { it.isNotEmpty() }
    return VoIPIncomingPayload(roomName, displayName, handle, isVideo, avatarUrl)
}

internal fun reasonFromString(reason: String): CallEndedReason = when (reason) {
    "local" -> CallEndedReason.Local
    "rejected" -> CallEndedReason.Rejected
    "missed" -> CallEndedReason.Missed
    "remote" -> CallEndedReason.Remote
    "answeredElsewhere" -> CallEndedReason.AnsweredElsewhere
    "failed" -> CallEndedReason.Failed
    else -> CallEndedReason.Remote
}

internal fun reasonToString(reason: CallEndedReason): String = when (reason) {
    CallEndedReason.Local -> "local"
    CallEndedReason.Rejected -> "rejected"
    CallEndedReason.Missed -> "missed"
    CallEndedReason.Remote -> "remote"
    CallEndedReason.AnsweredElsewhere -> "answeredElsewhere"
    CallEndedReason.Failed -> "failed"
}

/**
 * Android VoIP push calls: high-priority FCM data message + Core-Telecom.
 *
 * The SDK never joins rooms. React to [callStatus] becoming [VoIPCallStatus.Connecting],
 * join, then call [reportConnected] within the answer deadline (10 s by default).
 *
 * Requires Android 8 (API 26) for Telecom ringing. On API 24-25 a push only updates state.
 * The app must provide Firebase (`google-services.json`) and declare the permissions /
 * service entries merged from this library's manifest.
 */
object VoIP {
    private const val TAG = "FishjamVoIP"

    private val _token = MutableStateFlow<String?>(null)
    val token: StateFlow<String?> = _token.asStateFlow()

    private val _callStatus = MutableStateFlow(VoIPCallStatus.Available)
    val callStatus: StateFlow<VoIPCallStatus> = _callStatus.asStateFlow()

    private val _currentCall = MutableStateFlow<VoIPCurrentCall?>(null)
    val currentCall: StateFlow<VoIPCurrentCall?> = _currentCall.asStateFlow()

    private val _lastEndedReason = MutableStateFlow<CallEndedReason?>(null)
    val lastEndedReason: StateFlow<CallEndedReason?> = _lastEndedReason.asStateFlow()

    private val _isOnHold = MutableStateFlow(false)
    val isOnHold: StateFlow<Boolean> = _isOnHold.asStateFlow()

    private val _isMuted = MutableStateFlow(false)
    val isMuted: StateFlow<Boolean> = _isMuted.asStateFlow()

    private val _events = MutableSharedFlow<VoIPEvent>(extraBufferCapacity = 64)
    val events: SharedFlow<VoIPEvent> = _events.asSharedFlow()

    @Volatile
    private var appContext: Context? = null

    @Volatile
    private var pendingAnswerRequestId: String? = null

    @Volatile
    private var pendingWaitingAnswer: String? = null

    @Volatile
    private var activationInFlight = false

    @Volatile
    private var attached = false

    /**
     * Attaches listeners so push and Telecom events update [callStatus].
     * Call once from Application.onCreate or your main Activity.
     */
    fun attach(context: Context) {
        appContext = context.applicationContext
        if (attached) return
        attached = true

        VoIPPushRegistry.setListener(
            object : VoIPPushRegistry.Listener {
                override fun onVoIPToken(token: String) {
                    _token.value = token
                    _events.tryEmit(VoIPEvent.TokenUpdated(token))
                }

                override fun onVoIPIncoming(incoming: VoIPPushRegistry.Incoming) {
                    applyIncoming(
                        VoIPIncomingPayload(
                            incoming.roomName,
                            incoming.displayName,
                            incoming.handle,
                            incoming.isVideo,
                            incoming.avatarUrl
                        )
                    )
                }

                override fun onWaitingCallDeclined(incoming: VoIPPushRegistry.Incoming) {
                    _events.tryEmit(
                        VoIPEvent.WaitingCallDeclined(
                            VoIPIncomingPayload(
                                incoming.roomName,
                                incoming.displayName,
                                incoming.handle,
                                incoming.isVideo,
                                incoming.avatarUrl
                            )
                        )
                    )
                }
            }
        )

        VoIPPushRegistry.getToken()?.let { _token.value = it }
        requestCurrentFcmToken()
        VoIPPushRegistry.pending()?.let { pending ->
            applyIncoming(
                VoIPIncomingPayload(
                    pending.roomName,
                    pending.displayName,
                    pending.handle,
                    pending.isVideo,
                    pending.avatarUrl
                )
            )
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            CallManager.setListener(
                object : CallEventsListener {
                    override fun onStarted() {}

                    override fun onAnswered(requestId: String) {
                        handleAnswered(requestId)
                    }

                    override fun onEnded(reason: String) {
                        handleEnded(reasonFromString(reason), fromNative = true)
                    }

                    override fun onFailed(reason: String) {
                        Log.w(TAG, "Telecom failed: $reason")
                        handleEnded(CallEndedReason.Failed, fromNative = true)
                    }

                    override fun onMuteChanged(muted: Boolean) {
                        if (_currentCall.value?.startedAt != null && _isMuted.value != muted) {
                            _isMuted.value = muted
                            _events.tryEmit(VoIPEvent.MuteChanged(muted))
                        }
                    }

                    override fun onHoldChanged(onHold: Boolean) {
                        if (_currentCall.value?.startedAt != null && _isOnHold.value != onHold) {
                            _isOnHold.value = onHold
                            _events.tryEmit(VoIPEvent.HeldChanged(onHold))
                        }
                    }
                }
            )
        }
    }

    /** Reports an outgoing call and moves to Connecting. Does not join the room. */
    /**
     * `onRegistered` runs only when Firebase registers the app, not on later launches.
     * The SDK manifest turns on installation-id mode, where `FirebaseMessaging.getToken()`
     * is disabled and the Firebase installation id is the push token. Read it directly so
     * Register works after the process restarts.
     */
    private fun requestCurrentFcmToken() {
        try {
            FirebaseInstallations.getInstance().id.addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    task.result?.let { VoIPMessagingService.handleNewToken(it) }
                } else {
                    Log.w(TAG, "Firebase installation id unavailable", task.exception)
                }
            }
        } catch (error: IllegalStateException) {
            Log.w(TAG, "Firebase is not initialized. Add google-services.json and rebuild.", error)
        }
    }

    fun startCall(to: String, roomName: String, isVideo: Boolean = false) {
        val ctx = appContext
        if (ctx == null) {
            Log.e(TAG, "VoIP.attach(context) must be called before startCall")
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            Log.e(TAG, "Outgoing Telecom calls require Android 8+")
            return
        }
        val call =
            VoIPCurrentCall(
                roomName = roomName,
                displayName = to,
                handle = to,
                isVideo = isVideo,
                startedAt = null,
                isOutgoing = true
            )
        _currentCall.value = call
        _callStatus.value = VoIPCallStatus.Connecting
        _lastEndedReason.value = null
        CallManager.startOutgoingCall(ctx, to, to, isVideo)
    }

    /** Report that the room join succeeded and media is flowing. */
    fun reportConnected() {
        val call = _currentCall.value
        if (call == null || call.startedAt != null || activationInFlight) return
        activationInFlight = true
        try {
            val requestId = pendingAnswerRequestId
            if (requestId != null) {
                pendingAnswerRequestId = null
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    val connected = CallManager.fulfillAnswered(requestId)
                    if (!connected) {
                        if (_currentCall.value?.roomName == call.roomName) {
                            endCall(CallEndedReason.Failed)
                        }
                        return
                    }
                }
            } else if (call.isOutgoing && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                CallManager.reportOutgoingCallConnected()
            }

            val active = _currentCall.value
            if (active == null || active.roomName != call.roomName) return
            _currentCall.value = active.copy(startedAt = System.currentTimeMillis())
            _callStatus.value = VoIPCallStatus.Active
        } finally {
            activationInFlight = false
        }
    }

    /** Tell the SDK the room join failed. */
    fun reportConnectFailed() {
        val call = _currentCall.value ?: return
        val requestId = pendingAnswerRequestId
        pendingAnswerRequestId = null
        if (requestId != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            CallManager.failAnswered(requestId)
            resetCallState(CallEndedReason.Failed, call.roomName)
            return
        }
        endCall(CallEndedReason.Failed)
    }

    /** Ends or rejects the current call. */
    fun endCall(reason: CallEndedReason = CallEndedReason.Local, fromNative: Boolean = false) {
        handleEnded(reason, fromNative)
    }

    /** Answers the ringing incoming call from a custom UI. */
    @RequiresApi(Build.VERSION_CODES.O)
    fun answer() {
        CallManager.answer()
    }

    /** Declines the ringing incoming call from a custom UI. */
    @RequiresApi(Build.VERSION_CODES.O)
    fun decline() {
        CallManager.endCall(DisconnectCause(DisconnectCause.REJECTED))
    }

    /** Requests that the Telecom session be held or resumed. */
    fun setCallHeld(onHold: Boolean) {
        if (_currentCall.value == null) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            CallManager.setCallHeld(onHold)
        }
    }

    private fun applyIncoming(payload: VoIPIncomingPayload) {
        val call =
            VoIPCurrentCall(
                roomName = payload.roomName,
                displayName = payload.displayName,
                handle = payload.handle,
                isVideo = payload.isVideo,
                avatarUrl = payload.avatarUrl,
                startedAt = null,
                isOutgoing = false
            )
        _currentCall.value = call
        pendingAnswerRequestId = null
        _isOnHold.value = false
        _isMuted.value = false
        _lastEndedReason.value = null
        val pendingAnswer = pendingWaitingAnswer
        if (pendingAnswer != null) {
            pendingWaitingAnswer = null
            pendingAnswerRequestId = pendingAnswer
            _callStatus.value = VoIPCallStatus.Connecting
        } else {
            _callStatus.value = VoIPCallStatus.Incoming
        }
        _events.tryEmit(VoIPEvent.Incoming(payload))
        if (pendingAnswer != null) {
            _events.tryEmit(VoIPEvent.Answered(call))
        }
    }

    private fun handleAnswered(requestId: String) {
        if (pendingAnswerRequestId != null) return
        val call = _currentCall.value
        if (call == null || call.startedAt != null) {
            pendingWaitingAnswer = requestId
            return
        }
        pendingAnswerRequestId = requestId
        _callStatus.value = VoIPCallStatus.Connecting
        _events.tryEmit(VoIPEvent.Answered(call))
    }

    private fun handleEnded(reason: CallEndedReason, fromNative: Boolean) {
        val ended = _currentCall.value ?: return
        resetCallState(reason, ended.roomName)
        if (!fromNative && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            CallManager.endCall(CallManager.reasonToCause(reasonToString(reason)))
        }
    }

    private fun resetCallState(reason: CallEndedReason, endedRoomName: String?) {
        val roomName = endedRoomName ?: _currentCall.value?.roomName
        if (roomName == null || _currentCall.value?.roomName != roomName) return
        _currentCall.value = null
        pendingAnswerRequestId = null
        pendingWaitingAnswer = null
        _isOnHold.value = false
        _isMuted.value = false
        _callStatus.value = VoIPCallStatus.Available
        _lastEndedReason.value = reason
        _events.tryEmit(VoIPEvent.Ended(reason))
    }
}
