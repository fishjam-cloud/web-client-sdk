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
        let peer = room.localPeer?.metadata?.peer as? [String: Any]
        XCTAssertEqual(peer?["name"] as? String, "me")
        XCTAssertNil(room.localPeer?.metadata?.server)
        XCTAssertEqual(room.localPeer?.microphoneTrack?.metadata?.type, "microphone")
        XCTAssertEqual(room.localPeer?.microphoneTrack?.metadata?.paused, false)
        XCTAssertNil(room.localPeer?.cameraTrack)
        XCTAssertEqual(room.remotePeers.count, 1)
        XCTAssertEqual(room.remotePeers.first?.id, "remote")
        XCTAssertEqual(room.remotePeers.first?.cameraTrack?.metadata?.type, "camera")
        XCTAssertNil(room.remotePeers.first?.metadata)
    }

    func testPeerJoinedAddsRemotePeerSplitByTrackType() {
        var camera = track("remote:cam", .camera)
        var custom = track("remote:custom", .customVideo)
        var peer = Fishjam_Sdk_PeerState()
        peer.id = "remote"
        peer.cameraTrack = camera
        peer.customVideoTracks = [custom]
        peer.tracks = [camera, custom]
        var joined = Fishjam_Sdk_PeerJoined()
        joined.peer = peer
        var event = Fishjam_Sdk_SdkEvent()
        event.peerJoined = joined

        let roomEvent = roomEvent(of: event, media: [:])
        guard case let .peerJoined(joinedPeer)? = roomEvent else {
            return XCTFail("expected peerJoined")
        }
        let room = applying(roomEvent!, to: .empty)

        XCTAssertEqual(joinedPeer.cameraTrack?.trackId, "remote:cam")
        XCTAssertEqual(joinedPeer.customVideoTracks.map(\.trackId), ["remote:custom"])
        XCTAssertEqual(room.remotePeers.map(\.id), ["remote"])
        XCTAssertEqual(room.remotePeers[0].cameraTrack?.metadata?.type, "camera")
    }

    func testTrackReadyThenRemovedUpdatesThePeer() {
        var peer = Fishjam_Sdk_PeerState()
        peer.id = "remote"
        peer.cameraTrack = track("remote:cam", .camera)
        peer.tracks = [peer.cameraTrack]
        var joined = Fishjam_Sdk_PeerJoined()
        joined.peer = peer
        var joinedEvent = Fishjam_Sdk_SdkEvent()
        joinedEvent.peerJoined = joined
        var room = applying(roomEvent(of: joinedEvent, media: [:])!, to: .empty)

        var ready = Fishjam_Sdk_TrackReady()
        ready.peerID = "remote"
        ready.track = track("remote:cam", .camera)
        var readyEvent = Fishjam_Sdk_SdkEvent()
        readyEvent.trackReady = ready
        guard case let .trackReady(peerId, readyTrack)? = roomEvent(of: readyEvent, media: [:]) else {
            return XCTFail("expected trackReady")
        }
        room = applying(.trackReady(peerId: peerId, track: readyTrack), to: room)
        XCTAssertEqual(room.remotePeers[0].cameraTrack?.trackId, "remote:cam")

        room = applying(.trackRemoved(peerId: "remote", track: readyTrack), to: room)
        XCTAssertNil(room.remotePeers[0].cameraTrack)
        XCTAssertTrue(room.remotePeers[0].tracks.isEmpty)

        room = applying(.peerLeft(room.remotePeers[0]), to: room)
        XCTAssertTrue(room.remotePeers.isEmpty)
    }

    func testSplitsPeerAndServerMetadata() {
        var local = Fishjam_Sdk_PeerState()
        local.id = "local"
        local.metadataJson = #"{"peer":{"name":"me"},"server":{"role":"host"}}"#

        var raw = Fishjam_Sdk_PeerState()
        raw.id = "raw"
        raw.metadataJson = #"{"name":"raw"}"#

        var blank = Fishjam_Sdk_PeerState()
        blank.id = "blank"
        blank.metadataJson = ""

        var proto = Fishjam_Sdk_RoomState()
        proto.localPeer = local
        proto.remotePeers = [raw, blank]

        let room = makeRoomState(proto)
        let peer = room.localPeer?.metadata?.peer as? [String: Any]
        let server = room.localPeer?.metadata?.server as? [String: Any]
        XCTAssertEqual(peer?["name"] as? String, "me")
        XCTAssertEqual(server?["role"] as? String, "host")

        let rawPeer = room.remotePeers[0].metadata?.peer as? [String: Any]
        XCTAssertEqual(rawPeer?["name"] as? String, "raw")
        XCTAssertNil(room.remotePeers[0].metadata?.server)
        XCTAssertNil(room.remotePeers[1].metadata)
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
