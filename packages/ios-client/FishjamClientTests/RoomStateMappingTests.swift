@testable import FishjamClient
import WebRTC
import XCTest

final class RoomStateMappingTests: XCTestCase {
    func testMapsLocalMicrophoneAndRemoteCamera() {
        var local = corePeer("local")
        local.metadataJson = #"{"peer":{"name":"me"}}"#
        local.microphoneTrack = track("local:mic", .microphone)

        var remote = corePeer("remote")
        remote.cameraTrack = track("remote:cam", .camera)

        var proto = coreRoom()
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
        var peer = corePeer("remote")
        peer.cameraTrack = camera
        peer.customVideoTracks = [custom]
        peer.tracks = [camera, custom]
        let event = CoreEvent.peerJoined(peer: peer)

        let mapped = peerTrackEvent(of: event, media: [:])
        guard case let .peerJoined(joinedPeer)? = mapped else {
            return XCTFail("expected peerJoined")
        }
        let room = applying(mapped!, to: .empty)

        XCTAssertEqual(joinedPeer.cameraTrack?.trackId, "remote:cam")
        XCTAssertEqual(joinedPeer.customVideoTracks.map(\.trackId), ["remote:custom"])
        XCTAssertEqual(room.remotePeers.map(\.id), ["remote"])
        XCTAssertEqual(room.remotePeers[0].cameraTrack?.metadata?.type, "camera")
    }

    func testTrackReadyThenRemovedUpdatesThePeer() {
        var peer = corePeer("remote")
        peer.cameraTrack = track("remote:cam", .camera)
        peer.tracks = [peer.cameraTrack!]
        let joinedEvent = CoreEvent.peerJoined(peer: peer)
        var room = applying(peerTrackEvent(of: joinedEvent, media: [:])!, to: .empty)

        let readyEvent = CoreEvent.trackReady(peerId: "remote", track: track("remote:cam", .camera))
        guard case let .trackReady(peerId, readyTrack)? = peerTrackEvent(of: readyEvent, media: [:]) else {
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
        var local = corePeer("local")
        local.metadataJson = #"{"peer":{"name":"me"},"server":{"role":"host"}}"#

        var raw = corePeer("raw")
        raw.metadataJson = #"{"name":"raw"}"#

        var blank = corePeer("blank")
        blank.metadataJson = ""

        var proto = coreRoom()
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

    func testMapsSimulcastConfigAndCurrentEncoding() {
        var camera = track("remote:cam", .camera)
        var simulcast = CoreSimulcastConfig(enabled: false, enabledVariants: [], disabledVariants: [])
        simulcast.enabled = true
        simulcast.enabledVariants = [.low, .medium]
        simulcast.disabledVariants = [.high]
        camera.simulcastConfig = simulcast
        camera.encoding = .medium

        var remote = corePeer("remote")
        remote.cameraTrack = camera
        remote.tracks = [camera]
        var proto = coreRoom()
        proto.remotePeers = [remote]

        let mapped = makeRoomState(proto).remotePeers[0].cameraTrack
        XCTAssertEqual(mapped?.simulcastConfig.enabled, true)
        XCTAssertEqual(mapped?.simulcastConfig.enabledVariants, [.low, .medium])
        XCTAssertEqual(mapped?.simulcastConfig.disabledVariants, [.high])
        XCTAssertEqual(mapped?.encoding, .medium)
        XCTAssertNil(mapped?.videoTrack)
    }

    func testRoomSnapshotKeepsTheAttachedMediaTrack() {
        var first = track("remote:cam", .camera)
        first.encoding = .low
        var firstPeer = corePeer("remote")
        firstPeer.cameraTrack = first
        firstPeer.tracks = [first]
        var firstRoom = coreRoom()
        firstRoom.remotePeers = [firstPeer]

        let factory = RTCPeerConnectionFactory()
        let video = factory.videoTrack(with: factory.videoSource(), trackId: "remote-video")
        let attached = makeRoomState(firstRoom).attaching(["remote:cam": video])
        XCTAssertTrue(attached.remotePeers[0].cameraTrack?.videoTrack === video)

        var next = track("remote:cam", .camera)
        next.encoding = .high
        var simulcast = CoreSimulcastConfig(enabled: false, enabledVariants: [], disabledVariants: [])
        simulcast.enabled = true
        simulcast.enabledVariants = [.high]
        next.simulcastConfig = simulcast
        var nextPeer = corePeer("remote")
        nextPeer.cameraTrack = next
        nextPeer.tracks = [next]
        var nextRoom = coreRoom()
        nextRoom.remotePeers = [nextPeer]

        let refreshed = makeRoomState(nextRoom).attaching(["remote:cam": video])
        XCTAssertTrue(refreshed.remotePeers[0].cameraTrack?.videoTrack === video)
        XCTAssertEqual(refreshed.remotePeers[0].cameraTrack?.encoding, .high)
        XCTAssertEqual(refreshed.remotePeers[0].cameraTrack?.simulcastConfig.enabledVariants, [.high])
    }

    func testMapsSpeechOnTheMicrophoneAndSilenceByDefault() {
        let quiet = track("local:mic", .microphone)
        var speech = track("remote:mic", .microphone)
        speech.vadStatus = .speech
        var local = corePeer("local")
        local.microphoneTrack = quiet
        local.tracks = [quiet]
        var remote = corePeer("remote")
        remote.microphoneTrack = speech
        remote.tracks = [speech]
        var proto = coreRoom()
        proto.localPeer = local
        proto.remotePeers = [remote]

        let room = makeRoomState(proto)

        XCTAssertEqual(room.localPeer?.microphoneTrack?.vadStatus, .silence)
        XCTAssertEqual(room.remotePeers[0].microphoneTrack?.vadStatus, .speech)
        XCTAssertEqual(voiceActivityMap(of: room), ["local": false, "remote": true])
    }

    func testTrackUpdatedAppliesVadStatus() {
        let quiet = track("remote:mic", .microphone)
        var peer = corePeer("remote")
        peer.microphoneTrack = quiet
        peer.tracks = [quiet]
        let joined = CoreEvent.peerJoined(peer: peer)

        var speech = quiet
        speech.vadStatus = .speech
        let updatedEvent = CoreEvent.trackUpdated(peerId: "remote", track: speech)

        let updated = peerTrackEvent(of: updatedEvent, media: [:])
        let room = applying(updated!, to: applying(peerTrackEvent(of: joined, media: [:])!, to: .empty))

        if case let .trackUpdated(_, track) = updated {
            XCTAssertEqual(track.vadStatus, .speech)
        } else {
            XCTFail("expected trackUpdated")
        }
        XCTAssertEqual(room.remotePeers[0].microphoneTrack?.vadStatus, .speech)
        XCTAssertEqual(voiceActivityMap(of: room), ["remote": true])
    }

    private func track(_ id: String, _ type: CoreTrackType) -> CoreTrackState {
        coreTrack(id, type)
    }
}
