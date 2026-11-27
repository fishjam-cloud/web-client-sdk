package io.fishjam.client

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import org.webrtc.AudioTrack
import org.webrtc.MediaStreamTrack
import org.webrtc.VideoTrack
import uniffi.fishjam_core.CoreEvent
import uniffi.fishjam_core.CorePeerState
import uniffi.fishjam_core.CoreRoomState
import uniffi.fishjam_core.CoreTrackMetadata
import uniffi.fishjam_core.CoreTrackState
import uniffi.fishjam_core.CoreTrackType
import uniffi.fishjam_core.CoreVadStatus

data class TrackMetadata(
    val type: String,
    val paused: Boolean,
    val displayName: String?
)

enum class VadStatus {
    Silence,
    Speech
}

data class Track(
    val trackId: String,
    val metadata: TrackMetadata?,
    val videoTrack: VideoTrack?,
    val audioTrack: AudioTrack?,
    val simulcastConfig: SimulcastConfig = SimulcastConfig.Disabled,
    val encoding: Variant? = null,
    val vadStatus: VadStatus = VadStatus.Silence
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

internal fun roomStateOf(core: CoreRoomState): RoomState = RoomState(
    localPeer = core.localPeer?.let(::peerOf),
    remotePeers = core.remotePeers.map(::peerOf)
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

/** The peer and track events of [FishjamEvent]. `null` for every other core event. */
internal fun peerTrackEventOf(event: CoreEvent, media: Map<String, MediaStreamTrack>): FishjamEvent? = when (event) {
    is CoreEvent.PeerJoined -> FishjamEvent.PeerJoined(peerOf(event.peer).attach(media))
    is CoreEvent.PeerLeft -> FishjamEvent.PeerLeft(peerOf(event.peer).attach(media))
    is CoreEvent.PeerUpdated -> FishjamEvent.PeerUpdated(peerOf(event.peer).attach(media))
    is CoreEvent.TrackAdded -> FishjamEvent.TrackAdded(event.peerId, trackOf(event.track).attach(media))
    is CoreEvent.TrackReady -> FishjamEvent.TrackReady(event.peerId, trackOf(event.track).attach(media))
    is CoreEvent.TrackRemoved -> FishjamEvent.TrackRemoved(event.peerId, trackOf(event.track).attach(media))
    is CoreEvent.TrackUpdated -> FishjamEvent.TrackUpdated(event.peerId, trackOf(event.track).attach(media))
    else -> null
}

/** Applies a peer or track event to the remote peers. Other events change nothing. */
internal fun RoomState.applying(event: FishjamEvent): RoomState {
    val remote = remotePeers.toMutableList()
    when (event) {
        is FishjamEvent.PeerJoined -> upsert(remote, event.peer)
        is FishjamEvent.PeerUpdated -> upsert(remote, event.peer)
        is FishjamEvent.PeerLeft -> remote.removeAll { it.id == event.peer.id }
        is FishjamEvent.TrackAdded -> updateTrack(remote, event.peerId) { it.replacing(event.track) }
        is FishjamEvent.TrackReady -> updateTrack(remote, event.peerId) { it.replacing(event.track) }
        is FishjamEvent.TrackUpdated -> updateTrack(remote, event.peerId) { it.replacing(event.track) }
        is FishjamEvent.TrackRemoved -> updateTrack(remote, event.peerId) { it.removing(event.track.trackId) }
        else -> return this
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

private fun peerOf(core: CorePeerState): PeerWithTracks = PeerWithTracks(
    id = core.id,
    metadata = peerMetadata(core.metadataJson),
    tracks = core.tracks.map(::trackOf),
    cameraTrack = core.cameraTrack?.let(::trackOf),
    microphoneTrack = core.microphoneTrack?.let(::trackOf),
    screenShareVideoTrack = core.screenShareVideoTrack?.let(::trackOf),
    screenShareAudioTrack = core.screenShareAudioTrack?.let(::trackOf),
    customVideoTracks = core.customVideoTracks.map(::trackOf),
    customAudioTracks = core.customAudioTracks.map(::trackOf)
)

private fun trackOf(core: CoreTrackState): Track = Track(
    trackId = core.trackId,
    metadata = metadataOf(core.metadata),
    videoTrack = null,
    audioTrack = null,
    simulcastConfig = simulcastOf(core.simulcastConfig),
    encoding = variantOf(core.encoding),
    vadStatus = vadStatusOf(core.vadStatus)
)

internal fun vadStatusOf(status: CoreVadStatus): VadStatus = when (status) {
    CoreVadStatus.SPEECH -> VadStatus.Speech
    CoreVadStatus.SILENCE -> VadStatus.Silence
}

/** Local peer first, then remote peers. A peer with no microphone is silent. */
internal fun voiceActivityOf(room: RoomState): Map<String, Boolean> {
    val speaking = linkedMapOf<String, Boolean>()
    room.localPeer?.let { peer -> speaking[peer.id] = peer.microphoneTrack?.vadStatus == VadStatus.Speech }
    room.remotePeers.forEach { peer -> speaking[peer.id] = peer.microphoneTrack?.vadStatus == VadStatus.Speech }
    return speaking
}

internal fun PeerWithTracks.withMicrophoneVad(status: VadStatus): PeerWithTracks {
    val mic = microphoneTrack ?: return this
    if (mic.vadStatus == status) return this
    val updated = mic.copy(vadStatus = status)
    return copy(
        microphoneTrack = updated,
        tracks = tracks.map { track -> if (track.trackId == updated.trackId) updated else track }
    )
}

private fun metadataOf(core: CoreTrackMetadata): TrackMetadata = TrackMetadata(
    type = trackTypeName(core.trackType),
    paused = core.paused,
    displayName = core.displayName?.takeIf { it.isNotEmpty() }
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

/** Display name from the local peer metadata, when that metadata is a JSON object with a string. */
internal fun customSourceDisplayName(metadata: Metadata?): String? {
    val peer = metadata?.peer as? JsonObject ?: return null
    val name = peer["displayName"] as? JsonPrimitive ?: return null
    return name.contentOrNull?.takeIf { it.isNotEmpty() }
}

internal fun trackTypeName(type: CoreTrackType): String = when (type) {
    CoreTrackType.CAMERA -> "camera"
    CoreTrackType.MICROPHONE -> "microphone"
    CoreTrackType.SCREEN_SHARE_VIDEO -> "screenShareVideo"
    CoreTrackType.SCREEN_SHARE_AUDIO -> "screenShareAudio"
    CoreTrackType.CUSTOM_VIDEO -> "customVideo"
    CoreTrackType.CUSTOM_AUDIO -> "customAudio"
    CoreTrackType.UNSPECIFIED -> ""
}
