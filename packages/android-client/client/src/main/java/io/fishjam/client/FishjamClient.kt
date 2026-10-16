package io.fishjam.client

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
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

class FishjamClient(
    fishjamId: String,
    debug: Boolean = false
) : AutoCloseable {
    private val _peerStatus = MutableStateFlow(PeerStatus.Idle)
    val peerStatus: StateFlow<PeerStatus> = _peerStatus.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val closed = AtomicBoolean(false)
    private val joinLock = Any()
    private var joinResult: CompletableDeferred<Unit>? = null

    private val events =
        NativeEvents { payload ->
            val update = peerStatusUpdate(SdkApi.SdkEvent.parseFrom(payload)) ?: return@NativeEvents
            scope.launch {
                if (closed.get()) return@launch
                _peerStatus.value = update.peerStatus
                val waiter = synchronized(joinLock) { joinResult }
                when {
                    update.peerStatus == PeerStatus.Connected -> waiter?.complete(Unit)
                    else -> joinFailure(update)?.let { waiter?.completeExceptionally(it) }
                }
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
            val request =
                SdkApi.SdkRequest
                    .newBuilder()
                    .setJoinRoom(
                        SdkApi.JoinRoom
                            .newBuilder()
                            .setPeerToken(peerToken)
                            .setPeerMetadataJson(peerMetadata.toString())
                    ).build()
            val result = NativeCore.nativeCall(handle, request.toByteArray())
            if (result.code != 0) {
                val response = SdkApi.SdkResponse.parseFrom(result.payload)
                throw IllegalStateException(response.error.message)
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
        NativeCore.nativeCall(
            handle,
            SdkApi.SdkRequest
                .newBuilder()
                .setLeaveRoom(SdkApi.LeaveRoom.getDefaultInstance())
                .build()
                .toByteArray()
        )
    }

    override fun close() {
        if (!closed.compareAndSet(false, true)) return
        synchronized(joinLock) {
            joinResult?.cancel()
            joinResult = null
        }
        scope.cancel()
        NativeCore.nativeDestroy(handle)
    }
}
