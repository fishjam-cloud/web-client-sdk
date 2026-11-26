package io.fishjam.client

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjection
import android.util.DisplayMetrics
import android.util.Log
import android.view.OrientationEventListener
import android.view.WindowManager
import java.math.BigInteger
import java.util.Collections
import java.util.IdentityHashMap
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
import org.webrtc.ScreenCapturerAndroid
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import uniffi.fishjam_core.CoreEvent
import uniffi.fishjam_core.CoreIceServer
import uniffi.fishjam_core.CoreSdpType
import uniffi.fishjam_core.CoreSendEncoding
import uniffi.fishjam_core.FishjamCoreClient

internal object SharedEgl {
    val base: EglBase by lazy { EglBase.create() }
}

internal class MediaSession(
    context: Context,
    /** `null` once the client is closed. */
    private val core: () -> FishjamCoreClient?,
    private val onMediaChanged: () -> Unit,
    private val onScreenCaptureStopped: (() -> Unit)? = null,
    private val dataChannels: DataChannels? = null
) {
    private val appContext = context.applicationContext
    private val executor = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "fishjam-pc") }
    private val media = ConcurrentHashMap<String, MediaStreamTrack>()

    // Keeps the sender id, not the RtpSender. WebRTC disposes the senders it handed out each time
    // `transceivers` is read, so the sender is looked up again by this id whenever it is needed.
    private val senderIdByTrackId = ConcurrentHashMap<String, String>()
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
    private var screenCapturer: VideoCapturer? = null
    private var screenSource: VideoSource? = null
    private var screenSurface: SurfaceTextureHelper? = null
    private var localScreen: VideoTrack? = null
    private val customTracks = Collections.newSetFromMap(IdentityHashMap<MediaStreamTrack, Boolean>())
    private var screenWidth = 0
    private var screenHeight = 0
    private var screenOrientationListener: OrientationEventListener? = null

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
                    if (target == StatsTarget.Connection) {
                        Log.e(TAG, "getStats failed", error)
                        deliver(emptyList())
                    } else {
                        Log.w(TAG, "getStats failed for the track, using the connection report", error)
                        try {
                            connection.getStats(callback)
                        } catch (fallback: RuntimeException) {
                            Log.e(TAG, "getStats failed", fallback)
                            deliver(emptyList())
                        }
                    }
                }
            }
        } catch (error: RuntimeException) {
            Log.e(TAG, "getStats failed", error)
            deliver(emptyList())
        }
    }

    private fun senderFor(pc: PeerConnection, trackId: String): RtpSender? {
        val id = senderIdByTrackId[trackId] ?: return null
        return pc.transceivers.firstOrNull { it.sender.id() == id }?.sender
    }

    private fun statsTarget(connection: PeerConnection, trackId: String?): StatsTarget? {
        if (trackId == null) return StatsTarget.Connection
        senderFor(connection, trackId)?.let { return StatsTarget.Sender(it) }
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

    fun handle(event: CoreEvent) {
        executor.execute {
            when (event) {
                is CoreEvent.CreatePeerConnection -> openPeerConnection(event.iceServers)
                is CoreEvent.UpdateRecvonlyTransceivers -> updateRecvonly(event)
                is CoreEvent.AddSendonlyTransceiver -> addSendonly(event.trackId, event.sendEncodings)
                is CoreEvent.UpdateSendEncodings -> updateSendEncodings(event.trackId, event.sendEncodings)
                is CoreEvent.RemoveSendTrack -> removeSend(event.trackId)
                is CoreEvent.CreateOffer -> createOffer()
                is CoreEvent.SetLocalDescription -> setLocal(event.sdpType, event.sdp)
                is CoreEvent.SetRemoteDescription -> setRemote(event.sdpType, event.sdp, event.midToTrackId)
                is CoreEvent.AddIceCandidate -> addRemoteCandidate(event)
                is CoreEvent.ClosePeerConnection -> closePeerConnection()
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

    fun startScreenCapture(
        generation: Int,
        mediaProjectionPermissionResultData: Intent,
        stillCurrent: () -> Boolean
    ): VideoTrack? = await {
        if (generation != appliedGeneration || !stillCurrent()) {
            null
        } else {
            startScreenCaptureOnThread(mediaProjectionPermissionResultData)
        }
    }

    fun stopScreenCapture(generation: Int) {
        await {
            if (generation == appliedGeneration) stopScreenCaptureOnThread()
        }
    }

    /** Stops capture after the room generation has already moved on, as on leave. */
    fun endScreenCapture() {
        await { stopScreenCaptureOnThread() }
    }

    fun releaseLocalDevices(generation: Int) {
        await {
            appliedGeneration = generation
            closePeerConnection()
            stopCameraOnThread()
            stopMicrophoneOnThread()
            stopScreenCaptureOnThread()
        }
    }

    fun createCustomVideoTrack(): Pair<VideoSource, VideoTrack> = await {
        val source = ensureFactory().createVideoSource(false)
        source.capturerObserver.onCapturerStarted(true)
        val track = ensureFactory().createVideoTrack(java.util.UUID.randomUUID().toString(), source)
        track.setEnabled(true)
        customTracks.add(track)
        source to track
    }

    fun unregisterCustomTrack(track: MediaStreamTrack) {
        await {
            customTracks.remove(track)
            forgetLocalTrack(track)
        }
    }

    fun bind(trackId: String, track: MediaStreamTrack, generation: Int) {
        await {
            val custom = customTracks.contains(track)
            if (!custom && generation != appliedGeneration) return@await
            if (!custom && track !== localVideo && track !== localAudio && track !== localScreen) return@await
            media[trackId] = track
            fishjamIdByWebrtcId[track.id()] = trackId
            onMediaChanged()
        }
    }

    /**
     * Puts [track] on the sender of [trackId] in place of the current media. The track id does not change.
     * When the sender does not exist yet, the new media is used when it is added.
     */
    fun replaceMedia(trackId: String, track: MediaStreamTrack) {
        await {
            media[trackId]?.let { previous -> fishjamIdByWebrtcId.remove(previous.id()) }
            media[trackId] = track
            fishjamIdByWebrtcId[track.id()] = trackId
            connection?.let { pc -> senderFor(pc, trackId)?.setTrack(track, false) }
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
                stopScreenCaptureOnThread()
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

    internal fun peerConnectionFactory(): PeerConnectionFactory = await { ensureFactory() }

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

    private fun startScreenCaptureOnThread(mediaProjectionPermissionResultData: Intent): VideoTrack {
        localScreen?.let { return it }
        val size = screenCaptureSize()
        screenWidth = size.first
        screenHeight = size.second
        val created =
            ScreenCapturerAndroid(
                mediaProjectionPermissionResultData,
                object : MediaProjection.Callback() {
                    override fun onStop() {
                        Log.w(TAG, "Media projection stopped")
                        executor.execute {
                            if (localScreen == null) return@execute
                            stopScreenCaptureOnThread()
                            onScreenCaptureStopped?.invoke()
                        }
                    }
                }
            )
        val helper =
            SurfaceTextureHelper.create("FishjamScreenCapture", SharedEgl.base.eglBaseContext)
                ?: throw IllegalStateException("Screen capture preview failed")
        val source = ensureFactory().createVideoSource(created.isScreencast)
        val observer = FrameRepeatingCapturerObserver(source.capturerObserver, helper.handler)
        created.initialize(helper, appContext, observer)
        try {
            created.startCapture(screenWidth, screenHeight, SCREEN_CAPTURE_FPS)
        } catch (error: Exception) {
            created.dispose()
            source.dispose()
            helper.dispose()
            throw error
        }
        val track = ensureFactory().createVideoTrack(java.util.UUID.randomUUID().toString(), source)
        track.setEnabled(true)
        screenCapturer = created
        screenSource = source
        screenSurface = helper
        localScreen = track
        startScreenOrientationListener()
        return track
    }

    private fun startScreenOrientationListener() {
        screenOrientationListener?.disable()
        val listener =
            object : OrientationEventListener(appContext) {
                override fun onOrientationChanged(orientation: Int) {
                    val size = screenCaptureSize()
                    if (size.first == screenWidth && size.second == screenHeight) return
                    screenWidth = size.first
                    screenHeight = size.second
                    executor.execute {
                        runCatching {
                            screenCapturer?.changeCaptureFormat(screenWidth, screenHeight, SCREEN_CAPTURE_FPS)
                        }
                    }
                }
            }
        if (listener.canDetectOrientation()) {
            listener.enable()
            screenOrientationListener = listener
        }
    }

    private fun stopScreenCaptureOnThread() {
        screenOrientationListener?.disable()
        screenOrientationListener = null
        val current = screenCapturer
        screenCapturer = null
        val track = localScreen
        // Clear this before dispose. dispose stops the projection, and its onStop
        // callback must not treat our own stop as the user ending the share.
        localScreen = null
        current?.let {
            runCatching { it.stopCapture() }
            runCatching { it.dispose() }
        }
        if (track != null) {
            stopSender(track)
            runCatching { track.setEnabled(false) }
            forgetLocalTrack(track)
        }
        runCatching { screenSource?.dispose() }
        screenSource = null
        runCatching { screenSurface?.dispose() }
        screenSurface = null
        runCatching { track?.dispose() }
        screenWidth = 0
        screenHeight = 0
    }

    private fun screenCaptureSize(): Pair<Int, Int> {
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        (appContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager)
            .defaultDisplay
            .getRealMetrics(metrics)
        return screenCaptureSizeFor(metrics.widthPixels, metrics.heightPixels, SCREEN_CAPTURE_MAX_EDGE)
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

    private fun openPeerConnection(servers: List<CoreIceServer>) {
        if (connection != null) return
        val iceServers =
            servers.map { server ->
                PeerConnection.IceServer
                    .builder(server.urls)
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

    private fun updateRecvonly(update: CoreEvent.UpdateRecvonlyTransceivers) {
        val pc = connection ?: return
        update.midsToStop.forEach { mid ->
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

    private fun addSendonly(trackId: String, sendEncodings: List<CoreSendEncoding>) {
        val pc = connection ?: return
        val track = media[trackId]
        if (track == null) {
            Log.e(TAG, "addSendonly: no media for track $trackId")
            return
        }
        val encodings = sendEncodings.map(::rtpEncoding)
        val transceiver =
            pc.addTransceiver(
                track,
                RtpTransceiver.RtpTransceiverInit(
                    RtpTransceiver.RtpTransceiverDirection.SEND_ONLY,
                    listOf(track.id()),
                    encodings
                )
            )
        if (transceiver == null) {
            Log.e(TAG, "addSendonly: addTransceiver failed for track $trackId")
            return
        }
        senderIdByTrackId[trackId] = transceiver.sender.id()
        Log.i(TAG, "addSendonly: ${track.kind()} track $trackId, ${encodings.size} encodings")
    }

    private fun updateSendEncodings(trackId: String, sendEncodings: List<CoreSendEncoding>) {
        val pc = connection ?: return
        val track = media[trackId] ?: return
        val sender =
            pc.transceivers.firstOrNull { it.sender.track()?.id() == track.id() }?.sender ?: return
        val params = sender.parameters
        val current = params.encodings
        if (current.isEmpty()) {
            params.encodings = sendEncodings.map(::rtpEncoding)
        } else {
            sendEncodings.forEach { encoding ->
                val target =
                    current.firstOrNull { it.rid == encoding.rid }
                        ?: current.firstOrNull().takeIf { encoding.rid.isEmpty() }
                target?.apply {
                    active = encoding.active
                    if (encoding.scaleResolutionDownBy > 0) {
                        scaleResolutionDownBy = encoding.scaleResolutionDownBy
                    }
                    maxBitrateBps = encoding.maxBitrate.toInt().takeIf { it > 0 }
                }
            }
        }
        if (!sender.setParameters(params)) {
            Log.e(TAG, "setParameters failed for $trackId")
        }
    }

    private fun rtpEncoding(encoding: CoreSendEncoding): RtpParameters.Encoding {
        val scale = encoding.scaleResolutionDownBy.takeIf { it > 0 }
        return RtpParameters.Encoding(encoding.rid, encoding.active, scale).apply {
            if (encoding.maxBitrate > 0u) maxBitrateBps = encoding.maxBitrate.toInt()
        }
    }

    private fun removeSend(trackId: String) {
        val pc = connection ?: return
        val track = media.remove(trackId)
        track?.let { fishjamIdByWebrtcId.remove(it.id()) }
        // The media can already be gone, for example when the app stopped a custom track first.
        // The sender must still leave the connection, or the next offer keeps sending the track.
        val sender = senderFor(pc, trackId)
            ?: track?.let { found -> pc.transceivers.firstOrNull { it.sender.track()?.id() == found.id() }?.sender }
        senderIdByTrackId.remove(trackId)
        sender?.let { pc.removeTrack(it) }
        onMediaChanged()
    }

    private fun createOffer() {
        val pc = connection ?: return
        dataChannels?.let { channels ->
            channels.createMissing { type -> WebRtcDataChannelLink.create(pc, type, channels) }
        }
        pc.createOffer(
            object : SdpObserver {
                override fun onCreateSuccess(description: SessionDescription?) {
                    val sdp = description?.description ?: return
                    executor.execute { core()?.createOfferResult(sdp) }
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

    private fun setLocal(type: CoreSdpType, sdp: String) {
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
                        core()?.setLocalDescriptionResult(mids)
                    }
                }

                override fun onCreateFailure(error: String?) = Unit

                override fun onSetFailure(error: String?) {
                    Log.e(TAG, "setLocalDescription failed: $error")
                }
            },
            SessionDescription(sessionType(type), sdp)
        )
    }

    private fun setRemote(type: CoreSdpType, sdp: String, mids: Map<String, String>) {
        val pc = connection ?: return
        midToTrackId.putAll(mids)
        mids.forEach { (mid, trackId) ->
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
                        core()?.setRemoteDescriptionResult()
                    }
                }

                override fun onCreateFailure(error: String?) = Unit

                override fun onSetFailure(error: String?) {
                    Log.e(TAG, "setRemoteDescription failed: $error")
                }
            },
            SessionDescription(sessionType(type), sdp)
        )
    }

    private val pendingRemote = ConcurrentHashMap<String, MediaStreamTrack>()
    private val pendingReceiver = ConcurrentHashMap<String, RtpReceiver>()

    // The track and receiver from onTrack, by mid. WebRTC disposes the ones read from
    // `transceivers` on the next read, which removes the track's video sinks.
    private val remoteByMid = ConcurrentHashMap<String, Pair<MediaStreamTrack, RtpReceiver>>()

    private fun addRemoteCandidate(candidate: CoreEvent.AddIceCandidate) {
        val pc = connection ?: return
        pc.addIceCandidate(IceCandidate(candidate.sdpMid, candidate.sdpMLineIndex, candidate.candidate))
        core()?.addIceCandidateResult()
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
        remoteByMid.clear()
        senderIdByTrackId.clear()
        receiverByTrackId.clear()
        onMediaChanged()
        dataChannels?.reset()
        pc?.dispose()
    }

    /**
     * The same receive transceiver is reused when a peer leaves and comes
     * back, and [PeerConnection.Observer.onTrack] does not run again. The
     * track saved from the first onTrack for that mid still carries the new camera.
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
            val (track, receiver) = remoteByMid[mid] ?: return@forEach
            rememberRemote(trackId, track, receiver)
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
                    core()?.localIceCandidate(candidate.sdp, candidate.sdpMid ?: "", candidate.sdpMLineIndex, "")
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
                    remoteByMid[mid] = track to receiver
                    if (trackId == null) {
                        pendingRemote[mid] = track
                        pendingReceiver[mid] = receiver
                    } else {
                        rememberRemote(trackId, track, receiver)
                    }
                    core()?.remoteTrackReady(mid)
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
        executor.execute { core()?.peerConnectionStateChanged(connectionValue, iceValue) }
    }

    private fun sessionType(type: CoreSdpType): SessionDescription.Type = when (type) {
        CoreSdpType.ANSWER -> SessionDescription.Type.ANSWER
        CoreSdpType.OFFER -> SessionDescription.Type.OFFER
    }

    private companion object {
        const val TAG = "Fishjam"
        const val SCREEN_CAPTURE_FPS = 30
        const val SCREEN_CAPTURE_MAX_EDGE = 1280f
    }
}

/** Scales display pixels so the longer edge is at most [maxEdge]. */
internal fun screenCaptureSizeFor(widthPixels: Int, heightPixels: Int, maxEdge: Float): Pair<Int, Int> {
    val width = widthPixels.coerceAtLeast(1)
    val height = heightPixels.coerceAtLeast(1)
    val longest = maxOf(width, height).toFloat()
    val scale = if (longest > maxEdge) maxEdge / longest else 1f
    return (width * scale).toInt().coerceAtLeast(1) to (height * scale).toInt().coerceAtLeast(1)
}

private sealed class StatsTarget {
    data object Connection : StatsTarget()

    data class Sender(val sender: RtpSender) : StatsTarget()

    data class Receiver(val receiver: RtpReceiver) : StatsTarget()
}

internal fun RTCStatsReport.toRtcStats(): List<RtcStats> = statsMap.values.map { stat ->
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
