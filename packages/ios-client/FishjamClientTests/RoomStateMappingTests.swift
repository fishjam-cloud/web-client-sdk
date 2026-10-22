@testable import FishjamClient
import XCTest

final class RoomStateMappingTests: XCTestCase {
    func testMapsLocalMicrophoneAndRemoteCamera() {
        var local = Fishjam_Sdk_PeerState()
        local.id = "local"
        local.metadataJson = #"{"peer":{"name":"me"}}"#
        local.microphoneTrack = track("local:mic", .microphone)

        var remote = Fishjam_Sdk_PeerState()
        remote.id = "remote"
        remote.cameraTrack = track("remote:cam", .camera)

        var proto = Fishjam_Sdk_RoomState()
        proto.localPeer = local
        proto.remotePeers = [remote]

        let room = makeRoomState(proto)

        XCTAssertEqual(room.localPeer?.id, "local")
        let peer = room.localPeer?.metadata?["peer"] as? [String: Any]
        XCTAssertEqual(peer?["name"] as? String, "me")
        XCTAssertEqual(room.localPeer?.microphoneTrack?.metadata?.type, "microphone")
        XCTAssertEqual(room.localPeer?.microphoneTrack?.metadata?.paused, false)
        XCTAssertNil(room.localPeer?.cameraTrack)
        XCTAssertEqual(room.remotePeers.count, 1)
        XCTAssertEqual(room.remotePeers.first?.id, "remote")
        XCTAssertEqual(room.remotePeers.first?.cameraTrack?.metadata?.type, "camera")
        XCTAssertNil(room.remotePeers.first?.metadata)
    }

    private func track(_ id: String, _ type: Fishjam_Sdk_TrackType) -> Fishjam_Sdk_TrackState {
        var metadata = Fishjam_Sdk_TrackMetadata()
        metadata.type = type
        metadata.paused = false
        var state = Fishjam_Sdk_TrackState()
        state.trackID = id
        state.metadata = metadata
        return state
    }
}
