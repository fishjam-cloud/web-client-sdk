package io.fishjam.client

import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import fishjam.sdk.SdkApi
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera1Enumerator
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpParameters
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import org.webrtc.audio.JavaAudioDeviceModule

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
    private val fishjamIdByWebrtcId = ConcurrentHashMap<String, String>()
    private val midToTrackId = ConcurrentHashMap<String, String>()

    private var factory: PeerConnectionFactory? = null

    @Volatile
    private var connection: PeerConnection? = null

    @Volatile
    private var lastConnectionState = "new"

    @Volatile
    private var lastIceState = "new"
    private var capturer: VideoCapturer? = null
    private var videoSource: VideoSource? = null
    private var surface: SurfaceTextureHelper? = null
    private var localVideo: VideoTrack? = null
    private var audioSource: AudioSource? = null
    private var localAudio: AudioTrack? = null

    fun mediaSnapshot(): Map<String, MediaStreamTrack> = HashMap(media)

    fun handle(event: SdkApi.SdkEvent) {
        executor.execute {
            when (event.contentCase) {
                SdkApi.SdkEvent.ContentCase.CREATE_PEER_CONNECTION -> openPeerConnection(event.createPeerConnection)
                SdkApi.SdkEvent.ContentCase.UPDATE_RECVONLY_TRANSCEIVERS ->
                    updateRecvonly(event.updateRecvonlyTransceivers)
                SdkApi.SdkEvent.ContentCase.ADD_SENDONLY_TRANSCEIVER -> addSendonly(event.addSendonlyTransceiver)
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

    fun startCamera(): VideoTrack = await { startCameraOnThread() }

    fun startMicrophone(): AudioTrack = await { startMicrophoneOnThread() }

    fun bind(trackId: String, track: MediaStreamTrack) {
        media[trackId] = track
        fishjamIdByWebrtcId[track.id()] = trackId
        onMediaChanged()
    }

    fun close() {
        val done = CountDownLatch(1)
        executor.execute {
            try {
                stopCameraOnThread()
                stopMicrophoneOnThread()
                closePeerConnection()
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
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(appContext).createInitializationOptions()
        )
        val encoder = DefaultVideoEncoderFactory(SharedEgl.base.eglBaseContext, true, true)
        val decoder = DefaultVideoDecoderFactory(SharedEgl.base.eglBaseContext)
        val audioDevice = JavaAudioDeviceModule.builder(appContext).createAudioDeviceModule()
        val created =
            PeerConnectionFactory
                .builder()
                .setAudioDeviceModule(audioDevice)
                .setVideoEncoderFactory(encoder)
                .setVideoDecoderFactory(decoder)
                .createPeerConnectionFactory()
        audioDevice.release()
        factory = created
        return created
    }

    private fun startCameraOnThread(): VideoTrack {
        if (appContext.checkSelfPermission(android.Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            throw SecurityException("CAMERA permission is required")
        }
        localVideo?.let { return it }
        val enumerator =
            if (Camera2Enumerator.isSupported(appContext)) {
                Camera2Enumerator(appContext)
            } else {
                Camera1Enumerator(false)
            }
        val names = enumerator.deviceNames
        if (names.isEmpty()) throw IllegalStateException("No camera found")
        val frontCamera = names.firstOrNull { name ->
            runCatching { enumerator.isFrontFacing(name) }.getOrDefault(false)
        }
        val cameraName = frontCamera ?: names.first()
        val created =
            enumerator.createCapturer(cameraName, EmptyCameraEvents())
                ?: throw IllegalStateException("No camera found")
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
        videoSource = source
        surface = helper
        localVideo = track
        return track
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
            current.dispose()
        }
        capturer = null
        localVideo = null
        videoSource?.dispose()
        videoSource = null
        surface?.dispose()
        surface = null
    }

    private fun stopMicrophoneOnThread() {
        localAudio = null
        audioSource?.dispose()
        audioSource = null
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
        val track = media[request.trackId] ?: return
        val encodings =
            request.sendEncodingsList.map { encoding ->
                val scale = encoding.scaleResolutionDownBy.takeIf { it > 0 }?.toDouble()
                RtpParameters.Encoding(encoding.rid, encoding.active, scale).apply {
                    if (encoding.maxBitrate > 0) maxBitrateBps = encoding.maxBitrate
                }
            }
        pc.addTransceiver(
            track,
            RtpTransceiver.RtpTransceiverInit(
                RtpTransceiver.RtpTransceiverDirection.SEND_ONLY,
                listOf(track.id()),
                encodings
            )
        )
    }

    private fun removeSend(trackId: String) {
        val pc = connection ?: return
        val track = media.remove(trackId) ?: return
        fishjamIdByWebrtcId.remove(track.id())
        pc.transceivers.firstOrNull { it.sender.track()?.id() == track.id() }?.stop()
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
            pendingRemote.remove(mid)?.let { track -> rememberRemote(trackId, track) }
        }
        pc.setRemoteDescription(
            object : SdpObserver {
                override fun onCreateSuccess(description: SessionDescription?) = Unit

                override fun onSetSuccess() {
                    executor.execute {
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
        media.clear()
        fishjamIdByWebrtcId.clear()
        midToTrackId.clear()
        pendingRemote.clear()
        onMediaChanged()
        pc?.dispose()
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
                executor.execute {
                    val trackId = midToTrackId[mid]
                    if (trackId == null) {
                        pendingRemote[mid] = track
                    } else {
                        rememberRemote(trackId, track)
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

    private fun rememberRemote(trackId: String, track: MediaStreamTrack) {
        media[trackId] = track
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

private class EmptyCameraEvents : CameraVideoCapturer.CameraEventsHandler {
    override fun onCameraError(errorDescription: String) = Unit

    override fun onCameraDisconnected() = Unit

    override fun onCameraFreezed(errorDescription: String) = Unit

    override fun onCameraOpening(cameraName: String) = Unit

    override fun onFirstFrameAvailable() = Unit

    override fun onCameraClosed() = Unit
}
