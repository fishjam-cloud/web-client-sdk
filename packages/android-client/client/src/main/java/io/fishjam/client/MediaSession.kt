package io.fishjam.client

import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import fishjam.sdk.SdkApi
import java.math.BigInteger
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera1Enumerator
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraEnumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RTCStatsCollectorCallback
import org.webrtc.RTCStatsReport
import org.webrtc.RtpParameters
import org.webrtc.RtpReceiver
import org.webrtc.RtpSender
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
internal object SharedEgl {
    val base: EglBase by lazy { EglBase.create() }
}

internal class MediaSession(
    context: Context,
    private val call: (SdkApi.SdkRequest) -> Unit,
    private val onMediaChanged: () -> Unit
) {
    private val appContext = context.applicationContext
    private val executor = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "fishjam-pc") }
    private val media = ConcurrentHashMap<String, MediaStreamTrack>()
    private val senderByTrackId = ConcurrentHashMap<String, RtpSender>()
    private val receiverByTrackId = ConcurrentHashMap<String, RtpReceiver>()
    private val fishjamIdByWebrtcId = ConcurrentHashMap<String, String>()
    private val midToTrackId = ConcurrentHashMap<String, String>()

    private var factory: PeerConnectionFactory? = null

    @Volatile
    private var connection: PeerConnection? = null

    @Volatile
    private var lastConnectionState = "new"

    @Volatile
    private var lastIceState = "new"
    private var capturer: CameraVideoCapturer? = null
    private var currentCameraName: String? = null
    private var videoSource: VideoSource? = null
    private var surface: SurfaceTextureHelper? = null
    private var localVideo: VideoTrack? = null
    private var audioSource: AudioSource? = null
    private var localAudio: AudioTrack? = null

    @Volatile
    private var appliedGeneration = 0

    fun mediaSnapshot(): Map<String, MediaStreamTrack> = HashMap(media)

    /**
     * WebRTC stats for the connection, or for the sender or receiver that
     * owns [trackId]. An empty list means there is no connection, the track
     * is unknown, or the stats call failed.
     */
    suspend fun statistics(trackId: String?): List<RtcStats> = suspendCancellableCoroutine { continuation ->
        val delivered = AtomicBoolean(false)
        fun deliver(stats: List<RtcStats>) {
            if (!delivered.compareAndSet(false, true)) return
            if (continuation.isActive) continuation.resume(stats)
        }
        try {
            executor.execute {
                val connection = connection
                if (connection == null) {
                    deliver(emptyList())
                    return@execute
                }
                val target =
                    try {
                        statsTarget(connection, trackId)
                    } catch (error: RuntimeException) {
                        Log.e(TAG, "getStats failed", error)
                        deliver(emptyList())
                        return@execute
                    }
                if (target == null) {
                    deliver(emptyList())
                    return@execute
                }
                val callback =
                    RTCStatsCollectorCallback { report ->
                        val stats = report.toRtcStats()
                        if (stats.isEmpty() && target != StatsTarget.Connection) {
                            connection.getStats { full -> deliver(full.toRtcStats()) }
                        } else {
                            deliver(stats)
                        }
                    }
                try {
                    when (target) {
                        StatsTarget.Connection -> connection.getStats(callback)
                        is StatsTarget.Sender -> connection.getStats(target.sender, callback)
                        is StatsTarget.Receiver -> connection.getStats(target.receiver, callback)
                    }
                } catch (error: RuntimeException) {
                    Log.e(TAG, "getStats failed", error)
                    deliver(emptyList())
                }
            }
        } catch (error: RuntimeException) {
            Log.e(TAG, "getStats failed", error)
            deliver(emptyList())
        }
    }

    private fun statsTarget(connection: PeerConnection, trackId: String?): StatsTarget? {
        if (trackId == null) return StatsTarget.Connection
        senderByTrackId[trackId]?.let { return StatsTarget.Sender(it) }
        receiverByTrackId[trackId]?.let { return StatsTarget.Receiver(it) }
        val track = media[trackId] ?: return null
        val webrtcId = track.id()
        connection.transceivers.firstOrNull { it.receiver.track()?.id() == webrtcId }?.let { transceiver ->
            return StatsTarget.Receiver(transceiver.receiver)
        }
        connection.transceivers.firstOrNull { it.sender.track()?.id() == webrtcId }?.let { transceiver ->
            return StatsTarget.Sender(transceiver.sender)
        }
        // The track is on screen, but a fresh transceiver list did not carry it.
        return StatsTarget.Connection
    }

    fun handle(event: SdkApi.SdkEvent) {
        executor.execute {
            when (event.contentCase) {
                SdkApi.SdkEvent.ContentCase.CREATE_PEER_CONNECTION -> openPeerConnection(event.createPeerConnection)
                SdkApi.SdkEvent.ContentCase.UPDATE_RECVONLY_TRANSCEIVERS ->
                    updateRecvonly(event.updateRecvonlyTransceivers)
                SdkApi.SdkEvent.ContentCase.ADD_SENDONLY_TRANSCEIVER -> addSendonly(event.addSendonlyTransceiver)
                SdkApi.SdkEvent.ContentCase.UPDATE_SEND_ENCODINGS ->
                    updateSendEncodings(event.updateSendEncodings)
                SdkApi.SdkEvent.ContentCase.REMOVE_SEND_TRACK -> removeSend(event.removeSendTrack.trackId)
                SdkApi.SdkEvent.ContentCase.CREATE_OFFER -> createOffer()
                SdkApi.SdkEvent.ContentCase.SET_LOCAL_DESCRIPTION -> setLocal(event.setLocalDescription)
                SdkApi.SdkEvent.ContentCase.SET_REMOTE_DESCRIPTION -> setRemote(event.setRemoteDescription)
                SdkApi.SdkEvent.ContentCase.ADD_ICE_CANDIDATE -> addRemoteCandidate(event.addIceCandidate)
                SdkApi.SdkEvent.ContentCase.CLOSE_PEER_CONNECTION -> closePeerConnection()
                else -> Unit
            }
        }
    }

    fun cameraDevices(): List<CameraDevice> {
        val enumerator = cameraEnumerator()
        return listedCameras(enumerator.deviceNames.toList()) { name -> enumerator.isFrontFacing(name) }
    }

    fun startCamera(generation: Int, deviceId: String?, stillCurrent: () -> Boolean): OpenedCamera? = await {
        if (generation != appliedGeneration || !stillCurrent()) {
            null
        } else {
            startCameraOnThread(deviceId)
        }
    }

    /**
     * Changes the open camera. The same [VideoTrack] stays on the sender.
     * A finished capture generation is ignored, including a switch error.
     */
    fun switchCamera(generation: Int, deviceId: String) {
        await {
            if (generation != appliedGeneration) return@await
            val device = requireListedCamera(cameraDevices(), deviceId)
            val current = capturer ?: throw CameraNotFoundException()
            if (currentCameraName == device.deviceId) return@await
            val done = CountDownLatch(1)
            var failure: String? = null
            current.switchCamera(
                object : CameraVideoCapturer.CameraSwitchHandler {
                    override fun onCameraSwitchDone(isFrontCamera: Boolean) {
                        done.countDown()
                    }

                    override fun onCameraSwitchError(errorDescription: String) {
                        failure = errorDescription
                        done.countDown()
                    }
                },
                device.deviceId
            )
            val finished = done.await(5, TimeUnit.SECONDS)
            if (generation != appliedGeneration) return@await
            if (!finished) throw IllegalStateException("Camera switch timed out")
            failure?.let { message -> throw IllegalStateException(message) }
            currentCameraName = device.deviceId
        }
    }

    fun startMicrophone(generation: Int, stillCurrent: () -> Boolean): AudioTrack? = await {
        if (generation != appliedGeneration || !stillCurrent()) {
            null
        } else {
            startMicrophoneOnThread()
        }
    }

    fun stopCamera(generation: Int) {
        await {
            if (generation == appliedGeneration) stopCameraOnThread()
        }
    }

    fun stopMicrophone(generation: Int) {
        await {
            if (generation == appliedGeneration) stopMicrophoneOnThread()
        }
    }

    fun releaseLocalDevices(generation: Int) {
        await {
            appliedGeneration = generation
            closePeerConnection()
            stopCameraOnThread()
            stopMicrophoneOnThread()
        }
    }

    fun bind(trackId: String, track: MediaStreamTrack, generation: Int) {
        await {
            if (generation != appliedGeneration) return@await
            if (track !== localVideo && track !== localAudio) return@await
            media[trackId] = track
            fishjamIdByWebrtcId[track.id()] = trackId
            onMediaChanged()
        }
    }

    fun close() {
        val done = CountDownLatch(1)
        executor.execute {
            try {
                appliedGeneration = Int.MIN_VALUE
                closePeerConnection()
                stopCameraOnThread()
                stopMicrophoneOnThread()
                factory?.dispose()
                factory = null
            } finally {
                done.countDown()
            }
        }
        done.await(2, TimeUnit.SECONDS)
        executor.shutdown()
    }

    private fun <T> await(block: () -> T): T {
        val result = arrayOfNulls<Any>(1)
        val error = arrayOfNulls<Throwable>(1)
        val done = CountDownLatch(1)
        executor.execute {
            try {
                result[0] = block()
            } catch (thrown: Throwable) {
                error[0] = thrown
            } finally {
                done.countDown()
            }
        }
        done.await()
        error[0]?.let { throw it }
        @Suppress("UNCHECKED_CAST")
        return result[0] as T
    }

    private fun ensureFactory(): PeerConnectionFactory {
        factory?.let { return it }
        val created = createPeerConnectionFactory(appContext)
        factory = created
        return created
    }

    private fun cameraEnumerator(): CameraEnumerator = if (Camera2Enumerator.isSupported(appContext)) {
        Camera2Enumerator(appContext)
    } else {
        Camera1Enumerator(false)
    }

    private fun startCameraOnThread(deviceId: String?): OpenedCamera {
        if (appContext.checkSelfPermission(android.Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            throw SecurityException("CAMERA permission is required")
        }
        localVideo?.let { track ->
            val name = currentCameraName ?: throw CameraNotFoundException()
            val device = cameraDevices().firstOrNull { camera -> camera.deviceId == name }
                ?: throw CameraNotFoundException()
            return OpenedCamera(track, device)
        }
        val devices = cameraDevices()
        if (devices.isEmpty()) throw CameraNotFoundException()
        val chosen =
            if (deviceId == null) {
                devices.firstOrNull { camera -> camera.front } ?: devices.first()
            } else {
                requireListedCamera(devices, deviceId)
            }
        val created =
            cameraEnumerator().createCapturer(chosen.deviceId, EmptyCameraEvents()) as? CameraVideoCapturer
                ?: throw CameraNotFoundException()
        val helper =
            SurfaceTextureHelper.create("FishjamCapture", SharedEgl.base.eglBaseContext)
                ?: throw IllegalStateException("Camera preview failed")
        val source = ensureFactory().createVideoSource(created.isScreencast)
        created.initialize(helper, appContext, source.capturerObserver)
        try {
            created.startCapture(1280, 720, 30)
        } catch (error: Exception) {
            created.dispose()
            source.dispose()
            helper.dispose()
            throw error
        }
        val track = ensureFactory().createVideoTrack(java.util.UUID.randomUUID().toString(), source)
        track.setEnabled(true)
        capturer = created
        currentCameraName = chosen.deviceId
        videoSource = source
        surface = helper
        localVideo = track
        return OpenedCamera(track, chosen)
    }

    private fun startMicrophoneOnThread(): AudioTrack {
        val granted =
            appContext.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED
        if (!granted) {
            throw SecurityException("RECORD_AUDIO permission is required")
        }
        localAudio?.let { return it }
        val source = ensureFactory().createAudioSource(MediaConstraints())
        val track = ensureFactory().createAudioTrack(java.util.UUID.randomUUID().toString(), source)
        track.setEnabled(true)
        audioSource = source
        localAudio = track
        return track
    }

    private fun stopCameraOnThread() {
        capturer?.let { current ->
            runCatching { current.stopCapture() }
            runCatching { current.dispose() }
        }
        capturer = null
        currentCameraName = null
        val track = localVideo
        localVideo = null
        if (track != null) {
            stopSender(track)
            runCatching { track.setEnabled(false) }
            forgetLocalTrack(track)
        }
        runCatching { videoSource?.dispose() }
        videoSource = null
        runCatching { surface?.dispose() }
        surface = null
        runCatching { track?.dispose() }
    }

    private fun stopMicrophoneOnThread() {
        val track = localAudio
        localAudio = null
        if (track != null) {
            stopSender(track)
            runCatching { track.setEnabled(false) }
            forgetLocalTrack(track)
            runCatching { track.dispose() }
        }
        runCatching { audioSource?.dispose() }
        audioSource = null
    }

    private fun stopSender(track: MediaStreamTrack) {
        val pc = connection ?: return
        val trackId = track.id()
        pc.transceivers.filter { it.sender.track()?.id() == trackId }.forEach { transceiver ->
            runCatching { pc.removeTrack(transceiver.sender) }
        }
    }

    private fun forgetLocalTrack(track: MediaStreamTrack) {
        media.entries.filter { it.value === track }.map { it.key }.forEach { id -> media.remove(id) }
        fishjamIdByWebrtcId.remove(track.id())
    }

    private fun openPeerConnection(request: SdkApi.CreatePeerConnection) {
        if (connection != null) return
        val iceServers =
            request.iceServersList.map { server ->
                PeerConnection.IceServer
                    .builder(server.urlsList)
                    .setUsername(server.username)
                    .setPassword(server.credential)
                    .createIceServer()
            }
        val config = PeerConnection.RTCConfiguration(iceServers)
        config.bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
        config.iceTransportsType = PeerConnection.IceTransportsType.ALL
        lastConnectionState = "new"
        lastIceState = "new"
        connection = ensureFactory().createPeerConnection(config, observer)
    }

    private fun updateRecvonly(update: SdkApi.UpdateRecvonlyTransceivers) {
        val pc = connection ?: return
        update.midsToStopList.forEach { mid ->
            pc.transceivers.firstOrNull { it.mid == mid }?.stop()
        }
        repeat(update.videoToAdd) { addRecvonly(MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO) }
        repeat(update.audioToAdd) { addRecvonly(MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO) }
    }

    private fun addRecvonly(mediaType: MediaStreamTrack.MediaType) {
        connection?.addTransceiver(
            mediaType,
            RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.RECV_ONLY)
        )
    }

    private fun addSendonly(request: SdkApi.AddSendonlyTransceiver) {
        val pc = connection ?: return
        val track = media[request.trackId]
        if (track == null) {
            Log.e(TAG, "addSendonly: no media for track ${request.trackId}")
            return
        }
        val encodings = request.sendEncodingsList.map(::rtpEncoding)
        val transceiver =
            pc.addTransceiver(
                track,
                RtpTransceiver.RtpTransceiverInit(
                    RtpTransceiver.RtpTransceiverDirection.SEND_ONLY,
                    listOf(track.id()),
                    encodings
                )
            )
        if (transceiver != null) senderByTrackId[request.trackId] = transceiver.sender
    }

    private fun updateSendEncodings(update: SdkApi.UpdateSendEncodings) {
        val pc = connection ?: return
        val track = media[update.trackId] ?: return
        val sender =
            pc.transceivers.firstOrNull { it.sender.track()?.id() == track.id() }?.sender ?: return
        val params = sender.parameters
        val current = params.encodings
        if (current.isEmpty()) {
            params.encodings = update.sendEncodingsList.map(::rtpEncoding)
        } else {
            update.sendEncodingsList.forEach { encoding ->
                val target =
                    current.firstOrNull { it.rid == encoding.rid }
                        ?: current.firstOrNull().takeIf { encoding.rid.isEmpty() }
                target?.apply {
                    active = encoding.active
                    if (encoding.scaleResolutionDownBy > 0) {
                        scaleResolutionDownBy = encoding.scaleResolutionDownBy
                    }
                    maxBitrateBps = encoding.maxBitrate.takeIf { it > 0 }
                }
            }
        }
        if (!sender.setParameters(params)) {
            Log.e(TAG, "setParameters failed for ${update.trackId}")
        }
    }

    private fun rtpEncoding(encoding: SdkApi.SendEncoding): RtpParameters.Encoding {
        val scale = encoding.scaleResolutionDownBy.takeIf { it > 0 }
        return RtpParameters.Encoding(encoding.rid, encoding.active, scale).apply {
            if (encoding.maxBitrate > 0) maxBitrateBps = encoding.maxBitrate
        }
    }

    private fun removeSend(trackId: String) {
        val pc = connection ?: return
        val track = media.remove(trackId)
        if (track == null) return
        fishjamIdByWebrtcId.remove(track.id())
        senderByTrackId.remove(trackId)
        pc.transceivers.firstOrNull { it.sender.track()?.id() == track.id() }?.let { transceiver ->
            pc.removeTrack(transceiver.sender)
        }
        onMediaChanged()
    }

    private fun createOffer() {
        val pc = connection ?: return
        pc.createOffer(
            object : SdpObserver {
                override fun onCreateSuccess(description: SessionDescription?) {
                    val sdp = description?.description ?: return
                    executor.execute {
                        call(
                            SdkApi.SdkRequest
                                .newBuilder()
                                .setCreateOfferResult(
                                    SdkApi.CreateOfferResult
                                        .newBuilder()
                                        .setSdp(sdp)
                                ).build()
                        )
                    }
                }

                override fun onSetSuccess() = Unit

                override fun onCreateFailure(error: String?) {
                    Log.e(TAG, "createOffer failed: $error")
                }

                override fun onSetFailure(error: String?) = Unit
            },
            MediaConstraints()
        )
    }

    private fun setLocal(description: SdkApi.SetLocalDescription) {
        val pc = connection ?: return
        pc.setLocalDescription(
            object : SdpObserver {
                override fun onCreateSuccess(description: SessionDescription?) = Unit

                override fun onSetSuccess() {
                    executor.execute {
                        val mids = HashMap<String, String>()
                        pc.transceivers.forEach { transceiver ->
                            val mid = transceiver.mid ?: return@forEach
                            val webrtcId = transceiver.sender.track()?.id() ?: return@forEach
                            val trackId = fishjamIdByWebrtcId[webrtcId] ?: return@forEach
                            mids[mid] = trackId
                        }
                        call(
                            SdkApi.SdkRequest
                                .newBuilder()
                                .setSetLocalDescriptionResult(
                                    SdkApi.SetLocalDescriptionResult
                                        .newBuilder()
                                        .putAllMidToTrackId(mids)
                                ).build()
                        )
                    }
                }

                override fun onCreateFailure(error: String?) = Unit

                override fun onSetFailure(error: String?) {
                    Log.e(TAG, "setLocalDescription failed: $error")
                }
            },
            SessionDescription(sessionType(description.type), description.sdp)
        )
    }

    private fun setRemote(description: SdkApi.SetRemoteDescription) {
        val pc = connection ?: return
        midToTrackId.putAll(description.midToTrackIdMap)
        description.midToTrackIdMap.forEach { (mid, trackId) ->
            pendingRemote.remove(mid)?.let { track ->
                rememberRemote(trackId, track, pendingReceiver.remove(mid))
            }
        }
        pc.setRemoteDescription(
            object : SdpObserver {
                override fun onCreateSuccess(description: SessionDescription?) = Unit

                override fun onSetSuccess() {
                    executor.execute {
                        attachRemoteReceivers(pc)
                        call(
                            SdkApi.SdkRequest
                                .newBuilder()
                                .setSetRemoteDescriptionResult(SdkApi.SetRemoteDescriptionResult.getDefaultInstance())
                                .build()
                        )
                    }
                }

                override fun onCreateFailure(error: String?) = Unit

                override fun onSetFailure(error: String?) {
                    Log.e(TAG, "setRemoteDescription failed: $error")
                }
            },
            SessionDescription(sessionType(description.type), description.sdp)
        )
    }

    private val pendingRemote = ConcurrentHashMap<String, MediaStreamTrack>()
    private val pendingReceiver = ConcurrentHashMap<String, RtpReceiver>()

    private fun addRemoteCandidate(candidate: SdkApi.AddIceCandidate) {
        val pc = connection ?: return
        pc.addIceCandidate(IceCandidate(candidate.sdpMid, candidate.sdpMLineIndex, candidate.candidate))
        call(
            SdkApi.SdkRequest
                .newBuilder()
                .setAddIceCandidateResult(SdkApi.AddIceCandidateResult.getDefaultInstance())
                .build()
        )
    }

    private fun closePeerConnection() {
        val pc = connection
        connection = null
        // Local tracks stay. A reconnect closes this connection and opens
        // another, and the new one still sends those tracks.
        val localIds = fishjamIdByWebrtcId.values.toSet()
        media.keys.toList().forEach { trackId ->
            if (trackId !in localIds) media.remove(trackId)
        }
        midToTrackId.clear()
        pendingRemote.clear()
        pendingReceiver.clear()
        senderByTrackId.clear()
        receiverByTrackId.clear()
        onMediaChanged()
        pc?.dispose()
    }

    /**
     * The same receive transceiver is reused when a peer leaves and comes
     * back, and [PeerConnection.Observer.onTrack] does not run again. The
     * receiver's track is still the one carrying the new camera.
     */
    private fun attachRemoteReceivers(pc: PeerConnection) {
        val localIds = fishjamIdByWebrtcId.values.toSet()
        pc.transceivers.forEach { transceiver ->
            val direction = transceiver.direction
            if (
                direction != RtpTransceiver.RtpTransceiverDirection.RECV_ONLY &&
                direction != RtpTransceiver.RtpTransceiverDirection.SEND_RECV
            ) {
                return@forEach
            }
            val mid = transceiver.mid ?: return@forEach
            val trackId = midToTrackId[mid] ?: return@forEach
            if (trackId in localIds) return@forEach
            val track = transceiver.receiver.track() ?: return@forEach
            rememberRemote(trackId, track, transceiver.receiver)
        }
    }

    private val observer =
        object : PeerConnection.Observer {
            override fun onSignalingChange(state: PeerConnection.SignalingState) = Unit

            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
                reportState(ice = state.name.lowercase())
            }

            override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit

            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) = Unit

            override fun onIceCandidate(candidate: IceCandidate?) {
                if (candidate == null || candidate.sdp.isEmpty()) return
                executor.execute {
                    call(
                        SdkApi.SdkRequest
                            .newBuilder()
                            .setLocalIceCandidate(
                                SdkApi.LocalIceCandidate
                                    .newBuilder()
                                    .setCandidate(candidate.sdp)
                                    .setSdpMid(candidate.sdpMid ?: "")
                                    .setSdpMLineIndex(candidate.sdpMLineIndex)
                                    .setUsernameFragment("")
                            ).build()
                    )
                }
            }

            override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) = Unit

            override fun onAddStream(stream: org.webrtc.MediaStream) = Unit

            override fun onRemoveStream(stream: org.webrtc.MediaStream) = Unit

            override fun onDataChannel(channel: org.webrtc.DataChannel) = Unit

            override fun onRenegotiationNeeded() = Unit

            override fun onTrack(transceiver: RtpTransceiver) {
                val mid = transceiver.mid ?: return
                val track = transceiver.receiver.track() ?: return
                val receiver = transceiver.receiver
                executor.execute {
                    val trackId = midToTrackId[mid]
                    if (trackId == null) {
                        pendingRemote[mid] = track
                        pendingReceiver[mid] = receiver
                    } else {
                        rememberRemote(trackId, track, receiver)
                    }
                    call(
                        SdkApi.SdkRequest
                            .newBuilder()
                            .setRemoteTrackReady(
                                SdkApi.RemoteTrackReady
                                    .newBuilder()
                                    .setMid(mid)
                            ).build()
                    )
                }
            }

            override fun onConnectionChange(state: PeerConnection.PeerConnectionState) {
                reportState(connectionState = state.name.lowercase())
            }
        }

    private fun rememberRemote(trackId: String, track: MediaStreamTrack, receiver: RtpReceiver?) {
        media[trackId] = track
        if (receiver != null) receiverByTrackId[trackId] = receiver
        onMediaChanged()
    }

    private fun reportState(connectionState: String? = null, ice: String? = null) {
        if (this.connection == null) return
        if (connectionState != null) lastConnectionState = connectionState
        if (ice != null) lastIceState = ice
        val connectionValue = lastConnectionState
        val iceValue = lastIceState
        executor.execute {
            call(
                SdkApi.SdkRequest
                    .newBuilder()
                    .setPeerConnectionStateChanged(
                        SdkApi.PeerConnectionStateChanged
                            .newBuilder()
                            .setConnectionState(connectionValue)
                            .setIceConnectionState(iceValue)
                    ).build()
            )
        }
    }

    private fun sessionType(type: SdkApi.SdpType): SessionDescription.Type = when (type) {
        SdkApi.SdpType.SDP_TYPE_ANSWER -> SessionDescription.Type.ANSWER
        else -> SessionDescription.Type.OFFER
    }

    private companion object {
        const val TAG = "Fishjam"
    }
}

