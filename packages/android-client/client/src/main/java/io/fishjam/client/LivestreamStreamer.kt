package io.fishjam.client

import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
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
import kotlinx.coroutines.withTimeoutOrNull
import org.webrtc.AudioTrack
import org.webrtc.PeerConnection
import org.webrtc.RtpTransceiver
import org.webrtc.SessionDescription
import org.webrtc.VideoTrack

private const val PUBLISH_ICE_GATHERING_TIMEOUT_MS = 3_000L
private const val STREAMER_TAG = "FishjamLivestream"

/**
 * Publishes a WHIP livestream from tracks created by [client], independent of any room connection.
 *
 * Start the camera or microphone on [client], then call [connect] with those tracks and a streamer token.
 * At least one of [video] or [audio] is required. Calling [connect] again replaces the stream that is
 * already running. If the connection drops after it was established, the streamer disconnects.
 * [disconnect] does not stop the camera or microphone: [client] owns those tracks.
 */
class LivestreamStreamer(
    private val client: FishjamClient,
    private val debug: Boolean = false
) : AutoCloseable {
    private val whipUrl = livestreamWhipUrl(client.fishjamId)
    private val signaling = WebRtcHttpSignaling(errorForStatus = ::livestreamPublishErrorForStatus)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val connectLock = Mutex()
    private val lock = Any()
    private val closed = AtomicBoolean(false)
    private var session: Session? = null
    private var lastStop: Job? = null

    private val _isConnected = MutableStateFlow(false)

    /** `true` while the peer connection is connected. */
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private val _error = MutableStateFlow<LivestreamError?>(null)

    /** The error of the last [connect], or `null`. Cleared when the next [connect] starts. */
    val error: StateFlow<LivestreamError?> = _error.asStateFlow()

    /**
     * Starts publishing and returns once the server has accepted the offer. Any stream published before is
     * disconnected first. [url] replaces the WHIP endpoint of [client].
     *
     * Throws [IllegalArgumentException] when both [video] and [audio] are null.
     * Throws [LivestreamException] and also publishes it in [error]. A [disconnect] during connecting
     * cancels the call with a [CancellationException].
     */
    suspend fun connect(video: VideoTrack? = null, audio: AudioTrack? = null, token: String, url: String? = null) {
        if (video == null && audio == null) {
            throw IllegalArgumentException(
                "To publish a livestream with WHIP, you need to supply at least one video or audio track."
            )
        }
        connectLock.withLock {
            check(!closed.get()) { "The LivestreamStreamer is closed." }
            stopCurrent()
            _error.value = null
            val target = openSession(token)
            try {
                negotiate(target, url ?: whipUrl, video, audio)
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

    /** Stops publishing. Does nothing when nothing is publishing. The tracks keep running. */
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
                Log.e(STREAMER_TAG, "getStats failed", error)
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
            scope.cancel()
        }
    }

    private fun log(message: String) {
        if (debug) Log.d(STREAMER_TAG, message)
    }

    private fun openSession(token: String): Session {
        val factory = client.peerConnectionFactory()
        val target = Session(token)
        val config =
            PeerConnection.RTCConfiguration(emptyList()).apply {
                bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
                sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            }
        val connection =
            factory.createPeerConnection(config, target.observer)
                ?: throw LivestreamException(LivestreamError.UnknownError)
        target.connection = connection
        synchronized(lock) { session = target }
        return target
    }

    private suspend fun negotiate(target: Session, url: String, video: VideoTrack?, audio: AudioTrack?) {
        val connection = checkNotNull(target.connection)
        val sendOnly = RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.SEND_ONLY)
        if (video != null) connection.addTransceiver(video, sendOnly)
        if (audio != null) connection.addTransceiver(audio, sendOnly)

        connection.setLocalDescriptionAwait(connection.createOfferAwait())
        if (connection.iceGatheringState() == PeerConnection.IceGatheringState.COMPLETE) {
            target.gathered.complete(Unit)
        }
        val completed = withTimeoutOrNull(PUBLISH_ICE_GATHERING_TIMEOUT_MS) { target.gathered.await() }
        if (completed == null) log("ICE gathering did not finish in time; sending the candidates found so far")
        val offer =
            connection.localDescription?.description
                ?: throw LivestreamException(LivestreamError.UnknownError)

        val answer = withContext(Dispatchers.IO) { signaling.postOffer(url, target.token, offer) }
        target.resource = answer.resource
        connection.setRemoteDescriptionAwait(SessionDescription(SessionDescription.Type.ANSWER, answer.sdp))
        if (target.stopped.get()) throw LivestreamException(LivestreamError.UnknownError)
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
                _isConnected.value = false
            }
        }
        target.gathered.complete(Unit)
        val job =
            scope.launch {
                target.resource?.let { signaling.delete(it, target.token) }
                target.connection?.close()
                target.connection?.dispose()
            }
        synchronized(lock) { lastStop = job }
    }

    private inner class Session(val token: String) {
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

                override fun onTrack(transceiver: RtpTransceiver) = Unit

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
