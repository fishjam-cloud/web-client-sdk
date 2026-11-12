package io.fishjam.client

import android.content.Context
import android.util.Log
import java.net.URI
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import org.webrtc.MediaConstraints
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.VideoTrack

/** Why a livestream could not be played. */
enum class LivestreamError {
    /** The viewer token was rejected (HTTP 401). */
    Unauthorized,

    /** There is no such stream (HTTP 404). */
    StreamNotFound,

    /** Any other failure, including network errors and timeouts. */
    UnknownError
}

class LivestreamException(
    val error: LivestreamError,
    val statusCode: Int? = null,
    cause: Throwable? = null
) : Exception("Livestream error: $error", cause)

/** What to play: a private stream by viewer token, or a public stream by its id. */
sealed class ConnectViewerConfig {
    data class Token(val token: String) : ConnectViewerConfig()

    data class StreamId(val streamId: String) : ConnectViewerConfig()
}

private const val DEFAULT_LIVESTREAM_DOMAIN = "https://fishjam.io"
private const val WHEP_PATH = "/api/v1/live/api/whep"
private const val ICE_GATHERING_TIMEOUT_MS = 3_000L
private const val FIRST_TRACK_TIMEOUT_MS = 10_000L
private const val TAG = "FishjamLivestream"

/**
 * The WHEP endpoint of [fishjamId]: the origin of the id when it is a URL, `https://fishjam.io` otherwise.
 * Throws [IllegalArgumentException] for a blank id.
 */
internal fun livestreamWhepBaseUrl(fishjamId: String): String {
    require(fishjamId.isNotBlank()) { "fishjamId is required to build a livestream WHEP URL." }
    val uri = runCatching { URI(fishjamId.trim()) }.getOrNull()
    val origin =
        if (uri?.scheme != null && uri.host != null) {
            val port = if (uri.port != -1) ":${uri.port}" else ""
            "${uri.scheme}://${uri.host}$port"
        } else {
            DEFAULT_LIVESTREAM_DOMAIN
        }
    return origin + WHEP_PATH
}

internal fun whepUrl(config: ConnectViewerConfig, baseUrl: String, override: String?): String {
    if (override != null) return override
    return when (config) {
        is ConnectViewerConfig.StreamId -> "$baseUrl/${config.streamId}"
        is ConnectViewerConfig.Token -> baseUrl
    }
}

internal fun livestreamErrorForStatus(status: Int): LivestreamError = when (status) {
    401 -> LivestreamError.Unauthorized
    404 -> LivestreamError.StreamNotFound
    else -> LivestreamError.UnknownError
}

internal fun isLivestreamConnected(state: PeerConnection.PeerConnectionState): Boolean =
    state == PeerConnection.PeerConnectionState.CONNECTED

/**
 * Plays a WHEP livestream, independent of any room connection.
 *
 * Call [connect] with a viewer token (private stream) or a stream id (public stream), then show [videoTrack]
 * with `VideoView`. Audio plays on its own. If the connection drops after it was established, the viewer
 * disconnects. Call [close] when it is no longer needed.
 */
