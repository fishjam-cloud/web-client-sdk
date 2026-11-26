import WebRTC
import XCTest

@testable import FishjamClient

final class CustomVideoTests: XCTestCase {
    func testRotationKeepsOnlyRightAngles() {
        XCTAssertEqual(customVideoRotation(0), ._0)
        XCTAssertEqual(customVideoRotation(90), ._90)
        XCTAssertEqual(customVideoRotation(180), ._180)
        XCTAssertEqual(customVideoRotation(270), ._270)
        XCTAssertEqual(customVideoRotation(45), ._0)
        XCTAssertEqual(customVideoRotation(-90), ._0)
    }

    func testPoolSizeMustBePositive() {
        XCTAssertThrowsError(try requireCustomVideoPoolSize(width: 0, height: 10, poolSize: 1))
        XCTAssertThrowsError(try requireCustomVideoPoolSize(width: 10, height: 0, poolSize: 1))
        XCTAssertThrowsError(try requireCustomVideoPoolSize(width: 10, height: 10, poolSize: 0))
    }

    func testDisposingAPoolWhileAttachedThrows() throws {
        let gate = CustomVideoPoolGate()
        try gate.attach()
        XCTAssertThrowsError(try gate.dispose())
        gate.trackStopped()
        XCTAssertTrue(try gate.dispose())
        XCTAssertFalse(try gate.dispose())
    }

    func testAPoolAttachesToOneTrack() throws {
        let gate = CustomVideoPoolGate()
        try gate.attach()
        XCTAssertThrowsError(try gate.attach())
    }

    func testDisplayNameComesFromPeerMetadata() {
        let metadata = Metadata(peer: ["displayName": "Ada"])
        XCTAssertEqual(customSourceDisplayName(metadata), "Ada")
        XCTAssertNil(customSourceDisplayName(Metadata(peer: "Ada")))
        XCTAssertNil(customSourceDisplayName(nil))
    }

    func testSettingTheSameTrackTwiceDoesNothing() async throws {
        let host = FakeCustomSourceHost(status: .connected)
        let controller = CustomSourceController()
        let track = makeVideoTrack(id: "one")
        try await controller.set(sourceId: "video", track: track, host: host)
        await waitUntil { host.published.count == 1 }
        try await controller.set(sourceId: "video", track: track, host: host)
        await waitUntil { true }
        XCTAssertEqual(host.published, ["custom-0"])
        controller.close()
    }

    func testSettingNilUnpublishes() async throws {
        let host = FakeCustomSourceHost(status: .connected)
        let controller = CustomSourceController()
        try await controller.set(sourceId: "video", track: makeVideoTrack(id: "one"), host: host)
        await waitUntil { host.published.count == 1 }
        try await controller.set(sourceId: "video", track: nil, host: host)
        await waitUntil { host.removed.count == 1 }
        XCTAssertEqual(host.removed, ["custom-0"])
        XCTAssertNil(controller.track(sourceId: "video"))
        controller.close()
    }

    func testRepublishesAfterTheConnectionDrops() async throws {
        let host = FakeCustomSourceHost(status: .connected)
        let controller = CustomSourceController()
        try await controller.set(sourceId: "video", track: makeVideoTrack(id: "one"), host: host)
        await waitUntil { host.published.count == 1 && host.isWaiting }
        host.update(.connecting)
        host.update(.connected)
        await waitUntil { host.published.count == 2 }
        XCTAssertEqual(host.published, ["custom-0", "custom-1"])
        controller.close()
    }

    private func waitUntil(_ ready: () -> Bool) async {
        for _ in 0 ..< 50 {
            if ready() { return }
            await Task.yield()
        }
    }
}

private func makeVideoTrack(id: String) -> VideoTrack {
    RTCPeerConnectionFactory.initialize()
    let factory = RTCPeerConnectionFactory()
    return factory.videoTrack(with: factory.videoSource(), trackId: id)
}

private final class FakeCustomSourceHost: CustomSourceHost {
    var status: PeerStatus
    var published: [String] = []
    var removed: [String] = []
    private var next = 0
    private var waiter: CheckedContinuation<Void, Never>?
    private var waiterMatches: ((PeerStatus) -> Bool)?
    private(set) var isWaiting = false

    init(status: PeerStatus) {
        self.status = status
    }

    var peerStatus: PeerStatus { status }
    var isClosed: Bool { false }
    var audioOnly: Bool { false }
    var captureGeneration: Int { 1 }

    func publishCustomVideo() throws -> String {
        let id = "custom-\(next)"
        next += 1
        published.append(id)
        return id
    }

    func removePublishedTrack(_ trackId: String) async {
        removed.append(trackId)
    }

    func localTrackAdded(trackId: String) {}

    func localTrackRemoved(trackId: String) {}

    func bind(trackId: String, track: RTCMediaStreamTrack, generation: Int) {}

    func waitUntil(_ matches: @escaping (PeerStatus) -> Bool, isCurrent: @escaping () -> Bool) async {
        if !isCurrent() || matches(status) {
            return
        }
        await withCheckedContinuation { continuation in
            waiter = continuation
            waiterMatches = matches
            isWaiting = true
        }
    }

    func update(_ status: PeerStatus) {
        self.status = status
        guard let matches = waiterMatches, matches(status), let waiter else { return }
        self.waiter = nil
        isWaiting = false
        waiter.resume()
    }
}
