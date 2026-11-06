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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject

class FishjamClient(
    context: Context,
    fishjamId: String,
    debug: Boolean = false,
    reconnect: ReconnectConfig = ReconnectConfig()
) : AutoCloseable {
    private val appContext = context.applicationContext
    private val _peerStatus = MutableStateFlow<PeerStatus>(PeerStatus.Idle)
    val peerStatus: StateFlow<PeerStatus> = _peerStatus.asStateFlow()

    private val _reconnectionStatus = MutableStateFlow(ReconnectionStatus.Idle)
    val reconnectionStatus: StateFlow<ReconnectionStatus> = _reconnectionStatus.asStateFlow()

    private val _roomState = MutableStateFlow(RoomState.Empty)
    val roomState: StateFlow<RoomState> = _roomState.asStateFlow()

    private val _isCameraOn = MutableStateFlow(false)
    val isCameraOn: StateFlow<Boolean> = _isCameraOn.asStateFlow()

    private val _currentCamera = MutableStateFlow<CameraDevice?>(null)
    val currentCamera: StateFlow<CameraDevice?> = _currentCamera.asStateFlow()
    private var preferredCameraId: String? = null

    private val _isMicrophoneOn = MutableStateFlow(false)
    val isMicrophoneOn: StateFlow<Boolean> = _isMicrophoneOn.asStateFlow()

    private val _cameraDeviceError = MutableStateFlow<DeviceError?>(null)
    val cameraDeviceError: StateFlow<DeviceError?> = _cameraDeviceError.asStateFlow()

    private val _microphoneDeviceError = MutableStateFlow<DeviceError?>(null)
    val microphoneDeviceError: StateFlow<DeviceError?> = _microphoneDeviceError.asStateFlow()

    private val audioOutput = AudioOutputManager(appContext)
    val currentAudioOutput: StateFlow<AudioDevice?> = audioOutput.currentAudioOutput
    val availableAudioOutputs: StateFlow<List<AudioDevice>> = audioOutput.availableAudioOutputs

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val closed = AtomicBoolean(false)
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
        cameraEpoch.incrementAndGet()
        microphoneEpoch.incrementAndGet()
        cameraPublish?.cancel()
        microphonePublish?.cancel()
        cameraPublish = null
        microphonePublish = null
        clearPublishedTrackIds()
        localCamera = null
        _isCameraOn.value = false
        _currentCamera.value = null
        _isMicrophoneOn.value = false
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

    // Each start or stop takes the next value. The call that still owns that
    // value after the device work is the one that keeps the camera or microphone.
    private val cameraEpoch = AtomicInteger(0)
    private val microphoneEpoch = AtomicInteger(0)
    private var cameraPublish: Job? = null
    private var microphonePublish: Job? = null
    private val publishedTrackIds = Any()
    private val cameraTrackIds = mutableListOf<String>()
    private val microphoneTrackIds = mutableListOf<String>()
    private val initializeLock = Any()
    private var devicesInitialized = false
    private var initializeInFlight: CompletableDeferred<InitializeDevicesResult>? = null

    fun cameraDevices(): List<CameraDevice> = session.cameraDevices()

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
    suspend fun selectCamera(deviceId: String) {
        val devices = cameraDevices()
        try {
            val device = requireListedCamera(devices, deviceId)
            if (_isCameraOn.value) {
                if (_currentCamera.value?.deviceId == device.deviceId) {
                    _cameraDeviceError.value = null
                    return
                }
                val generation = captureGeneration.get()
                session.switchCamera(generation, device.deviceId)
                if (!isCurrentCapture(generation) || !_isCameraOn.value) return
                preferredCameraId = device.deviceId
                _currentCamera.value = device
                _cameraDeviceError.value = null
                return
            }
            startCamera(device.deviceId)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            _cameraDeviceError.value = deviceErrorForCameraFailure(error, devices.size, deviceId)
            throw error
        }
    }

    suspend fun startCamera() {
        val preferred = preferredCameraId
        val deviceId = preferred?.takeIf { id -> cameraDevices().any { camera -> camera.deviceId == id } }
        startCamera(deviceId)
    }

    private suspend fun startCamera(deviceId: String?) {
        if (_isCameraOn.value) {
            _cameraDeviceError.value = null
            return
        }
        val epoch = cameraEpoch.incrementAndGet()
        val generation = captureGeneration.get()
        try {
            val opened = session.startCamera(generation, deviceId) { cameraEpoch.get() == epoch } ?: return
            if (!isCurrentDevice(generation, epoch, camera = true)) return
            _isCameraOn.value = true
            preferredCameraId = opened.device.deviceId
            _currentCamera.value = opened.device
            showLocalCamera(opened.track)
            _cameraDeviceError.value = null
            cameraPublish?.cancel()
            cameraPublish =
                scope.launch {
                    publishWhileConnected(
                        opened.track,
                        SdkApi.TrackKind.TRACK_KIND_VIDEO,
                        SdkApi.TrackType.TRACK_TYPE_CAMERA,
                        generation,
                        epoch,
                        camera = true
                    )
                }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            _cameraDeviceError.value = deviceErrorForCameraFailure(error, cameraDevices().size, deviceId)
            throw error
        }
    }

    suspend fun stopCamera() {
        val epoch = cameraEpoch.incrementAndGet()
        cameraPublish?.cancel()
        cameraPublish = null
        val generation = captureGeneration.get()
        val trackIds = takeTrackIds(camera = true)
        session.stopCamera(generation)
        trackIds.forEach { trackId -> removePublishedTrack(trackId) }
        if (cameraEpoch.get() != epoch) return
        localCamera = null
        _isCameraOn.value = false
        _currentCamera.value = null
        _roomState.value = withLocalCamera(_roomState.value)
    }

    suspend fun toggleCamera() {
        if (_isCameraOn.value) stopCamera() else startCamera()
    }

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

    suspend fun startMicrophone() {
        if (_isMicrophoneOn.value) {
            _microphoneDeviceError.value = null
            return
        }
        val epoch = microphoneEpoch.incrementAndGet()
        val generation = captureGeneration.get()
        try {
            val track = session.startMicrophone(generation) { microphoneEpoch.get() == epoch } ?: return
            if (!isCurrentDevice(generation, epoch, camera = false)) return
            _isMicrophoneOn.value = true
            _microphoneDeviceError.value = null
            microphonePublish?.cancel()
            microphonePublish =
                scope.launch {
                    publishWhileConnected(
                        track,
                        SdkApi.TrackKind.TRACK_KIND_AUDIO,
                        SdkApi.TrackType.TRACK_TYPE_MICROPHONE,
                        generation,
                        epoch,
                        camera = false
                    )
                }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            _microphoneDeviceError.value = deviceErrorForMicrophoneFailure(error)
            throw error
        }
    }

    suspend fun stopMicrophone() {
        val epoch = microphoneEpoch.incrementAndGet()
        microphonePublish?.cancel()
        microphonePublish = null
        val generation = captureGeneration.get()
        val trackIds = takeTrackIds(camera = false)
        session.stopMicrophone(generation)
        trackIds.forEach { trackId -> removePublishedTrack(trackId) }
        if (microphoneEpoch.get() != epoch) return
        _isMicrophoneOn.value = false
    }

    suspend fun toggleMicrophone() {
        if (_isMicrophoneOn.value) stopMicrophone() else startMicrophone()
    }

    /**
     * Starts the camera and microphone in one call.
     * Shows the permission dialog for each requested device that is not granted yet.
     * A later call returns [InitializeDevicesStatus.AlreadyInitialized].
     */
    suspend fun initializeDevices(enableVideo: Boolean = true, enableAudio: Boolean = true): InitializeDevicesResult {
        val shared: CompletableDeferred<InitializeDevicesResult>
        val isLeader: Boolean
        synchronized(initializeLock) {
            if (devicesInitialized) {
                return InitializeDevicesResult(InitializeDevicesStatus.AlreadyInitialized, null)
            }
            val current = initializeInFlight
            if (current != null) {
                shared = current
                isLeader = false
            } else {
                shared = CompletableDeferred()
                initializeInFlight = shared
                isLeader = true
            }
        }
        if (!isLeader) return shared.await()
        return try {
            val generation = captureGeneration.get()
            val result = startRequestedDevices(enableVideo, enableAudio)
            val finished = captureGeneration.get() == generation && !closed.get()
            val delivered = if (finished) result else interruptedInitializeDevicesResult(enableVideo, enableAudio)
            synchronized(initializeLock) {
                if (initializeInFlight === shared) initializeInFlight = null
                if (finished) devicesInitialized = true
            }
            shared.complete(delivered)
            delivered
        } catch (error: CancellationException) {
            synchronized(initializeLock) {
                if (initializeInFlight === shared) initializeInFlight = null
            }
            shared.completeExceptionally(error)
            throw error
        } catch (_: Throwable) {
            val delivered = interruptedInitializeDevicesResult(enableVideo, enableAudio)
            synchronized(initializeLock) {
                if (initializeInFlight === shared) initializeInFlight = null
            }
            shared.complete(delivered)
            delivered
        }
    }

    private suspend fun startRequestedDevices(enableVideo: Boolean, enableAudio: Boolean): InitializeDevicesResult {
        val videoError = if (enableVideo) startRequestedCamera() else null
        val audioError = if (enableAudio) startRequestedMicrophone() else null
        return initializeDevicesResult(enableVideo, enableAudio, videoError, audioError)
    }

    private suspend fun startRequestedCamera(): DeviceError? {
        if (_isCameraOn.value) {
            _cameraDeviceError.value = null
            return null
        }
        val permission =
            if (queryCameraPermission() == PermissionStatus.Granted) {
                PermissionStatus.Granted
            } else {
                requestCameraPermission()
            }
        if (permission != PermissionStatus.Granted) {
            _cameraDeviceError.value = DeviceError.NotAllowed
            return DeviceError.NotAllowed
        }
        return try {
            startCamera()
            if (_isCameraOn.value) {
                null
            } else {
                _cameraDeviceError.value ?: DeviceError.Unhandled.also { _cameraDeviceError.value = it }
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            _cameraDeviceError.value ?: deviceErrorForCameraFailure(error, cameraDevices().size, null)
        }
    }

    private suspend fun startRequestedMicrophone(): DeviceError? {
        if (_isMicrophoneOn.value) {
            _microphoneDeviceError.value = null
            return null
        }
        val permission =
            if (queryMicrophonePermission() == PermissionStatus.Granted) {
                PermissionStatus.Granted
            } else {
                requestMicrophonePermission()
            }
        if (permission != PermissionStatus.Granted) {
            _microphoneDeviceError.value = DeviceError.NotAllowed
            return DeviceError.NotAllowed
        }
        return try {
            startMicrophone()
            if (_isMicrophoneOn.value) {
                null
            } else {
                _microphoneDeviceError.value ?: DeviceError.Unhandled.also { _microphoneDeviceError.value = it }
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            _microphoneDeviceError.value ?: deviceErrorForMicrophoneFailure(error)
        }
    }

    private fun isCurrentCapture(generation: Int): Boolean {
        return !closed.get() && generation == captureGeneration.get()
    }

    private fun isCurrentDevice(generation: Int, epoch: Int, camera: Boolean): Boolean {
        if (!isCurrentCapture(generation)) return false
        val current = if (camera) cameraEpoch.get() else microphoneEpoch.get()
        return current == epoch
    }

    private suspend fun publishWhileConnected(
        track: org.webrtc.MediaStreamTrack,
        kind: SdkApi.TrackKind,
        type: SdkApi.TrackType,
        generation: Int,
        epoch: Int,
        camera: Boolean
    ) {
        while (isCurrentDevice(generation, epoch, camera)) {
            peerStatus.first { status -> status == PeerStatus.Connected }
            if (!isCurrentDevice(generation, epoch, camera)) return
            val trackId = publish(kind, type)
            if (!isCurrentDevice(generation, epoch, camera)) {
                removePublishedTrack(trackId)
                return
            }
            rememberTrackId(camera, trackId)
            if (!isCurrentDevice(generation, epoch, camera)) {
                if (dropTrackId(camera, trackId)) removePublishedTrack(trackId)
                return
            }
            session.bind(trackId, track, generation)
            peerStatus.first { status -> status != PeerStatus.Connected }
        }
    }

    private fun rememberTrackId(camera: Boolean, trackId: String) {
        synchronized(publishedTrackIds) {
            if (camera) cameraTrackIds.add(trackId) else microphoneTrackIds.add(trackId)
        }
    }

    private fun takeTrackIds(camera: Boolean): List<String> = synchronized(publishedTrackIds) {
        val ids = if (camera) cameraTrackIds else microphoneTrackIds
        val copy = ids.toList()
        ids.clear()
        copy
    }

    private fun dropTrackId(camera: Boolean, trackId: String): Boolean = synchronized(publishedTrackIds) {
        val ids = if (camera) cameraTrackIds else microphoneTrackIds
        ids.remove(trackId)
    }

    private fun clearPublishedTrackIds() {
        synchronized(publishedTrackIds) {
            cameraTrackIds.clear()
            microphoneTrackIds.clear()
        }
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

    private fun showLocalCamera(track: org.webrtc.VideoTrack) {
        localCamera = track
        _roomState.value = withLocalCamera(_roomState.value)
    }

    private fun withLocalCamera(current: RoomState): RoomState {
        val track = localCamera ?: return withoutLocalCameraPreview(current)
        if (current.localPeer?.cameraTrack?.videoTrack != null) return current
        val camera =
            Track(
                trackId = current.localPeer?.cameraTrack?.trackId.orEmpty(),
                metadata = TrackMetadata(type = "camera", paused = false, displayName = null),
                videoTrack = track,
                audioTrack = null
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
            SdkApi.SdkEvent.ContentCase.PEER_STATUS_CHANGED -> {
                val update = peerStatusUpdate(event) ?: return
                val modeChange = communicationModeChange(_peerStatus.value, update.peerStatus)
                _peerStatus.value = update.peerStatus
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
        if (response.code != 0) throw IllegalStateException(parsed.error.message)
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
