package io.fishjam.client

import android.content.Context
import fishjam.sdk.SdkApi
import java.util.concurrent.atomic.AtomicBoolean
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
import kotlinx.serialization.json.JsonObject

class FishjamClient(
    context: Context,
    fishjamId: String,
    debug: Boolean = false
) : AutoCloseable {
    private val _peerStatus = MutableStateFlow(PeerStatus.Idle)
    val peerStatus: StateFlow<PeerStatus> = _peerStatus.asStateFlow()

    private val _roomState = MutableStateFlow(RoomState.Empty)
    val roomState: StateFlow<RoomState> = _roomState.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val closed = AtomicBoolean(false)
    private val joinLock = Any()
    private var joinResult: CompletableDeferred<Unit>? = null

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

    private val handle: Long =
        NativeCore.nativeCreate(
            SdkApi.ClientConfig
                .newBuilder()
                .setFishjamId(fishjamId)
                .setDebug(debug)
                .build()
                .toByteArray(),
            events
        )

    init {
        check(handle != 0L) { "fishjam_client_new returned null" }
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

    fun leaveRoom() {
        synchronized(joinLock) {
            joinResult?.cancel()
            joinResult = null
        }
        if (handle == 0L || closed.get()) return
        send(
            SdkApi.SdkRequest
                .newBuilder()
                .setLeaveRoom(SdkApi.LeaveRoom.getDefaultInstance())
                .build()
        )
    }

    private var cameraPublishStarted = false
    private var microphonePublishStarted = false

    suspend fun startCamera() {
        val track = session.startCamera()
        showLocalCamera(track)
        if (cameraPublishStarted) return
        cameraPublishStarted = true
        scope.launch {
            publishWhileConnected(track, SdkApi.TrackKind.TRACK_KIND_VIDEO, SdkApi.TrackType.TRACK_TYPE_CAMERA)
        }
    }

    suspend fun startMicrophone() {
        val track = session.startMicrophone()
        if (microphonePublishStarted) return
        microphonePublishStarted = true
        scope.launch {
            publishWhileConnected(track, SdkApi.TrackKind.TRACK_KIND_AUDIO, SdkApi.TrackType.TRACK_TYPE_MICROPHONE)
        }
    }

    private suspend fun publishWhileConnected(
        track: org.webrtc.MediaStreamTrack,
        kind: SdkApi.TrackKind,
        type: SdkApi.TrackType
    ) {
        while (!closed.get()) {
            peerStatus.first { status -> status == PeerStatus.Connected }
            if (closed.get()) return
            val trackId = publish(kind, type)
            session.bind(trackId, track)
            peerStatus.first { status -> status != PeerStatus.Connected }
        }
    }

    private var localCamera: org.webrtc.VideoTrack? = null

    private fun showLocalCamera(track: org.webrtc.VideoTrack) {
        localCamera = track
        _roomState.value = withLocalCamera(_roomState.value)
    }

    private fun withLocalCamera(current: RoomState): RoomState {
        val track = localCamera ?: return current
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
        synchronized(joinLock) {
            joinResult?.cancel()
            joinResult = null
        }
        session.close()
        scope.cancel()
        NativeCore.nativeDestroy(handle)
    }

    private fun dispatch(event: SdkApi.SdkEvent) {
        when (event.contentCase) {
            SdkApi.SdkEvent.ContentCase.PEER_STATUS_CHANGED -> {
                val update = peerStatusUpdate(event) ?: return
                _peerStatus.value = update.peerStatus
                val waiter = synchronized(joinLock) { joinResult }
                when {
                    update.peerStatus == PeerStatus.Connected -> waiter?.complete(Unit)
                    else -> joinFailure(update)?.let { waiter?.completeExceptionally(it) }
                }
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
                status == PeerStatus.Connected || status == PeerStatus.Error || status == PeerStatus.Idle
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
