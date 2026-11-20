@testable import FishjamClient

func corePeer(_ id: String = "") -> CorePeerState {
    CorePeerState(
        id: id,
        metadataJson: "",
        tracks: [],
        cameraTrack: nil,
        microphoneTrack: nil,
        screenShareVideoTrack: nil,
        screenShareAudioTrack: nil,
        customVideoTracks: [],
        customAudioTracks: []
    )
}

func coreTrack(_ id: String, _ type: CoreTrackType) -> CoreTrackState {
    CoreTrackState(
        trackId: id,
        metadata: CoreTrackMetadata(trackType: type, paused: false, displayName: nil),
        simulcastConfig: CoreSimulcastConfig(enabled: false, enabledVariants: [], disabledVariants: []),
        negotiationStatus: .done,
        encoding: .unspecified,
        ready: false,
        vadStatus: .silence
    )
}

func coreRoom(local: CorePeerState? = nil, remote: [CorePeerState] = []) -> CoreRoomState {
    CoreRoomState(localPeer: local, remotePeers: remote)
}

func coreFailure(
    _ detail: String = "",
    auth: CoreAuthErrorReason? = nil,
    join: CoreJoinErrorReason? = nil
) -> CoreError {
    .Failed(detail: detail, authReason: auth, joinReason: join)
}