class LivestreamViewer(
    context: Context,
    fishjamId: String,
    private val debug: Boolean = false
) : AutoCloseable {
    private val appContext = context.applicationContext
    private val baseUrl = livestreamWhepBaseUrl(fishjamId)
    private val signaling = WhepSignaling()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val connectLock = Mutex()
    private val lock = Any()
    private val closed = AtomicBoolean(false)
    private var factory: PeerConnectionFactory? = null
    private var session: Session? = null
    private var lastStop: Job? = null

    private val _videoTrack = MutableStateFlow<VideoTrack?>(null)

    /** The received video, once the first track has arrived. `null` when not connected. */
    val videoTrack: StateFlow<VideoTrack?> = _videoTrack.asStateFlow()

    private val _isConnected = MutableStateFlow(false)

    /** `true` while the peer connection is connected. */
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private val _error = MutableStateFlow<LivestreamError?>(null)

    /** The error of the last [connect], or `null`. Cleared when the next [connect] starts. */
    val error: StateFlow<LivestreamError?> = _error.asStateFlow()

    /**
     * Starts playing and returns once the first remote track has arrived. Any stream played before is
     * disconnected first. [url] replaces the WHEP endpoint that [config] would give.
     *
     * Throws [LivestreamException] and also publishes it in [error]. A [disconnect] during connecting
     * cancels the call with a [CancellationException].
     */
    suspend fun connect(config: ConnectViewerConfig, url: String? = null) {
        connectLock.withLock {
            check(!closed.get()) { "The LivestreamViewer is closed." }
            stopCurrent()
            _error.value = null
            val target = openSession(token = (config as? ConnectViewerConfig.Token)?.token)
            try {
                negotiate(target, whepUrl(config, baseUrl, url))
            } catch (error: TimeoutCancellationException) {
                fail(target, LivestreamException(LivestreamError.UnknownError, cause = error))
            } catch (error: CancellationException) {
                stop(target)
                throw error
            } catch (error: LivestreamException) {
                fail(target, error)
            } catch (error: Exception) {
                fail(target, LivestreamException(LivestreamError.UnknownError, cause = error))
            }
        }
    }

    /** Stops the stream. Does nothing when nothing is playing. */
    fun disconnect() {
        stopCurrent()
    }

    /** WebRTC stats of the connection. Empty when not connected. */
    suspend fun getStatistics(): List<RtcStats> {
        val connection = synchronized(lock) { session?.connection } ?: return emptyList()
        return suspendCancellableCoroutine { continuation ->
            try {
                connection.getStats { report ->
                    if (continuation.isActive) continuation.resume(report.toRtcStats())
                }
            } catch (error: RuntimeException) {
                Log.e(TAG, "getStats failed", error)
                if (continuation.isActive) continuation.resume(emptyList())
            }
        }
    }

    override fun close() {
        if (!closed.compareAndSet(false, true)) return
        stopCurrent()
        val previousStop = synchronized(lock) { lastStop }
        scope.launch {
            previousStop?.join()
            factory?.dispose()
            factory = null
            scope.cancel()
        }
    }

    private fun log(message: String) {
        if (debug) Log.d(TAG, message)
    }

    private fun openSession(token: String?): Session {
        val created = factory ?: createPeerConnectionFactory(appContext).also { factory = it }
        val target = Session(token)
        val config =
            PeerConnection.RTCConfiguration(emptyList()).apply {
                bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
                sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            }
        val connection =
            created.createPeerConnection(config, target.observer)
                ?: throw LivestreamException(LivestreamError.UnknownError)
        target.connection = connection
        synchronized(lock) { session = target }
        return target
    }

    private suspend fun negotiate(target: Session, url: String) {
        val connection = checkNotNull(target.connection)
        val receiveOnly = RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.RECV_ONLY)
        connection.addTransceiver(MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO, receiveOnly)
        connection.addTransceiver(MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO, receiveOnly)

        connection.setLocalDescriptionAwait(connection.createOfferAwait())
        if (connection.iceGatheringState() == PeerConnection.IceGatheringState.COMPLETE) {
            target.gathered.complete(Unit)
        }
        val completed = withTimeoutOrNull(ICE_GATHERING_TIMEOUT_MS) { target.gathered.await() }
        if (completed == null) log("ICE gathering did not finish in time; sending the candidates found so far")
        val offer =
            connection.localDescription?.description
                ?: throw LivestreamException(LivestreamError.UnknownError)

        val answer = withContext(Dispatchers.IO) { signaling.postOffer(url, target.token, offer) }
        target.resource = answer.resource
        connection.setRemoteDescriptionAwait(SessionDescription(SessionDescription.Type.ANSWER, answer.sdp))
        withTimeout(FIRST_TRACK_TIMEOUT_MS) { target.firstTrack.await() }
    }

    /** A [disconnect] while connecting is not an error: it cancels the call instead. */
    private fun fail(target: Session, error: LivestreamException): Nothing {
        val stoppedByCaller = target.stopped.get()
        stop(target)
        if (stoppedByCaller) throw CancellationException("The livestream was disconnected while connecting.")
        _error.value = error.error
        throw error
    }

    private fun stopCurrent() {
        val target = synchronized(lock) { session } ?: return
        stop(target)
    }

    private fun stop(target: Session) {
        if (!target.stopped.compareAndSet(false, true)) return
        synchronized(lock) {
            if (session === target) {
                session = null
                _videoTrack.value = null
                _isConnected.value = false
            }
        }
        target.firstTrack.completeExceptionally(LivestreamException(LivestreamError.UnknownError))
        target.gathered.complete(Unit)
        val job =
            scope.launch {
                target.resource?.let { signaling.delete(it, target.token) }
                target.connection?.close()
                target.connection?.dispose()
            }
        synchronized(lock) { lastStop = job }
    }

    private inner class Session(val token: String?) {
        val firstTrack = CompletableDeferred<Unit>()
        val gathered = CompletableDeferred<Unit>()
        val stopped = AtomicBoolean(false)

        @Volatile
        var connection: PeerConnection? = null

        @Volatile
        var resource: String? = null

        @Volatile
        private var wasConnected = false

        val observer =
            object : PeerConnection.Observer {
                override fun onSignalingChange(state: PeerConnection.SignalingState) = Unit

                override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) = Unit

                override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit

                override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {
                    if (state == PeerConnection.IceGatheringState.COMPLETE) gathered.complete(Unit)
                }

                override fun onIceCandidate(candidate: org.webrtc.IceCandidate?) = Unit

                override fun onIceCandidatesRemoved(candidates: Array<out org.webrtc.IceCandidate>) = Unit

                override fun onAddStream(stream: org.webrtc.MediaStream) = Unit

                override fun onRemoveStream(stream: org.webrtc.MediaStream) = Unit

                override fun onDataChannel(channel: org.webrtc.DataChannel) = Unit

                override fun onRenegotiationNeeded() = Unit

                override fun onTrack(transceiver: RtpTransceiver) {
                    if (stopped.get()) return
                    val track = transceiver.receiver.track()
                    if (track is VideoTrack) {
                        synchronized(lock) { if (session === this@Session) _videoTrack.value = track }
                    }
                    firstTrack.complete(Unit)
                }

                override fun onConnectionChange(state: PeerConnection.PeerConnectionState) {
                    if (stopped.get()) return
                    log("Peer connection state: $state")
                    val connected = isLivestreamConnected(state)
                    val dropped = wasConnected && !connected
                    wasConnected = connected
                    if (dropped) {
                        stop(this@Session)
                        return
                    }
                    synchronized(lock) { if (session === this@Session) _isConnected.value = connected }
                }
            }
    }
}

