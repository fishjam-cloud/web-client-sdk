package io.fishjam.client

import fishjam.sdk.SdkApi
import kotlinx.serialization.json.Json
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

data class PeerWithTracks(
    val id: String,
    val metadata: JsonObject?,
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

private fun peerOf(proto: SdkApi.PeerState): PeerWithTracks = PeerWithTracks(
    id = proto.id,
    metadata = metadataObject(proto.metadataJson),
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

private fun metadataObject(json: String): JsonObject? {
    if (json.isBlank()) return null
    return runCatching { Json.parseToJsonElement(json) as? JsonObject }.getOrNull()
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
