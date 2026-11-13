package io.fishjam.client

import fishjam.sdk.SdkApi
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.serialization.json.JsonObject
import org.webrtc.MediaStreamTrack

/**
 * Everything that happens to a [FishjamClient], delivered in order through [FishjamClient.events].
 *
 * This is the same set as the web and React Native `FishjamClient.on(...)` events, except for events
 * that the native SDKs have no source for: `socketOpen`, `socketClose`, `socketError`, components,
 * `tracksPriorityChanged`, `bandwidthEstimationChanged`, data channels, `localTrackMuted`,
 * `localTrackUnmuted`, `localTrackEncodingEnabled` and `localTrackEncodingDisabled`.
 */
sealed class FishjamEvent {
    // Connection and auth

    /** `joinRoom` started connecting. */
    data object ConnectionStarted : FishjamEvent()

    /** The server accepted the peer token. [audioOnly] is true for an audio-only room. */
    data class AuthSuccess(val audioOnly: Boolean) : FishjamEvent()

    /** The server rejected the peer token. [Disconnected] follows. */
    data class AuthError(val reason: AuthErrorReason) : FishjamEvent()

    /** The peer is in the room. Sent again after every successful reconnection. */
    data class Joined(val peerId: String, val peers: List<PeerWithTracks>) : FishjamEvent()

    /** The server refused the join. [Disconnected] follows. */
    data class JoinError(val reason: JoinErrorReason) : FishjamEvent()

    /** The connection failed for a reason that is not an auth or join error. [Disconnected] follows. */
    data class ConnectionError(val message: String) : FishjamEvent()

    /** The client left the room or lost the connection for good. Never sent while reconnecting. */
    data object Disconnected : FishjamEvent()

    // Reconnection

    data object ReconnectionStarted : FishjamEvent()

    /** Sent after [Joined] once a reconnection succeeded. */
    data object Reconnected : FishjamEvent()

    /** Every reconnection attempt failed. [Disconnected] follows. */
    data object ReconnectionRetriesLimitReached : FishjamEvent()

    // Remote peers and tracks

    data class PeerJoined(val peer: PeerWithTracks) : FishjamEvent()

    data class PeerLeft(val peer: PeerWithTracks) : FishjamEvent()

    data class PeerUpdated(val peer: PeerWithTracks) : FishjamEvent()

    data class TrackAdded(val peerId: String, val track: Track) : FishjamEvent()

    data class TrackReady(val peerId: String, val track: Track) : FishjamEvent()

    data class TrackRemoved(val peerId: String, val track: Track) : FishjamEvent()

    data class TrackUpdated(val peerId: String, val track: Track) : FishjamEvent()

    // Local peer and tracks

    /** A local track was published. [type] is `camera` or `microphone`. */
    data class LocalTrackAdded(val trackId: String, val type: String) : FishjamEvent()

    data class LocalTrackRemoved(val trackId: String) : FishjamEvent()

    /** The camera was switched to another device. The track id stays. */
    data class LocalTrackReplaced(val trackId: String) : FishjamEvent()

    data class LocalTrackBandwidthSet(val trackId: String, val limit: BandwidthLimit) : FishjamEvent()

    data class LocalTrackEncodingBandwidthSet(
        val trackId: String,
        val variant: Variant,
        val kbps: Int
    ) : FishjamEvent()

    data class LocalPeerMetadataChanged(val metadata: JsonObject) : FishjamEvent()
}

/**
 * Turns each core event into zero or more [FishjamEvent]s.
 * It remembers the last status, the room, and whether a reconnection is running.
 * Call it from one thread, in the order the core sent the events.
 */
internal class FishjamEventMapper {
    private var peerStatus: PeerStatus = PeerStatus.Idle
    private var reconnecting = false
    private var retriesExhausted = false
    private var room = RoomState.Empty

