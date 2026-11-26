package io.fishjam.client

import android.Manifest
import android.content.Context
import android.util.Log
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
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import org.webrtc.AudioTrack
import org.webrtc.VideoTrack
import uniffi.fishjam_core.CoreClientConfig
import uniffi.fishjam_core.CoreEvent
import uniffi.fishjam_core.CoreEventListener
import uniffi.fishjam_core.CoreException
import uniffi.fishjam_core.CoreTrackKind
import uniffi.fishjam_core.CoreTrackType
import uniffi.fishjam_core.FishjamCoreClient
import uniffi.fishjam_core.decodeDataMessage
import uniffi.fishjam_core.installLogger

class FishjamClient(
    context: Context,
    internal val fishjamId: String,
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
    val isScreenSharing: StateFlow<Boolean> get() = screenShare.isOn

    val cameraDeviceError: StateFlow<DeviceError?> get() = camera.error
    val microphoneDeviceError: StateFlow<DeviceError?> get() = microphone.error
    val screenShareError: StateFlow<DeviceError?> get() = screenShare.error

    private val audioOutput = AudioOutputManager(appContext)
    val currentAudioOutput: StateFlow<AudioDevice?> = audioOutput.currentAudioOutput
    val availableAudioOutputs: StateFlow<List<AudioDevice>> = audioOutput.availableAudioOutputs

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    /** Peer id to speaking. Remote peers follow the server. The local peer follows the microphone level. */
    val voiceActivity: StateFlow<Map<String, Boolean>> =
        _roomState.map(::voiceActivityOf).stateIn(scope, SharingStarted.Eagerly, emptyMap())

    private var localVad = VadStatus.Silence
    private val closed = AtomicBoolean(false)
    private val audioOnly = AtomicBoolean(false)
    private val joinLock = Any()
    private var joinResult: CompletableDeferred<Unit>? = null
    private val eventHub = EventHub()
    private val eventMapper = FishjamEventMapper()
    private val liveLocalTracks = LinkedHashMap<String, String>()

    /**
     * Every connection, auth, reconnection, peer, track and local-track event, in order.
     * A collector sees the events from the moment it starts collecting.
     * It keeps the newest 1024 events when it is slow.
     */
    val events: SharedFlow<FishjamEvent> = eventHub.events

    private val dataChannels =
        DataChannels(
            encode = { payload -> activeCore?.encodeDataMessage(payload) ?: payload },
            decode = ::decodeDataMessage,
            deliver = { block ->
                scope.launch {
                    if (!closed.get()) block()
                }
            }
        )

    /** `true` when both the reliable and the lossy data channel are open. */
    val dataChannelReady: StateFlow<Boolean> = dataChannels.ready

    /** `true` while [initializeDataChannel] is setting up the channels. */
    val dataChannelLoading: StateFlow<Boolean> = dataChannels.loading

    /** The last data channel setup or publish error. Cleared by the next [initializeDataChannel]. */
    val dataChannelError: StateFlow<Throwable?> = dataChannels.error

    private val session =
        MediaSession(
            context = context,
            core = { activeCore },
            onMediaChanged = ::refreshMedia,
            onScreenCaptureStopped = { screenShare.onSystemStopped() },
            dataChannels = dataChannels
        )

    /** Called by the core on its own thread. */
    private val coreListener =
        object : CoreEventListener {
            override fun onEvent(event: CoreEvent) {
                scope.launch {
                    if (closed.get()) return@launch
                    dispatch(event)
                }
            }
        }

    private val core: FishjamCoreClient

    /** `null` once the client is closed, so late WebRTC callbacks do nothing. */
    private val activeCore: FishjamCoreClient?
        get() = if (closed.get()) null else core

    private val networkMonitor =
        NetworkMonitor(context) { online, networkId ->
            scope.launch {
                if (closed.get()) return@launch
                activeCore?.networkStatusChanged(online, networkId)
            }
        }

    init {
        installLogger(debug)
        core =
            FishjamCoreClient(
                CoreClientConfig(
                    fishjamId = fishjamId,
                    debug = debug,
                    clientType = "android",
                    reconnectConfig = reconnect.toCore(),
                    bandwidthLimits = bandwidthLimits.toCore(),
                    videoConfig = videoConfig.toCore()
                ),
                coreListener
            )
        networkMonitor.start()
        audioOutput.startObserving()
    }

    internal fun peerConnectionFactory() = session.peerConnectionFactory()

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
            send { it.joinRoom(peerToken, peerMetadata.toString()) }
            waiter.await()
        } finally {
            synchronized(joinLock) {
                if (joinResult === waiter) joinResult = null
            }
        }
    }

    fun setTrackBandwidth(trackId: String, limit: BandwidthLimit) {
        send { it.setTrackBandwidth(trackId, limit.singleKbps, limit.layers) }
        eventHub.emit(FishjamEvent.LocalTrackBandwidthSet(trackId, limit))
    }

    fun setEncodingBandwidth(trackId: String, variant: Variant, kbps: Int) {
        send { it.setEncodingBandwidth(trackId, variant.toCore(), nonNegativeKbps(kbps)) }
        eventHub.emit(FishjamEvent.LocalTrackEncodingBandwidthSet(trackId, variant, kbps))
    }

    fun setReceivedQuality(trackId: String, variant: Variant) {
        send { it.setTargetTrackVariant(trackId, variant.toCore()) }
    }

    fun updatePeerMetadata(peerMetadata: JsonObject) {
        send { it.updatePeerMetadata(peerMetadata.toString()) }
        eventHub.emit(FishjamEvent.LocalPeerMetadataChanged(peerMetadata))
    }

    /**
     * Opens the `reliable` (ordered) and `lossy` (unordered, no retransmits) data channels.
     * Messages on them go to every peer in the room. Returns when the channels are ready or setup failed;
     * failures go to [dataChannelError] instead of being thrown. Does nothing while ready or loading.
     * The channels close when the peer leaves, disconnects or reconnects; call this again afterwards.
     */
    suspend fun initializeDataChannel() {
        if (dataChannels.ready.value || dataChannels.loading.value) return
        if (peerStatus.value != PeerStatus.Connected) {
            dataChannels.reportError(IllegalStateException("Peer is not connected"))
            return
        }
        val core = activeCore ?: return
        if (!dataChannels.start()) return
        try {
            core.createDataChannels()
        } catch (error: CoreException) {
            dataChannels.fail(IllegalStateException(error.detail))
            return
        }
        dataChannels.loading.first { loading -> !loading }
    }

    /**
     * Sends [payload] to every other peer, on the reliable channel when [reliable] is `true`,
     * otherwise on the lossy one. When the channel is not open the error goes to [dataChannelError].
     */
    fun publishData(payload: ByteArray, reliable: Boolean) {
        try {
            dataChannels.publish(payload, reliable)
        } catch (error: IllegalStateException) {
            dataChannels.reportError(error)
        }
    }

    /**
     * Calls [callback] on the main thread with every payload received on the chosen channel.
     * Works before the channels exist and keeps working after a reconnect. Returns the unsubscribe function.
     */
    fun subscribeData(reliable: Boolean, callback: (ByteArray) -> Unit): () -> Unit =
        dataChannels.subscribe(reliable, callback)

    fun leaveRoom() {
        synchronized(joinLock) {
            joinResult?.cancel()
            joinResult = null
        }
        val generation = captureGeneration.incrementAndGet()
        camera.reset()
        microphone.reset()
        screenShare.reset()
        liveLocalTrackIds().forEach { trackId -> localTrackRemoved(trackId) }
        // Custom sources stay set. The core publishes them again on the next connection.
        session.releaseLocalDevices(generation)
        resetLocalVad()
        publishRoom(RoomState.Empty)
        activeCore?.leaveRoom()
    }

    private val captureGeneration = AtomicInteger(0)

    private val host: DeviceHost = ClientHost()
    private val localSources = LocalSources(LocalSourceCoreAdapter(), LocalSourceSinkAdapter())
    private val customSources =
        CustomSourceController(
            sources = localSources,
            isOpen = { !closed.get() },
            captureGeneration = { captureGeneration.get() }
        )
    private val customVideo = CustomVideoFactory(session)
    private val camera = CameraController(host)
    private val microphone = MicrophoneController(host)
    private val screenShare = ScreenShareController(scope, host)
    private val localVoiceActivity =
        LocalVoiceActivity(
            scope = scope,
            running = { !closed.get() },
            trackId = { publishedMicrophoneTrackId() },
            level = { trackId -> audioLevel(session.statistics(trackId)) },
            onStatus = ::applyLocalVad
        )
    private val initializeLock = Mutex()

    init {
        localVoiceActivity.start()
    }
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

    /** Starts the camera and returns its video track. Returns the running track when the camera is already on. */
    suspend fun startCamera(): VideoTrack = camera.start()

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

    /**
     * Starts the microphone and returns its audio track.
     * Returns the running track when the microphone is already on.
     */
    suspend fun startMicrophone(): AudioTrack = microphone.start()

    suspend fun stopMicrophone() = microphone.stop()

    suspend fun toggleMicrophone() = microphone.toggle()

    /**
     * Asks for screen capture consent, then returns the screen-share video track.
     * Returns the running track when screen sharing is already on.
     * Start [ForegroundService] with [ForegroundServiceConfig.enableScreenSharing] set first.
     */
    suspend fun startScreenShare(): VideoTrack = screenShare.start()

    suspend fun stopScreenShare() = screenShare.stop()

    suspend fun toggleScreenShare() = screenShare.toggle()

    /**
     * Creates [poolSize] memory slots, each [width] by [height] pixels, that you draw frames into.
     *
     * Use a pool only when you draw each frame yourself (for example a clock or graphics).
     * For frames that already exist, such as from a video file or camera, call [createCustomVideoTrack]
     * with no arguments instead.
     *
     * Pass the pool to [createCustomVideoTrack]. Draw into `pool.buffers[i].buffer`, then call
     * [PooledVideoTrack.pushFrame] with index `i`. Use 3 slots as a default: while the SDK sends one
     * slot, you can draw into another.
     *
     * Throws [UnsupportedOperationException] before Android 8.
     */
    fun createCustomVideoBufferPool(width: Int, height: Int, poolSize: Int): CustomVideoBufferPool =
        customVideo.createPool(width, height, poolSize)

    /**
     * Creates a video track that you draw into [pool]. Send each frame with [PooledVideoTrack.pushFrame].
     * A pool can be used by only one track.
     * Publish the track with [setCustomSource].
     */
    fun createCustomVideoTrack(pool: CustomVideoBufferPool): PooledVideoTrack = customVideo.createPooled(pool)

    /**
     * Creates a video track for frames that already exist, such as from a video file or camera.
     * Send each frame with [ForwardVideoTrack.forwardFrame].
     * Publish the track with [setCustomSource].
     */
    fun createCustomVideoTrack(): ForwardVideoTrack = customVideo.createForward()

    /**
     * Publishes [track] to the room under [sourceId], so other peers see it as a custom video.
     *
     * You can call it before or after joining. It publishes once you are connected, and again after a reconnect.
     * Passing null removes the track from the room. It does not stop the track: call
     * [ForwardVideoTrack.stop] or [PooledVideoTrack.stop] for that.
     * Setting the same track again does nothing. Calls run one at a time.
     */
    suspend fun setCustomSource(sourceId: String, track: VideoTrack?) = customSources.set(sourceId, track)

    /** The track currently set for [sourceId], or null. */
    fun customSource(sourceId: String): VideoTrack? = customSources.track(sourceId)

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

    private var localCamera: org.webrtc.VideoTrack? = null

    private fun setLocalCamera(track: org.webrtc.VideoTrack?) {
        localCamera = track
        publishRoom(withLocalCamera(_roomState.value))
    }

    private fun publishedMicrophoneTrackId(): String? {
        if (_peerStatus.value != PeerStatus.Connected || !microphone.isOn.value) return null
        return _roomState.value.localPeer?.microphoneTrack?.trackId?.takeIf { it.isNotEmpty() }
    }

    private fun publishRoom(room: RoomState) {
        _roomState.value = withLocalMicrophoneVad(room)
    }

    private fun withLocalMicrophoneVad(current: RoomState): RoomState {
        val local = current.localPeer ?: return current
        val updated = local.withMicrophoneVad(localVad)
        return if (updated == local) current else current.copy(localPeer = updated)
    }

    private fun applyLocalVad(status: VadStatus) {
        val unchanged = status == localVad && _roomState.value.localPeer?.microphoneTrack?.vadStatus == status
        if (unchanged) return
        val previous = localVad
        localVad = status
        publishRoom(withLocalCamera(_roomState.value))
        if (previous == status) return
        val peer = _roomState.value.localPeer ?: return
        val trackId = peer.microphoneTrack?.trackId?.takeIf { it.isNotEmpty() } ?: return
        eventHub.emit(FishjamEvent.VoiceActivityChanged(peer.id, trackId, status))
    }

    private fun resetLocalVad() {
        val previous = localVad
        localVad = VadStatus.Silence
        val peer = _roomState.value.localPeer ?: return
        val trackId = peer.microphoneTrack?.trackId?.takeIf { it.isNotEmpty() } ?: return
        if (previous != VadStatus.Silence) {
            eventHub.emit(FishjamEvent.VoiceActivityChanged(peer.id, trackId, VadStatus.Silence))
        }
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

        override fun isAudioOnly(): Boolean = this@FishjamClient.audioOnly.get()

        override fun setLocalSource(
            sourceId: String,
            track: org.webrtc.MediaStreamTrack,
            kind: CoreTrackKind,
            type: CoreTrackType,
            generation: Int
        ) = localSources.set(sourceId, track, kind, type, generation)

        override fun removeLocalSource(sourceId: String) = localSources.remove(sourceId)

        override fun setLocalCamera(track: org.webrtc.VideoTrack?) = this@FishjamClient.setLocalCamera(track)

        override fun localTracksReplaced(type: CoreTrackType) =
            this@FishjamClient.localTracksReplaced(trackTypeName(type))
    }

    /** Hands source changes to the core. Core errors that the app can act on keep their type. */
    private inner class LocalSourceCoreAdapter : LocalSourceCore {
        override fun setLocalSource(sourceId: String, mediaId: String, kind: CoreTrackKind, type: CoreTrackType) {
            val core = activeCore ?: return
            try {
                core.setLocalSource(sourceId, mediaId, kind, type)
            } catch (error: CoreException) {
                throw exceptionForCallError(error)
            }
        }

        override fun removeLocalSource(sourceId: String) {
            activeCore?.removeLocalSource(sourceId)
        }
    }

    /** Core events about local tracks, turned into WebRTC binds and [FishjamEvent]s. */
    private inner class LocalSourceSinkAdapter : LocalSourceSink {
        override fun bind(trackId: String, track: org.webrtc.MediaStreamTrack, generation: Int) {
            session.bind(trackId, track, generation)
        }

        override fun replace(trackId: String, track: org.webrtc.MediaStreamTrack) {
            session.replaceMedia(trackId, track)
        }

        override fun localTrackAdded(trackId: String, type: CoreTrackType) {
            this@FishjamClient.localTrackAdded(trackId, trackTypeName(type))
        }

        override fun localTrackRemoved(trackId: String) = this@FishjamClient.localTrackRemoved(trackId)

        override fun localTrackReplaced(trackId: String) {
            eventHub.emit(FishjamEvent.LocalTrackReplaced(trackId))
        }
    }

    private fun localTrackAdded(trackId: String, type: String) {
        val added = synchronized(liveLocalTracks) { liveLocalTracks.putIfAbsent(trackId, type) == null }
        if (added) eventHub.emit(FishjamEvent.LocalTrackAdded(trackId, type))
    }

    /** Does nothing for an id that is not published, so a track is reported removed once. */
    private fun localTrackRemoved(trackId: String) {
        val removed = synchronized(liveLocalTracks) { liveLocalTracks.remove(trackId) != null }
        if (removed) eventHub.emit(FishjamEvent.LocalTrackRemoved(trackId))
    }

    private fun localTracksReplaced(type: String) {
        val ids = synchronized(liveLocalTracks) { liveLocalTracks.filterValues { it == type }.keys.toList() }
        ids.forEach { trackId -> eventHub.emit(FishjamEvent.LocalTrackReplaced(trackId)) }
    }

    private fun liveLocalTrackIds(): List<String> = synchronized(liveLocalTracks) { liveLocalTracks.keys.toList() }

    override fun close() {
        if (!closed.compareAndSet(false, true)) return
        audioOutput.stopObserving()
        networkMonitor.stop()
        synchronized(joinLock) {
            joinResult?.cancel()
            joinResult = null
        }
        customSources.close()
        customVideo.close()
        session.close()
        scope.cancel()
        core.close()
    }

    private fun applyCommunicationMode(on: Boolean?) {
        if (on == null) return
        try {
            if (on) audioOutput.enterCommunicationMode() else audioOutput.exitCommunicationMode()
        } catch (error: Exception) {
            Log.w("FishjamClient", "Audio communication mode not changed", error)
        }
    }

    private fun dispatch(event: CoreEvent) {
        val media = session.mediaSnapshot()
        applyState(event, media)
        eventHub.emit(eventMapper.map(event, media))
    }

    private fun applyState(event: CoreEvent, media: Map<String, org.webrtc.MediaStreamTrack>) {
        peerTrackEventOf(event, media)?.let { peerTrack ->
            publishRoom(withLocalCamera(_roomState.value.applying(peerTrack)))
            return
        }
        when (event) {
            is CoreEvent.Authenticated -> {
                audioOnly.set(event.audioOnly)
            }
            is CoreEvent.PeerStatusChanged -> {
                val update = peerStatusUpdate(event) ?: return
                val modeChange = communicationModeChange(_peerStatus.value, update.peerStatus)
                _peerStatus.value = update.peerStatus
                if (update.peerStatus == PeerStatus.Idle) {
                    audioOnly.set(false)
                }
                if (update.peerStatus != PeerStatus.Connected) {
                    dataChannels.reset()
                }
                applyCommunicationMode(modeChange)
                val waiter = synchronized(joinLock) { joinResult }
                when {
                    update.peerStatus == PeerStatus.Connected -> waiter?.complete(Unit)
                    else -> joinFailure(update)?.let { waiter?.completeExceptionally(it) }
                }
            }
            is CoreEvent.ReconnectionStatusChanged -> {
                reconnectionStatusUpdate(event)?.let { _reconnectionStatus.value = it }
            }
            is CoreEvent.RoomStateChanged -> {
                publishRoom(withLocalCamera(roomStateOf(event.roomState).attach(media)))
            }
            is CoreEvent.VoiceActivityChanged -> Unit
            is CoreEvent.LocalSourcePublished -> localSources.published(event.mediaId, event.trackId)
            is CoreEvent.LocalSourceReplaced -> localSources.replaced(event.mediaId, event.trackId)
            is CoreEvent.LocalSourceUnpublished -> localSources.unpublished(event.trackId)
            is CoreEvent.LocalSourceRejected -> localSources.rejected(event.mediaId)
            else -> session.handle(event)
        }
    }

    private fun refreshMedia() {
        scope.launch {
            if (closed.get()) return@launch
            publishRoom(withLocalCamera(_roomState.value.attach(session.mediaSnapshot())))
        }
    }

    /** Runs a core call. A core error becomes an [IllegalStateException] with its text. */
    private fun send(body: (FishjamCoreClient) -> Unit) {
        val core = activeCore ?: return
        try {
            body(core)
        } catch (error: CoreException) {
            throw IllegalStateException(error.detail)
        }
    }
}