private suspend fun PeerConnection.createOfferAwait(): SessionDescription =
    suspendCancellableCoroutine { continuation ->
        createOffer(
            object : SdpObserver {
                override fun onCreateSuccess(description: SessionDescription?) {
                    if (description != null) {
                        continuation.resume(description)
                    } else {
                        continuation.resumeWithException(LivestreamException(LivestreamError.UnknownError))
                    }
                }

                override fun onCreateFailure(error: String?) {
                    continuation.resumeWithException(sdpFailure(error))
                }

                override fun onSetSuccess() = Unit

                override fun onSetFailure(error: String?) = Unit
            },
            MediaConstraints()
        )
    }

private suspend fun PeerConnection.setLocalDescriptionAwait(description: SessionDescription) =
    suspendCancellableCoroutine { continuation ->
        setLocalDescription(setObserver(continuation), description)
    }

private suspend fun PeerConnection.setRemoteDescriptionAwait(description: SessionDescription) =
    suspendCancellableCoroutine { continuation ->
        setRemoteDescription(setObserver(continuation), description)
    }

private fun setObserver(continuation: kotlinx.coroutines.CancellableContinuation<Unit>) = object : SdpObserver {
    override fun onCreateSuccess(description: SessionDescription?) = Unit

    override fun onCreateFailure(error: String?) = Unit

    override fun onSetSuccess() {
        continuation.resume(Unit)
    }

    override fun onSetFailure(error: String?) {
        continuation.resumeWithException(sdpFailure(error))
    }
}

private fun sdpFailure(message: String?) =
    LivestreamException(LivestreamError.UnknownError, cause = IllegalStateException(message))
