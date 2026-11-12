package io.fishjam.client

import fishjam.sdk.SdkApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import org.webrtc.AudioTrack
import org.webrtc.MediaStreamTrack
import org.webrtc.VideoTrack

data class TrackMetadata(
    val type: String,
    val paused: Boolean,
    val displayName: String?
)

data class Track(
    val trackId: String,
    val metadata: TrackMetadata?,
    val videoTrack: VideoTrack?,
    val audioTrack: AudioTrack?
)

data class Metadata(
    val peer: JsonElement? = null,
    val server: JsonElement? = null
)

data class PeerWithTracks(
    val id: String,
    val metadata: Metadata?,
    val tracks: List<Track>,
    val cameraTrack: Track?,
    val microphoneTrack: Track?,
    val screenShareVideoTrack: Track?,
    val screenShareAudioTrack: Track?,
    val customVideoTracks: List<Track>,
    val customAudioTracks: List<Track>
)

data class RoomState(
    val localPeer: PeerWithTracks?,
    val remotePeers: List<PeerWithTracks>
) {
    companion object {
        val Empty = RoomState(localPeer = null, remotePeers = emptyList())
    }
}

sealed class RoomEvent {
    data class PeerJoined(val peer: PeerWithTracks) : RoomEvent()

    data class PeerLeft(val peer: PeerWithTracks) : RoomEvent()

    data class PeerUpdated(val peer: PeerWithTracks) : RoomEvent()

    data class TrackAdded(val peerId: String, val track: Track) : RoomEvent()

    data class TrackReady(val peerId: String, val track: Track) : RoomEvent()

    data class TrackRemoved(val peerId: String, val track: Track) : RoomEvent()

    data class TrackUpdated(val peerId: String, val track: Track) : RoomEvent()
}

fun interface RoomEventListener {
    fun onRoomEvent(event: RoomEvent)
}

internal fun roomStateOf(proto: SdkApi.RoomState): RoomState = RoomState(
    localPeer = if (proto.hasLocalPeer()) peerOf(proto.localPeer) else null,
    remotePeers = proto.remotePeersList.map(::peerOf)
)

internal fun RoomState.attach(media: Map<String, MediaStreamTrack>): RoomState = copy(
    localPeer = localPeer?.attach(media),
    remotePeers = remotePeers.map { peer -> peer.attach(media) }
)

private fun PeerWithTracks.attach(media: Map<String, MediaStreamTrack>): PeerWithTracks = copy(
    tracks = tracks.map { track -> track.attach(media) },
    cameraTrack = cameraTrack?.attach(media),
    microphoneTrack = microphoneTrack?.attach(media),
    screenShareVideoTrack = screenShareVideoTrack?.attach(media),
    screenShareAudioTrack = screenShareAudioTrack?.attach(media),
    customVideoTracks = customVideoTracks.map { track -> track.attach(media) },
    customAudioTracks = customAudioTracks.map { track -> track.attach(media) }
)

private fun Track.attach(media: Map<String, MediaStreamTrack>): Track {
    val stream = media[trackId] ?: return this
    return when (stream) {
        is VideoTrack -> copy(videoTrack = stream)
        is AudioTrack -> copy(audioTrack = stream)
        else -> this
    }
}

internal fun roomEventOf(event: SdkApi.SdkEvent, media: Map<String, MediaStreamTrack>): RoomEvent? =
    when (event.contentCase) {
        SdkApi.SdkEvent.ContentCase.PEER_JOINED ->
            event.peerJoined.takeIf { it.hasPeer() }?.let { RoomEvent.PeerJoined(peerOf(it.peer).attach(media)) }
        SdkApi.SdkEvent.ContentCase.PEER_LEFT ->
            event.peerLeft.takeIf { it.hasPeer() }?.let { RoomEvent.PeerLeft(peerOf(it.peer).attach(media)) }
        SdkApi.SdkEvent.ContentCase.PEER_UPDATED ->
            event.peerUpdated.takeIf { it.hasPeer() }?.let { RoomEvent.PeerUpdated(peerOf(it.peer).attach(media)) }
        SdkApi.SdkEvent.ContentCase.TRACK_ADDED ->
            event.trackAdded.takeIf { it.hasTrack() }?.let {
                RoomEvent.TrackAdded(it.peerId, trackOf(it.track).attach(media))
            }
        SdkApi.SdkEvent.ContentCase.TRACK_READY ->
            event.trackReady.takeIf { it.hasTrack() }?.let {
                RoomEvent.TrackReady(it.peerId, trackOf(it.track).attach(media))
            }
        SdkApi.SdkEvent.ContentCase.TRACK_REMOVED ->
            event.trackRemoved.takeIf { it.hasTrack() }?.let {
                RoomEvent.TrackRemoved(it.peerId, trackOf(it.track).attach(media))
            }
        SdkApi.SdkEvent.ContentCase.TRACK_UPDATED ->
            event.trackUpdated.takeIf { it.hasTrack() }?.let {
                RoomEvent.TrackUpdated(it.peerId, trackOf(it.track).attach(media))
            }
        else -> null
    }