private sealed class StatsTarget {
    data object Connection : StatsTarget()

    data class Sender(val sender: RtpSender) : StatsTarget()

    data class Receiver(val receiver: RtpReceiver) : StatsTarget()
}

private fun RTCStatsReport.toRtcStats(): List<RtcStats> = statsMap.values.map { stat ->
    val members = LinkedHashMap<String, RtcStatMember>()
    stat.members.forEach { (key, value) ->
        memberOf(value)?.let { member -> members[key] = member }
    }
    RtcStats(
        id = stat.id,
        type = stat.type,
        timestampUs = stat.timestampUs.toLong(),
        members = members
    )
}

private fun memberOf(value: Any?): RtcStatMember? = when (value) {
    is Boolean -> RtcStatMember.Bool(value)
    is BigInteger -> RtcStatMember.Number(value.toDouble())
    is Byte, is Short, is Int, is Long, is Float, is Double -> RtcStatMember.Number((value as Number).toDouble())
    is String -> RtcStatMember.Text(value)
    else -> null
}

private class EmptyCameraEvents : CameraVideoCapturer.CameraEventsHandler {
    override fun onCameraError(errorDescription: String) = Unit

    override fun onCameraDisconnected() = Unit

    override fun onCameraFreezed(errorDescription: String) = Unit

    override fun onCameraOpening(cameraName: String) = Unit

    override fun onFirstFrameAvailable() = Unit

    override fun onCameraClosed() = Unit
}
