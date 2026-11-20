package io.fishjam.client

import uniffi.fishjam_core.CoreAuthErrorReason
import uniffi.fishjam_core.CoreException
import uniffi.fishjam_core.CoreJoinErrorReason
import uniffi.fishjam_core.CoreNegotiationStatus
import uniffi.fishjam_core.CorePeerState
import uniffi.fishjam_core.CoreRoomState
import uniffi.fishjam_core.CoreSimulcastConfig
import uniffi.fishjam_core.CoreTrackMetadata
import uniffi.fishjam_core.CoreTrackState
import uniffi.fishjam_core.CoreTrackType
import uniffi.fishjam_core.CoreVadStatus
import uniffi.fishjam_core.CoreVariant

internal fun corePeer(
    id: String,
    metadataJson: String = "",
    tracks: List<CoreTrackState> = emptyList(),
    cameraTrack: CoreTrackState? = null,
    microphoneTrack: CoreTrackState? = null,
    screenShareVideoTrack: CoreTrackState? = null,
    customVideoTracks: List<CoreTrackState> = emptyList()
): CorePeerState = CorePeerState(
    id = id,
    metadataJson = metadataJson,
    tracks = tracks,
    cameraTrack = cameraTrack,
    microphoneTrack = microphoneTrack,
    screenShareVideoTrack = screenShareVideoTrack,
    screenShareAudioTrack = null,
    customVideoTracks = customVideoTracks,
    customAudioTracks = emptyList()
)

internal fun coreTrack(
    id: String,
    type: CoreTrackType = CoreTrackType.CAMERA,
    simulcastConfig: CoreSimulcastConfig = CoreSimulcastConfig(false, emptyList(), emptyList()),
    encoding: CoreVariant = CoreVariant.UNSPECIFIED,
    vadStatus: CoreVadStatus = CoreVadStatus.SILENCE
): CoreTrackState = CoreTrackState(
    trackId = id,
    metadata = CoreTrackMetadata(trackType = type, paused = false, displayName = null),
    simulcastConfig = simulcastConfig,
    negotiationStatus = CoreNegotiationStatus.DONE,
    encoding = encoding,
    ready = false,
    vadStatus = vadStatus
)

internal fun coreRoom(local: CorePeerState? = null, remote: List<CorePeerState> = emptyList()): CoreRoomState =
    CoreRoomState(localPeer = local, remotePeers = remote)

internal fun coreFailure(
    detail: String = "",
    auth: CoreAuthErrorReason? = null,
    join: CoreJoinErrorReason? = null
): CoreException = CoreException.Failed(detail, auth, join)