internal fun RoomState.applying(event: RoomEvent): RoomState {
    val remote = remotePeers.toMutableList()
    when (event) {
        is RoomEvent.PeerJoined -> upsert(remote, event.peer)
        is RoomEvent.PeerUpdated -> upsert(remote, event.peer)
        is RoomEvent.PeerLeft -> remote.removeAll { it.id == event.peer.id }
        is RoomEvent.TrackAdded -> updateTrack(remote, event.peerId) { it.replacing(event.track) }
        is RoomEvent.TrackReady -> updateTrack(remote, event.peerId) { it.replacing(event.track) }
        is RoomEvent.TrackUpdated -> updateTrack(remote, event.peerId) { it.replacing(event.track) }
        is RoomEvent.TrackRemoved -> updateTrack(remote, event.peerId) { it.removing(event.track.trackId) }
    }
    return copy(remotePeers = remote)
}

private fun upsert(remote: MutableList<PeerWithTracks>, peer: PeerWithTracks) {
    val index = remote.indexOfFirst { it.id == peer.id }
    if (index >= 0) remote[index] = peer else remote += peer
}

private fun updateTrack(
    remote: MutableList<PeerWithTracks>,
    peerId: String,
    change: (PeerWithTracks) -> PeerWithTracks
) {
    val index = remote.indexOfFirst { it.id == peerId }
    if (index >= 0) {
        remote[index] = change(remote[index])
    } else {
        remote += change(emptyPeer(peerId))
    }
}

private fun emptyPeer(id: String) = PeerWithTracks(
    id = id,
    metadata = null,
    tracks = emptyList(),
    cameraTrack = null,
    microphoneTrack = null,
    screenShareVideoTrack = null,
    screenShareAudioTrack = null,
    customVideoTracks = emptyList(),
    customAudioTracks = emptyList()
)

private fun PeerWithTracks.replacing(track: Track): PeerWithTracks =
    splitPeer(id, metadata, tracks.filter { it.trackId != track.trackId } + track)

private fun PeerWithTracks.removing(trackId: String): PeerWithTracks =
    splitPeer(id, metadata, tracks.filter { it.trackId != trackId })

private fun splitPeer(id: String, metadata: Metadata?, tracks: List<Track>): PeerWithTracks = PeerWithTracks(
    id = id,
    metadata = metadata,
    tracks = tracks,
    cameraTrack = tracks.firstOrNull { it.metadata?.type == "camera" },
    microphoneTrack = tracks.firstOrNull { it.metadata?.type == "microphone" },
    screenShareVideoTrack = tracks.firstOrNull { it.metadata?.type == "screenShareVideo" },
    screenShareAudioTrack = tracks.firstOrNull { it.metadata?.type == "screenShareAudio" },
    customVideoTracks = tracks.filter { it.metadata?.type == "customVideo" },
    customAudioTracks = tracks.filter { it.metadata?.type == "customAudio" }
)

private fun peerOf(proto: SdkApi.PeerState): PeerWithTracks = PeerWithTracks(
    id = proto.id,
    metadata = peerMetadata(proto.metadataJson),
    tracks = proto.tracksList.map(::trackOf),
    cameraTrack = proto.takeIf { it.hasCameraTrack() }?.cameraTrack?.let(::trackOf),
    microphoneTrack = proto.takeIf { it.hasMicrophoneTrack() }?.microphoneTrack?.let(::trackOf),
    screenShareVideoTrack = proto.takeIf { it.hasScreenShareVideoTrack() }?.screenShareVideoTrack?.let(::trackOf),
    screenShareAudioTrack = proto.takeIf { it.hasScreenShareAudioTrack() }?.screenShareAudioTrack?.let(::trackOf),
    customVideoTracks = proto.customVideoTracksList.map(::trackOf),
    customAudioTracks = proto.customAudioTracksList.map(::trackOf)
)

private fun trackOf(proto: SdkApi.TrackState): Track = Track(
    trackId = proto.trackId,
    metadata = if (proto.hasMetadata()) metadataOf(proto.metadata) else null,
    videoTrack = null,
    audioTrack = null
)

private fun metadataOf(proto: SdkApi.TrackMetadata): TrackMetadata = TrackMetadata(
    type = trackTypeName(proto.type),
    paused = proto.paused,
    displayName = proto.displayName.takeIf { proto.hasDisplayName() && it.isNotEmpty() }
)

private fun peerMetadata(json: String): Metadata? {
    if (json.isBlank()) return null
    val value = runCatching { Json.parseToJsonElement(json) }.getOrNull() ?: return null
    val obj = value as? JsonObject
    if (obj != null && obj.keys.all { it == "peer" || it == "server" }) {
        return Metadata(peer = obj["peer"], server = obj["server"])
    }
    return Metadata(peer = value)
}

private fun trackTypeName(type: SdkApi.TrackType): String = when (type) {
    SdkApi.TrackType.TRACK_TYPE_CAMERA -> "camera"
    SdkApi.TrackType.TRACK_TYPE_MICROPHONE -> "microphone"
    SdkApi.TrackType.TRACK_TYPE_SCREEN_SHARE_VIDEO -> "screenShareVideo"
    SdkApi.TrackType.TRACK_TYPE_SCREEN_SHARE_AUDIO -> "screenShareAudio"
    SdkApi.TrackType.TRACK_TYPE_CUSTOM_VIDEO -> "customVideo"
    SdkApi.TrackType.TRACK_TYPE_CUSTOM_AUDIO -> "customAudio"
    else -> ""
}
