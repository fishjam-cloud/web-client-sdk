@testable import FishjamClient
import WebRTC
import XCTest

final class PictureInPictureTests: XCTestCase {
    private let factory = RTCPeerConnectionFactory()

    private func peer(_ id: String, video: Bool = false) -> PeerWithTracks {
        let camera = video
            ? Track(
                trackId: "\(id)-camera",
                metadata: TrackMetadata(type: "camera", paused: false, displayName: nil),
                videoTrack: factory.videoTrack(with: factory.videoSource(), trackId: "\(id)-camera"),
                audioTrack: nil
            )
            : nil
        var peer = PeerWithTracks.empty
        peer.id = id
        peer.cameraTrack = camera
        peer.tracks = camera.map { [$0] } ?? []
        return peer
    }

    func testTheSpeakingPeerWins() {
        let peers = [peer("a", video: true), peer("b")]

        let picked = pickActiveSpeaker(remotePeers: peers, voiceActivity: ["a": false, "b": true], lastSpeakerId: "a")

        XCTAssertEqual(picked?.id, "b")
    }

    func testTheLastSpeakerStaysWhenNobodySpeaks() {
        let peers = [peer("a", video: true), peer("b")]

        XCTAssertEqual(pickActiveSpeaker(remotePeers: peers, voiceActivity: [:], lastSpeakerId: "b")?.id, "b")
    }

    func testALastSpeakerWhoLeftFallsBackToTheFirstPeerWithVideo() {
        let peers = [peer("a"), peer("b", video: true)]

        XCTAssertEqual(pickActiveSpeaker(remotePeers: peers, voiceActivity: [:], lastSpeakerId: "gone")?.id, "b")
    }

    func testNoRemoteVideoGivesNoSpeaker() {
        XCTAssertNil(pickActiveSpeaker(remotePeers: [peer("a")], voiceActivity: [:], lastSpeakerId: nil))
        XCTAssertNil(pickActiveSpeaker(remotePeers: [], voiceActivity: [:], lastSpeakerId: nil))
    }
}
