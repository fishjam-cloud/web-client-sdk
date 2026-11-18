package io.fishjam.client

import android.annotation.TargetApi
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Lists, reads and switches the Android audio output. Port of the Flutter
 * SDK's AudioOutputManager. Route changes are published on
 * [currentAudioOutput] and [availableAudioOutputs]. Call [selectAudioOutput]
 * from the main thread.
 */
internal class AudioOutputManager(
    context: Context
) {
    private val appContext = context.applicationContext
    private val audioManager = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val mainHandler = Handler(Looper.getMainLooper())

    private val _currentAudioOutput = MutableStateFlow<AudioDevice?>(null)
    val currentAudioOutput: StateFlow<AudioDevice?> = _currentAudioOutput.asStateFlow()

    private val _availableAudioOutputs = MutableStateFlow<List<AudioDevice>>(emptyList())
    val availableAudioOutputs: StateFlow<List<AudioDevice>> = _availableAudioOutputs.asStateFlow()

    private var audioDeviceCallback: AudioDeviceCallback? = null
    private var communicationDeviceChangedListener: Any? = null
    private var scoReceiver: BroadcastReceiver? = null
    private var isObserving = false
    private var ownsCommunicationMode = false

    // AudioFocusRequest exists from API 26. A field of that type is resolved
    // when this class loads, and minSdk is 24.
    private var focusRequest: Any? = null
    private val focusChangeListener = AudioManager.OnAudioFocusChangeListener { }

    private var pending: PendingSelect? = null

    private class PendingSelect(
        val callback: (AudioOutputException?) -> Unit,
        val targetDeviceId: Int,
        val targetType: Int,
        val timeoutTask: Runnable
    )

    fun selectAudioOutput(deviceIdStr: String, callback: (AudioOutputException?) -> Unit) {
        val deviceId = deviceIdStr.toIntOrNull()
        if (deviceId == null) {
            callback(AudioOutputException(AudioOutputErrorCode.Select, "Invalid device ID: $deviceIdStr"))
            return
        }
        val target = availableDevices().firstOrNull { it.id == deviceId }
        if (target == null) {
            callback(
                AudioOutputException(
                    AudioOutputErrorCode.Select,
                    "Audio output not available for device ID: $deviceId"
                )
            )
            return
        }
        if (isCurrentlyRouted(deviceId, target.type)) {
            callback(null)
            return
        }

        pending?.let { previous ->
            mainHandler.removeCallbacks(previous.timeoutTask)
            pending = null
            previous.callback(
                AudioOutputException(
                    AudioOutputErrorCode.Superseded,
                    "Superseded by newer selectAudioOutput call"
                )
            )
        }
        val timeoutTask = Runnable {
            finishPending(
                AudioOutputException(
                    AudioOutputErrorCode.Timeout,
                    "Route change not confirmed within ${ROUTE_CHANGE_TIMEOUT_MS}ms"
                )
            )
        }
        pending = PendingSelect(callback, deviceId, target.type, timeoutTask)
        mainHandler.postDelayed(timeoutTask, ROUTE_CHANGE_TIMEOUT_MS)

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                dispatchSelectApi31(target)
            } else {
                dispatchSelectLegacy(target)
                // Legacy non-SCO routes don't reliably trigger AudioDeviceCallback for
                // state-only toggles (speakerphone, earpiece, wired). Publish and check
                // right away; SCO targets complete through the broadcast receiver.
                publish()
                maybeResolvePending()
            }
        } catch (error: Exception) {
            finishPending(
                AudioOutputException(
                    AudioOutputErrorCode.Select,
                    error.message ?: "selectAudioOutput failed"
                )
            )
        }
    }

    fun startObserving() {
        onMain {
            if (!isObserving) {
                isObserving = true

                audioDeviceCallback = object : AudioDeviceCallback() {
                    override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
                        onDevicesAddedDuringCall(addedDevices)
                        publish()
                        maybeResolvePending()
                    }

                    override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
                        publish()
                        maybeResolvePending()
                    }
                }.also { audioManager.registerAudioDeviceCallback(it, mainHandler) }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    val listener = AudioManager.OnCommunicationDeviceChangedListener {
                        publish()
                        maybeResolvePending()
                    }
                    audioManager.addOnCommunicationDeviceChangedListener(appContext.mainExecutor, listener)
                    communicationDeviceChangedListener = listener
                }

                val receiver = object : BroadcastReceiver() {
                    override fun onReceive(c: Context, intent: Intent) {
                        val state = intent.getIntExtra(AudioManager.EXTRA_SCO_AUDIO_STATE, -1)
                        if (state == AudioManager.SCO_AUDIO_STATE_CONNECTED ||
                            state == AudioManager.SCO_AUDIO_STATE_DISCONNECTED
                        ) {
                            publish()
                            maybeResolvePending()
                        }
                    }
                }
                val filter = IntentFilter(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    appContext.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
                } else {
                    @Suppress("UnspecifiedRegisterReceiverFlag")
                    appContext.registerReceiver(receiver, filter)
                }
                scoReceiver = receiver
                publish()
            }
        }
    }

    fun stopObserving() {
        onMain {
            if (isObserving) {
                isObserving = false

                exitCommunicationMode()

                audioDeviceCallback?.let { audioManager.unregisterAudioDeviceCallback(it) }
                audioDeviceCallback = null
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    (communicationDeviceChangedListener as? AudioManager.OnCommunicationDeviceChangedListener)
                        ?.let { audioManager.removeOnCommunicationDeviceChangedListener(it) }
                }
                communicationDeviceChangedListener = null
                scoReceiver?.let {
                    try {
                        appContext.unregisterReceiver(it)
                    } catch (_: IllegalArgumentException) {
                    }
                }
                scoReceiver = null

                finishPending(
                    AudioOutputException(
                        AudioOutputErrorCode.Cancelled,
                        "Audio output observer stopped"
                    )
                )
            }
        }
    }

    fun enterCommunicationMode() {
        try {
            ownsCommunicationMode = true
            // Mode alone leaves other apps playing. GAIN_TRANSIENT pauses them for
            // the call and lets them resume when the focus is abandoned.
            requestCommunicationFocus()
            audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
            routeToBluetoothHeadset()
        } catch (error: Exception) {
            Log.w(TAG, "Audio communication mode not entered", error)
        }
    }

    fun exitCommunicationMode() {
        if (!ownsCommunicationMode) return
        ownsCommunicationMode = false
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                audioManager.clearCommunicationDevice()
            } else {
                @Suppress("DEPRECATION")
                audioManager.isBluetoothScoOn = false
                @Suppress("DEPRECATION")
                audioManager.stopBluetoothSco()
            }
            audioManager.mode = AudioManager.MODE_NORMAL
        } catch (error: Exception) {
            Log.w(TAG, "Audio communication mode not exited", error)
        } finally {
            abandonCommunicationFocus()
        }
    }

    private fun onMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            block()
            return
        }
        val done = CountDownLatch(1)
        mainHandler.post {
            try {
                block()
            } finally {
                done.countDown()
            }
        }
        done.await(2, TimeUnit.SECONDS)
    }

    private fun requestCommunicationFocus() {
        abandonCommunicationFocus()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            requestCommunicationFocusApi26()
        } else {
            @Suppress("DEPRECATION")
            val result = audioManager.requestAudioFocus(
                focusChangeListener,
                AudioManager.STREAM_VOICE_CALL,
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
            )
            if (result != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
                Log.w(TAG, "Audio focus not granted ($result)")
            }
        }
    }

    @TargetApi(Build.VERSION_CODES.O)
    private fun requestCommunicationFocusApi26() {
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setOnAudioFocusChangeListener(focusChangeListener, mainHandler)
            .build()
        focusRequest = request
        val result = audioManager.requestAudioFocus(request)
        if (result != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            Log.w(TAG, "Audio focus not granted ($result)")
        }
    }

    private fun abandonCommunicationFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            abandonCommunicationFocusApi26()
        } else {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(focusChangeListener)
        }
    }

    @TargetApi(Build.VERSION_CODES.O)
    private fun abandonCommunicationFocusApi26() {
        (focusRequest as? AudioFocusRequest)?.let { audioManager.abandonAudioFocusRequest(it) }
        focusRequest = null
    }

    private fun availableDevices(): List<AudioDeviceInfo> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        audioManager.availableCommunicationDevices
    } else {
        audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).filter { it.type in LEGACY_OUTPUT_TYPES }
    }

    private fun currentDevice(): AudioDeviceInfo? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        audioManager.communicationDevice
    } else {
        findCurrentOutputLegacy()
    }

    @Suppress("DEPRECATION")
    private fun findCurrentOutputLegacy(): AudioDeviceInfo? {
        val devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
        if (audioManager.isBluetoothScoOn) {
            devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO }?.let { return it }
        }
        if (audioManager.isSpeakerphoneOn) {
            devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }?.let { return it }
        }
        // A wired headset is only listed while plugged in, and the OS routes to it.
        devices.firstOrNull {
            it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET || it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES
        }?.let { return it }
        return devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE }
    }

    private fun isCurrentlyRouted(targetId: Int, targetType: Int): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // clearCommunicationDevice() leaves no current device: that is the earpiece state.
            val current = audioManager.communicationDevice
                ?: return targetType == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
            return current.id == targetId
        }
        return findCurrentOutputLegacy()?.id == targetId
    }

    @TargetApi(Build.VERSION_CODES.S)
    private fun dispatchSelectApi31(target: AudioDeviceInfo) {
        if (target.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) {
            audioManager.clearCommunicationDevice()
            return
        }
        if (!audioManager.setCommunicationDevice(target)) {
            throw IllegalStateException("setCommunicationDevice failed for device ID ${target.id}")
        }
    }

    @Suppress("DEPRECATION")
    private fun dispatchSelectLegacy(target: AudioDeviceInfo) {
        audioManager.isSpeakerphoneOn = false
        audioManager.isBluetoothScoOn = false
        try {
            audioManager.stopBluetoothSco()
        } catch (_: Exception) {
        }

        when (target.type) {
            AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> audioManager.isSpeakerphoneOn = true
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> {
                audioManager.startBluetoothSco()
                audioManager.isBluetoothScoOn = true
            }
            AudioDeviceInfo.TYPE_BUILTIN_EARPIECE,
            AudioDeviceInfo.TYPE_WIRED_HEADSET,
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> Unit
            else -> throw IllegalStateException(
                "Cannot select audio output type on this API level: ${audioDeviceNativeType(target.type)}"
            )
        }
    }

    private fun maybeResolvePending() {
        val current = pending ?: return
        if (!isCurrentlyRouted(current.targetDeviceId, current.targetType)) return
        finishPending(null)
    }

    private fun finishPending(error: AudioOutputException?) {
        val current = pending ?: return
        mainHandler.removeCallbacks(current.timeoutTask)
        pending = null
        current.callback(error)
    }

    private fun onDevicesAddedDuringCall(addedDevices: Array<out AudioDeviceInfo>) {
        if (!ownsCommunicationMode) return
        if (addedDevices.any { it.isSink && isBluetoothHeadset(it) }) routeToBluetoothHeadset()
    }

    private fun routeToBluetoothHeadset() {
        val headset = availableDevices().firstOrNull(::isBluetoothHeadset) ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            audioManager.setCommunicationDevice(headset)
        } else {
            dispatchSelectLegacy(headset)
        }
    }

    private fun publish() {
        _currentAudioOutput.value = currentDevice()?.let(::toAudioDevice)
        _availableAudioOutputs.value = availableDevices().map(::toAudioDevice)
    }

    private fun toAudioDevice(device: AudioDeviceInfo) = AudioDevice(
        type = audioDeviceType(device.type),
        nativeType = audioDeviceNativeType(device.type),
        name = device.productName?.toString().orEmpty(),
        id = device.id.toString()
    )

    companion object {
        private const val TAG = "AudioOutputManager"
        private const val ROUTE_CHANGE_TIMEOUT_MS = 3000L

        private val LEGACY_OUTPUT_TYPES = setOf(
            AudioDeviceInfo.TYPE_BUILTIN_EARPIECE,
            AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
            AudioDeviceInfo.TYPE_WIRED_HEADSET,
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
            AudioDeviceInfo.TYPE_HDMI,
            AudioDeviceInfo.TYPE_USB_DEVICE,
            AudioDeviceInfo.TYPE_USB_HEADSET,
            AudioDeviceInfo.TYPE_USB_ACCESSORY,
            AudioDeviceInfo.TYPE_HEARING_AID,
            AudioDeviceInfo.TYPE_BUS
        )

        private fun isBluetoothHeadset(device: AudioDeviceInfo): Boolean =
            device.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && device.type == AudioDeviceInfo.TYPE_BLE_HEADSET)
    }
}
