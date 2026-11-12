package io.fishjam.client

import android.Manifest
import android.content.Context
import android.util.Log
import fishjam.sdk.SdkApi
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject

class FishjamClient(
    context: Context,
    fishjamId: String,
    debug: Boolean = false,
    reconnect: ReconnectConfig = ReconnectConfig(),
    private val bandwidthLimits: BandwidthLimits = BandwidthLimits(),
    private val videoConfig: VideoConfig = VideoConfig()
) : AutoCloseable {
    private val appContext = context.applicationContext
    private val _peerStatus = MutableStateFlow<PeerStatus>(PeerStatus.Idle)
    val peerStatus: StateFlow<PeerStatus> = _peerStatus.asStateFlow()

    private val _reconnectionStatus = MutableStateFlow(ReconnectionStatus.Idle)
    val reconnectionStatus: StateFlow<ReconnectionStatus> = _reconnectionStatus.asStateFlow()

    private val _roomState = MutableStateFlow(RoomState.Empty)
    val roomState: StateFlow<RoomState> = _roomState.asStateFlow()

    val isCameraOn: StateFlow<Boolean> get() = camera.isOn
    val currentCamera: StateFlow<CameraDevice?> get() = camera.currentCamera
    val isMicrophoneOn: StateFlow<Boolean> get() = microphone.isOn

    val cameraDeviceError: StateFlow<DeviceError?> get() = camera.error
    val microphoneDeviceError: StateFlow<DeviceError?> get() = microphone.error

    private val audioOutput = AudioOutputManager(appContext)
    val currentAudioOutput: StateFlow<AudioDevice?> = audioOutput.currentAudioOutput
    val availableAudioOutputs: StateFlow<List<AudioDevice>> = audioOutput.availableAudioOutputs

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val closed = AtomicBoolean(false)
    private val audioOnly = AtomicBoolean(false)
    private val joinLock = Any()
    private var joinResult: CompletableDeferred<Unit>? = null
    private val roomEventListeners = CopyOnWriteArrayList<RoomEventListener>()

    private val session =
        MediaSession(
            context = context,
            call = { request ->
                runCatching { send(request) }
            },
            onMediaChanged = ::refreshMedia
        )

    private val events =
        NativeEvents { payload ->
            val event = SdkApi.SdkEvent.parseFrom(payload)
            scope.launch {
                if (closed.get()) return@launch
                dispatch(event)
            }
        }

    private val handle: Long

    private val networkMonitor =
        NetworkMonitor(context) { online, networkId ->
            scope.launch {
                if (closed.get()) return@launch
                send(
                    SdkApi.SdkRequest
                        .newBuilder()
                        .setNetworkStatusChanged(
                            SdkApi.NetworkStatusChanged
                                .newBuilder()
                                .setOnline(online)
                                .setNetworkId(networkId)
                        ).build()
                )
            }
        }

    init {
        NativeCore.nativeInstallLogger(debug)
        handle =
            NativeCore.nativeCreate(
                SdkApi.ClientConfig
                    .newBuilder()
                    .setFishjamId(fishjamId)
                    .setDebug(debug)
                    .setClientType("android")
                    .setReconnectConfig(reconnect.toProto())
                    .setBandwidthLimits(bandwidthLimits.toProto())
                    .setVideoConfig(videoConfig.toProto())
                    .build()
                    .toByteArray(),
                events
            )
        check(handle != 0L) { "fishjam_client_new returned null" }
        networkMonitor.start()
        audioOutput.startObserving()
    }

    fun addRoomEventListener(listener: RoomEventListener) {
        roomEventListeners.add(listener)
    }

    fun removeRoomEventListener(listener: RoomEventListener) {
        roomEventListeners.remove(listener)
    }

    /** WebRTC stats for the connection, or for one track when [trackId] is set. */
    suspend fun getStatistics(trackId: String? = null): List<RtcStats> = session.statistics(trackId)

    /** Outgoing bandwidth estimate in bits per second. `0` when it is not available. */
    suspend fun getBandwidthEstimation(): Long = outgoingBitrateBps(session.statistics(null))

    /**
     * Local microphone level from 0.0 to 1.0.
     * `null` when the track is unknown, has no sender, or the stats have no audio level.
     */
    suspend fun getLocalTrackAudioLevel(trackId: String): Double? = audioLevel(session.statistics(trackId))

    suspend fun joinRoom(peerToken: String, peerMetadata: JsonObject = JsonObject(emptyMap())) {
        val waiter = CompletableDeferred<Unit>()
        synchronized(joinLock) { joinResult = waiter }
        try {
            val response =
                call(
                    SdkApi.SdkRequest
                        .newBuilder()
                        .setJoinRoom(
                            SdkApi.JoinRoom
                                .newBuilder()
                                .setPeerToken(peerToken)
                                .setPeerMetadataJson(peerMetadata.toString())
                        ).build()
                )
            if (response.code != 0) {
                throw IllegalStateException(SdkApi.SdkResponse.parseFrom(response.payload).error.message)
            }
            waiter.await()
        } finally {
            synchronized(joinLock) {
                if (joinResult === waiter) joinResult = null
            }
        }
    }

    fun setTrackBandwidth(trackId: String, limit: BandwidthLimit) {
        send(
            SdkApi.SdkRequest
                .newBuilder()
                .setSetTrackBandwidth(limit.toRequest(trackId))
                .build()
        )
    }

    fun setEncodingBandwidth(trackId: String, variant: Variant, kbps: Int) {
        send(
            SdkApi.SdkRequest
                .newBuilder()
                .setSetEncodingBandwidth(
                    SdkApi.SetEncodingBandwidth
                        .newBuilder()
                        .setTrackId(trackId)
                        .setVariant(variant.toProto())
                        .setKbps(kbps.coerceAtLeast(0))
                ).build()
        )
    }

    fun setReceivedQuality(trackId: String, variant: Variant) {
        send(
            SdkApi.SdkRequest
                .newBuilder()
                .setSetTargetTrackVariant(
                    SdkApi.SetTargetTrackVariant
                        .newBuilder()
                        .setTrackId(trackId)
                        .setVariant(variant.toProto())
                ).build()
        )
    }

    fun updatePeerMetadata(peerMetadata: JsonObject) {
        send(
            SdkApi.SdkRequest
                .newBuilder()
                .setUpdatePeerMetadata(
                    SdkApi.UpdatePeerMetadata
                        .newBuilder()
                        .setPeerMetadataJson(peerMetadata.toString())
                ).build()
        )
    }

    fun leaveRoom() {
        synchronized(joinLock) {
            joinResult?.cancel()
            joinResult = null
        }
        val generation = captureGeneration.incrementAndGet()
        camera.reset()
        microphone.reset()
        session.releaseLocalDevices(generation)
        _roomState.value = RoomState.Empty
        if (handle == 0L || closed.get()) return
        send(
            SdkApi.SdkRequest
                .newBuilder()
                .setLeaveRoom(SdkApi.LeaveRoom.getDefaultInstance())
                .build()
        )
    }

    private val captureGeneration = AtomicInteger(0)

    private val host: DeviceHost = ClientHost()
    private val camera = CameraController(scope, host)
    private val microphone = MicrophoneController(scope, host)
    private val initializeLock = Mutex()
    private var devicesInitialized = false

    fun cameraDevices(): List<CameraDevice> = camera.devices()

    /**
     * Routes call audio to [deviceId] from [availableAudioOutputs].
     * Completes when the system reports that device as current.
     */
    suspend fun selectAudioOutput(deviceId: String) {
        withContext(Dispatchers.Main.immediate) {
            suspendCancellableCoroutine { continuation ->
                audioOutput.selectAudioOutput(deviceId) { error ->
                    if (!continuation.isActive) return@selectAudioOutput
                    if (error == null) {
                        continuation.resume(Unit)
                    } else {
                        continuation.resumeWithException(error)
                    }
                }
            }
        }
    }

    /**
     * Switches to [deviceId] from [cameraDevices].
     * An open camera stays the same video track, so the room and the published track stay.
     */
    suspend fun selectCamera(deviceId: String) = camera.select(deviceId)

    suspend fun startCamera() = camera.start()

    suspend fun stopCamera() = camera.stop()

    suspend fun toggleCamera() = camera.toggle()

    /** Checks the camera permission without showing a dialog. */
    fun queryCameraPermission(): PermissionStatus = OsPermissions.query(appContext, Manifest.permission.CAMERA)

    /**
     * Shows the camera permission dialog when the system still allows it.
     * Returns [PermissionStatus.Granted], [PermissionStatus.Denied], or [PermissionStatus.Prompt].
     */
    suspend fun requestCameraPermission(): PermissionStatus =
        OsPermissions.request(appContext, Manifest.permission.CAMERA)

    /** Checks the microphone permission without showing a dialog. */
    fun queryMicrophonePermission(): PermissionStatus =
        OsPermissions.query(appContext, Manifest.permission.RECORD_AUDIO)

    /**
     * Shows the microphone permission dialog when the system still allows it.
     * Returns [PermissionStatus.Granted], [PermissionStatus.Denied], or [PermissionStatus.Prompt].
     */
    suspend fun requestMicrophonePermission(): PermissionStatus =
        OsPermissions.request(appContext, Manifest.permission.RECORD_AUDIO)

    suspend fun startMicrophone() = microphone.start()

    suspend fun stopMicrophone() = microphone.stop()

    suspend fun toggleMicrophone() = microphone.toggle()

    /**
     * Starts the camera and microphone in one call.
     * Shows the permission dialog for each requested device that is not granted yet.
     * A later call returns [InitializeDevicesStatus.AlreadyInitialized].
     */
    suspend fun initializeDevices(enableVideo: Boolean = true, enableAudio: Boolean = true): InitializeDevicesResult =
        initializeLock.withLock {
            if (devicesInitialized) {
                return@withLock InitializeDevicesResult(InitializeDevicesStatus.AlreadyInitialized, null)
            }
            val generation = captureGeneration.get()
            val videoError =
                if (enableVideo) {
                    try {
                        camera.startRequested()
                    } catch (_: TrackTypeError) {
                        null
                    }
                } else {
                    null
                }
            val audioError = if (enableAudio) microphone.startRequested() else null
            val finished = !closed.get() && captureGeneration.get() == generation
            if (!finished) {
                return@withLock interruptedInitializeDevicesResult(enableVideo, enableAudio)
            }
            devicesInitialized = true
            initializeDevicesResult(enableVideo, enableAudio, videoError, audioError)
        }

    private fun removePublishedTrack(trackId: String) {
        val response =
            call(
                SdkApi.SdkRequest
                    .newBuilder()
                    .setRemoveTrack(
                        SdkApi.RemoveTrack.newBuilder().setTrackId(trackId)
                    ).build()
            )
        if (response.code == 0) return
        val message = SdkApi.SdkResponse.parseFrom(response.payload).error.message
        if (message != "Cannot find track") throw IllegalStateException(message)
    }

    private var localCamera: org.webrtc.VideoTrack? = null

    private fun setLocalCamera(track: org.webrtc.VideoTrack?) {
        localCamera = track
        _roomState.value = withLocalCamera(_roomState.value)
    }

    private fun withLocalCamera(current: RoomState): RoomState {
        val track = localCamera ?: return withoutLocalCameraPreview(current)
        if (current.localPeer?.cameraTrack?.videoTrack != null) return current
        val existing = current.localPeer?.cameraTrack
        val camera =
            Track(
                trackId = existing?.trackId.orEmpty(),
                metadata = TrackMetadata(type = "camera", paused = false, displayName = null),
                videoTrack = track,
                audioTrack = null,
                simulcastConfig = existing?.simulcastConfig ?: SimulcastConfig.Disabled,
                encoding = existing?.encoding
            )
        val otherTracks = current.localPeer?.tracks?.filter { it.metadata?.type != "camera" } ?: emptyList()
        val local =
            (current.localPeer ?: emptyPeer()).copy(
                cameraTrack = camera,
                tracks = listOf(camera) + otherTracks
            )
        return current.copy(localPeer = local)
    }

    private fun withoutLocalCameraPreview(current: RoomState): RoomState {
        val local = current.localPeer ?: return current
        val camera = local.cameraTrack
        val hasPreview =
            camera?.videoTrack != null ||
                local.tracks.any { track -> track.metadata?.type == "camera" && track.videoTrack != null }
        if (!hasPreview) return current
        return current.copy(
            localPeer = local.copy(
                cameraTrack = camera?.copy(videoTrack = null),
                tracks = local.tracks.map { track ->
                    if (track.metadata?.type == "camera") track.copy(videoTrack = null) else track
                }
            )
        )
    }

    private fun emptyPeer(): PeerWithTracks = PeerWithTracks(
        id = "",
        metadata = null,
        tracks = emptyList(),
        cameraTrack = null,
        microphoneTrack = null,
        screenShareVideoTrack = null,
        screenShareAudioTrack = null,
        customVideoTracks = emptyList(),
        customAudioTracks = emptyList()
    )

    private inner class ClientHost : DeviceHost {
        override val appContext: Context get() = this@FishjamClient.appContext
        override val session: MediaSession get() = this@FishjamClient.session
        override val peerStatus: StateFlow<PeerStatus> get() = _peerStatus

        override fun captureGeneration(): Int = this@FishjamClient.captureGeneration.get()

        override fun isOpen(): Boolean = !closed.get()

        override suspend fun publish(kind: SdkApi.TrackKind, type: SdkApi.TrackType): String =
            this@FishjamClient.publish(kind, type)

        override fun isAudioOnly(): Boolean = this@FishjamClient.audioOnly.get()

        override fun removePublishedTrack(trackId: String) = this@FishjamClient.removePublishedTrack(trackId)

        override fun setLocalCamera(track: org.webrtc.VideoTrack?) = this@FishjamClient.setLocalCamera(track)
    }

    override fun close() {
        if (!closed.compareAndSet(false, true)) return
        audioOutput.stopObserving()
        networkMonitor.stop()
        synchronized(joinLock) {
            joinResult?.cancel()
            joinResult = null
        }
        session.close()
        scope.cancel()
        NativeCore.nativeDestroy(handle)
    }

    private fun applyCommunicationMode(on: Boolean?) {
        if (on == null) return
        try {
            if (on) audioOutput.enterCommunicationMode() else audioOutput.exitCommunicationMode()
        } catch (error: Exception) {
            Log.w("FishjamClient", "Audio communication mode not changed", error)
        }
    }

    private fun dispatch(event: SdkApi.SdkEvent) {
        roomEventOf(event, session.mediaSnapshot())?.let { roomEvent ->
            _roomState.value = withLocalCamera(_roomState.value.applying(roomEvent))
            roomEventListeners.forEach { listener -> listener.onRoomEvent(roomEvent) }
            return
        }
        when (event.contentCase) {
            SdkApi.SdkEvent.ContentCase.AUTHENTICATED -> {
                audioOnly.set(event.authenticated.audioOnly)
            }
            SdkApi.SdkEvent.ContentCase.PEER_STATUS_CHANGED -> {
                val update = peerStatusUpdate(event) ?: return
                val modeChange = communicationModeChange(_peerStatus.value, update.peerStatus)
                _peerStatus.value = update.peerStatus
                if (update.peerStatus == PeerStatus.Idle) {
                    audioOnly.set(false)
                }
                applyCommunicationMode(modeChange)
                val waiter = synchronized(joinLock) { joinResult }
                when {
                    update.peerStatus == PeerStatus.Connected -> waiter?.complete(Unit)
                    else -> joinFailure(update)?.let { waiter?.completeExceptionally(it) }
                }
            }
            SdkApi.SdkEvent.ContentCase.RECONNECTION_STATUS_CHANGED -> {
                reconnectionStatusUpdate(event)?.let { _reconnectionStatus.value = it }
            }
            SdkApi.SdkEvent.ContentCase.ROOM_STATE_CHANGED -> {
                if (event.roomStateChanged.hasRoomState()) {
                    _roomState.value =
                        withLocalCamera(
                            roomStateOf(event.roomStateChanged.roomState).attach(session.mediaSnapshot())
                        )
                }
            }
            else -> session.handle(event)
        }
    }

    private suspend fun publish(kind: SdkApi.TrackKind, type: SdkApi.TrackType): String {
        if (peerStatus.value != PeerStatus.Connected) {
            peerStatus.first { status ->
                status == PeerStatus.Connected || status is PeerStatus.Error || status == PeerStatus.Idle
            }
        }
        if (peerStatus.value != PeerStatus.Connected) {
            throw IllegalStateException("Cannot add tracks before being accepted by the server")
        }
        val response =
            call(
                SdkApi.SdkRequest
                    .newBuilder()
                    .setAddTrack(
                        SdkApi.AddTrack
                            .newBuilder()
                            .setKind(kind)
                            .setMetadata(
                                SdkApi.TrackMetadata
                                    .newBuilder()
                                    .setType(type)
                                    .setPaused(false)
                            )
                    ).build()
            )
        val parsed = SdkApi.SdkResponse.parseFrom(response.payload)
        if (response.code != 0) throw exceptionForCallError(parsed.error)
        return parsed.addTrack.trackId
    }

    private fun refreshMedia() {
        scope.launch {
            if (closed.get()) return@launch
            _roomState.value = withLocalCamera(_roomState.value.attach(session.mediaSnapshot()))
        }
    }

    private fun send(request: SdkApi.SdkRequest) {
        val response = call(request)
        if (response.code != 0) {
            throw IllegalStateException(SdkApi.SdkResponse.parseFrom(response.payload).error.message)
        }
    }

    private fun call(request: SdkApi.SdkRequest): NativeCallResult {
        if (closed.get()) return NativeCallResult(0, ByteArray(0))
        return NativeCore.nativeCall(handle, request.toByteArray())
    }
}
