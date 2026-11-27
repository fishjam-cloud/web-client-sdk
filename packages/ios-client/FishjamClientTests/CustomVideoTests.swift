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

    func testSettingTheSameTrackTwiceSetsTheSourceOnce() throws {
        let core = FakeLocalSourceCore()
        let controller = makeController(core)
        let track = makeVideoTrack(id: "one")
        try controller.set(sourceId: "video", track: track)
        try controller.set(sourceId: "video", track: track)
        XCTAssertEqual(core.set.map(\.sourceId), ["video"])
        XCTAssertEqual(core.set.first?.type, .customVideo)
        XCTAssertEqual(core.set.first?.kind, .video)
    }

    func testSettingNilRemovesTheSource() throws {
        let core = FakeLocalSourceCore()
        let controller = makeController(core)
        try controller.set(sourceId: "video", track: makeVideoTrack(id: "one"))
        try controller.set(sourceId: "video", track: nil)
        XCTAssertEqual(core.removed, ["video"])
        XCTAssertNil(controller.track(sourceId: "video"))
    }

    func testSettingNilForAnUnknownSourceDoesNothing() throws {
        let core = FakeLocalSourceCore()
        let controller = makeController(core)
        try controller.set(sourceId: "video", track: nil)
        XCTAssertEqual(core.removed, [])
    }

    func testReplacingATrackKeepsTheSourceAndSetsTheNewTrack() throws {
        let core = FakeLocalSourceCore()
        let controller = makeController(core)
        try controller.set(sourceId: "video", track: makeVideoTrack(id: "one"))
        let second = makeVideoTrack(id: "two")
        try controller.set(sourceId: "video", track: second)
        XCTAssertEqual(core.set.count, 2)
        XCTAssertTrue(controller.track(sourceId: "video") === second)
    }

    func testBuiltInSourceIdsAreRejected() {
        let core = FakeLocalSourceCore()
        let controller = makeController(core)
        XCTAssertThrowsError(try controller.set(sourceId: cameraSourceId, track: makeVideoTrack(id: "one")))
        XCTAssertEqual(core.set.count, 0)
    }

    private func makeController(_ core: FakeLocalSourceCore) -> CustomSourceController {
        let sources = LocalSources(core: core, sink: FakeLocalSourceSink())
        return CustomSourceController(sources: sources, isOpen: { true }, captureGeneration: { 1 })
    }
}