    fun map(event: SdkApi.SdkEvent, media: Map<String, MediaStreamTrack>): List<FishjamEvent> {
        peerTrackEventOf(event, media)?.let { remote ->
            room = room.applying(remote)
            return listOf(remote)
        }
        return when (event.contentCase) {
            SdkApi.SdkEvent.ContentCase.AUTHENTICATED -> listOf(FishjamEvent.AuthSuccess(event.authenticated.audioOnly))
            SdkApi.SdkEvent.ContentCase.PEER_STATUS_CHANGED ->
                peerStatusUpdate(event)?.let { mapStatus(it.peerStatus) } ?: emptyList()
            SdkApi.SdkEvent.ContentCase.RECONNECTION_STATUS_CHANGED ->
                reconnectionStatusUpdate(event)?.let { mapReconnection(it) } ?: emptyList()
            SdkApi.SdkEvent.ContentCase.ROOM_STATE_CHANGED ->
                if (event.roomStateChanged.hasRoomState()) {
                    mapRoom(roomStateOf(event.roomStateChanged.roomState).attach(media))
                } else {
                    emptyList()
                }
            else -> emptyList()
        }
    }

    private fun mapStatus(status: PeerStatus): List<FishjamEvent> {
        val previous = peerStatus
        peerStatus = status
        val wasActive = previous == PeerStatus.Connecting || previous == PeerStatus.Connected
        return when (status) {
            PeerStatus.Connecting -> {
                reconnecting = false
                retriesExhausted = false
                listOf(FishjamEvent.ConnectionStarted)
            }
            PeerStatus.Connected -> {
                reconnecting = false
                listOf(FishjamEvent.Joined(room.localPeer?.id.orEmpty(), room.remotePeers))
            }
            is PeerStatus.Error -> {
                reconnecting = false
                val skipError = retriesExhausted
                retriesExhausted = false
                val events = mutableListOf<FishjamEvent>()
                if (!skipError) events += failureEvent(status)
                if (wasActive) events += FishjamEvent.Disconnected
                events
            }
            PeerStatus.Idle -> {
                reconnecting = false
                retriesExhausted = false
                if (wasActive) listOf(FishjamEvent.Disconnected) else emptyList()
            }
        }
    }

    private fun failureEvent(error: PeerStatus.Error): FishjamEvent = when {
        error.authReason != null -> FishjamEvent.AuthError(error.authReason)
        error.joinReason != null -> FishjamEvent.JoinError(error.joinReason)
        else -> FishjamEvent.ConnectionError(error.message)
    }

    private fun mapReconnection(status: ReconnectionStatus): List<FishjamEvent> = when (status) {
        ReconnectionStatus.Reconnecting ->
            if (reconnecting) {
                emptyList()
            } else {
                reconnecting = true
                listOf(FishjamEvent.ReconnectionStarted)
            }
        ReconnectionStatus.Error -> {
            reconnecting = false
            retriesExhausted = true
            listOf(FishjamEvent.ReconnectionRetriesLimitReached)
        }
        ReconnectionStatus.Idle -> {
            if (!reconnecting) {
                emptyList()
            } else {
                reconnecting = false
                val localPeer = room.localPeer
                if (localPeer == null) {
                    emptyList()
                } else {
                    listOf(FishjamEvent.Joined(localPeer.id, room.remotePeers), FishjamEvent.Reconnected)
                }
            }
        }
    }

    /**
     * The core clears the remote peers on a connection loss without sending `peerLeft`.
     * Report the peers that are gone from the new room, so the events match the room state.
     */
    private fun mapRoom(next: RoomState): List<FishjamEvent> {
        val remaining = next.remotePeers.map { it.id }.toSet()
        val events = mutableListOf<FishjamEvent>()
        room.remotePeers.filter { it.id !in remaining }.forEach { peer ->
            peer.tracks.forEach { track -> events += FishjamEvent.TrackRemoved(peer.id, track) }
            events += FishjamEvent.PeerLeft(peer)
        }
        room = RoomState(next.localPeer, next.remotePeers)
        return events
    }
}

/** Fans events out to every collector of [FishjamClient.events]. Safe to use from any thread. */
internal class EventHub {
    private val flow =
        MutableSharedFlow<FishjamEvent>(
            extraBufferCapacity = EVENT_BUFFER,
            onBufferOverflow = BufferOverflow.DROP_OLDEST
        )

    val events: SharedFlow<FishjamEvent> = flow.asSharedFlow()

    fun emit(event: FishjamEvent) {
        flow.tryEmit(event)
    }

    fun emit(events: List<FishjamEvent>) {
        events.forEach { flow.tryEmit(it) }
    }

    private companion object {
        const val EVENT_BUFFER = 1024
    }
}
