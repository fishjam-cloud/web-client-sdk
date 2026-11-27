import WebRTC
import XCTest

@testable import FishjamClient

final class LocalSourcesTests: XCTestCase {
    func testSetSendsAMediaIdToTheCore() throws {
        let core = FakeLocalSourceCore()
        let sources = LocalSources(core: core, sink: FakeLocalSourceSink())
        try sources.set(
            sourceId: "builtin.camera",
            track: makeVideoTrack(id: "one"),
            kind: .video,
            type: .camera,
            generation: 1
        )
        let call = try XCTUnwrap(core.set.first)
        XCTAssertEqual(call.sourceId, "builtin.camera")
        XCTAssertEqual(call.kind, .video)
        XCTAssertEqual(call.type, .camera)
        XCTAssertFalse(call.mediaId.isEmpty)
    }

    func testPublishedBindsTheTrackOfThatMedia() throws {
        let core = FakeLocalSourceCore()
        let sink = FakeLocalSourceSink()
        let sources = LocalSources(core: core, sink: sink)
        let track = makeVideoTrack(id: "one")
        try sources.set(sourceId: "builtin.camera", track: track, kind: .video, type: .camera, generation: 7)
        sources.published(mediaId: try XCTUnwrap(core.set.first).mediaId, trackId: "t1")
        XCTAssertEqual(sink.added.map(\.trackId), ["t1"])
        XCTAssertEqual(sink.added.first?.type, .camera)
        XCTAssertEqual(sink.binds.map(\.trackId), ["t1"])
        XCTAssertTrue(sink.binds.first?.track === track)
    }

    func testPublishedAgainAfterARejoinStillBinds() throws {
        let core = FakeLocalSourceCore()
        let sink = FakeLocalSourceSink()
        let sources = LocalSources(core: core, sink: sink)
        try sources.set(
            sourceId: "builtin.microphone",
            track: makeVideoTrack(id: "one"),
            kind: .audio,
            type: .microphone,
            generation: 1
        )
        let mediaId = try XCTUnwrap(core.set.first).mediaId
        sources.published(mediaId: mediaId, trackId: "t1")
        sources.unpublished(trackId: "t1")
        sources.published(mediaId: mediaId, trackId: "t2")
        XCTAssertEqual(sink.binds.map(\.trackId), ["t1", "t2"])
    }

    func testReplacedPutsTheNewTrackOnTheSameTrackId() throws {
        let core = FakeLocalSourceCore()
        let sink = FakeLocalSourceSink()
        let sources = LocalSources(core: core, sink: sink)
        try sources.set(
            sourceId: "video",
            track: makeVideoTrack(id: "one"),
            kind: .video,
            type: .customVideo,
            generation: 1
        )
        let second = makeVideoTrack(id: "two")
        try sources.set(sourceId: "video", track: second, kind: .video, type: .customVideo, generation: 1)
        sources.replaced(mediaId: try XCTUnwrap(core.set.last).mediaId, trackId: "t1")
        XCTAssertEqual(sink.replacedMedia.map(\.trackId), ["t1"])
        XCTAssertTrue(sink.replacedMedia.first?.track === second)
        XCTAssertEqual(sink.replaced, ["t1"])
        XCTAssertEqual(sink.binds.count, 0)
    }

    func testANewerMediaDropsTheOlderMediaOfTheSameSource() throws {
        let core = FakeLocalSourceCore()
        let sink = FakeLocalSourceSink()
        let sources = LocalSources(core: core, sink: sink)
        try sources.set(
            sourceId: "video",
            track: makeVideoTrack(id: "one"),
            kind: .video,
            type: .customVideo,
            generation: 1
        )
        let older = try XCTUnwrap(core.set.first).mediaId
        try sources.set(
            sourceId: "video",
            track: makeVideoTrack(id: "two"),
            kind: .video,
            type: .customVideo,
            generation: 1
        )
        let newer = try XCTUnwrap(core.set.last).mediaId
        sources.published(mediaId: newer, trackId: "t2")
        sources.published(mediaId: older, trackId: "t1")
        XCTAssertEqual(sink.binds.map(\.trackId), ["t2"])
    }

    func testUnpublishedReportsTheTrackRemoved() {
        let sink = FakeLocalSourceSink()
        LocalSources(core: FakeLocalSourceCore(), sink: sink).unpublished(trackId: "t1")
        XCTAssertEqual(sink.removed, ["t1"])
    }

    func testARejectedSourceKeepsItsMediaForALaterPublish() throws {
        let core = FakeLocalSourceCore()
        let sink = FakeLocalSourceSink()
        let sources = LocalSources(core: core, sink: sink)
        try sources.set(
            sourceId: "builtin.screenShare",
            track: makeVideoTrack(id: "one"),
            kind: .video,
            type: .screenShareVideo,
            generation: 1
        )
        let mediaId = try XCTUnwrap(core.set.first).mediaId
        sources.rejected()
        sources.published(mediaId: mediaId, trackId: "t1")
        XCTAssertEqual(sink.binds.map(\.trackId), ["t1"])
    }

    func testRemoveDropsTheMediaAndTellsTheCore() throws {
        let core = FakeLocalSourceCore()
        let sink = FakeLocalSourceSink()
        let sources = LocalSources(core: core, sink: sink)
        try sources.set(
            sourceId: "video",
            track: makeVideoTrack(id: "one"),
            kind: .video,
            type: .customVideo,
            generation: 1
        )
        let mediaId = try XCTUnwrap(core.set.first).mediaId
        sources.remove(sourceId: "video")
        XCTAssertEqual(core.removed, ["video"])
        sources.published(mediaId: mediaId, trackId: "t1")
        XCTAssertEqual(sink.binds.count, 0)
    }

    func testAFailedSetDropsItsMedia() throws {
        let core = FakeLocalSourceCore()
        core.failure = FakeCoreFailure()
        let sink = FakeLocalSourceSink()
        let sources = LocalSources(core: core, sink: sink)
        XCTAssertThrowsError(
            try sources.set(
                sourceId: "video",
                track: makeVideoTrack(id: "one"),
                kind: .video,
                type: .customVideo,
                generation: 1
            )
        )
        sources.published(mediaId: try XCTUnwrap(core.failedMediaId), trackId: "t1")
        XCTAssertEqual(sink.binds.count, 0)
    }

    func testMuteTellsTheCoreAndTakesTheMediaOffTheSender() throws {
        let core = FakeLocalSourceCore()
        let sink = FakeLocalSourceSink()
        let sources = LocalSources(core: core, sink: sink)
        try sources.set(
            sourceId: "builtin.camera",
            track: makeVideoTrack(id: "local"),
            kind: .video,
            type: .camera,
            generation: 1
        )
        sources.published(mediaId: try XCTUnwrap(core.set.last?.mediaId), trackId: "t1")

        sources.mute(sourceId: "builtin.camera")
        XCTAssertEqual(core.muted, ["builtin.camera"])

        sources.muted(trackId: "t1")
        XCTAssertEqual(sink.senderMuted, ["t1"])
        XCTAssertEqual(sink.mutedEvents, ["t1"])
        XCTAssertEqual(sink.removed, [], "the track is kept")
    }

    func testReplaceAfterMuteUnmutesTheSameTrack() throws {
        let core = FakeLocalSourceCore()
        let sink = FakeLocalSourceSink()
        let sources = LocalSources(core: core, sink: sink)
        try sources.set(
            sourceId: "builtin.microphone",
            track: makeVideoTrack(id: "first"),
            kind: .audio,
            type: .microphone,
            generation: 1
        )
        sources.published(mediaId: try XCTUnwrap(core.set.last?.mediaId), trackId: "t1")
        sources.muted(trackId: "t1")

        let second = makeVideoTrack(id: "second")
        try sources.set(
            sourceId: "builtin.microphone",
            track: second,
            kind: .audio,
            type: .microphone,
            generation: 2
        )
        sources.replaced(mediaId: try XCTUnwrap(core.set.last?.mediaId), trackId: "t1")

        XCTAssertTrue(sink.replacedMedia.first?.track === second)
        XCTAssertEqual(sink.unmutedEvents, ["t1"])
        XCTAssertEqual(sink.replaced, [], "an unmute is not a switch")
    }

    func testReplaceOfALiveTrackIsNotAnUnmute() throws {
        let core = FakeLocalSourceCore()
        let sink = FakeLocalSourceSink()
        let sources = LocalSources(core: core, sink: sink)
        try sources.set(
            sourceId: "builtin.camera",
            track: makeVideoTrack(id: "first"),
            kind: .video,
            type: .camera,
            generation: 1
        )
        sources.published(mediaId: try XCTUnwrap(core.set.last?.mediaId), trackId: "t1")

        try sources.set(
            sourceId: "builtin.camera",
            track: makeVideoTrack(id: "second"),
            kind: .video,
            type: .camera,
            generation: 1
        )
        sources.replaced(mediaId: try XCTUnwrap(core.set.last?.mediaId), trackId: "t1")

        XCTAssertEqual(sink.replaced, ["t1"])
        XCTAssertEqual(sink.unmutedEvents, [])
    }
}

func makeVideoTrack(id: String) -> VideoTrack {
    RTCPeerConnectionFactory.initialize()
    let factory = RTCPeerConnectionFactory()
    return factory.videoTrack(with: factory.videoSource(), trackId: id)
}

struct FakeCoreFailure: Error {}

final class FakeLocalSourceCore: LocalSourceCore {
    struct SetCall {
        let sourceId: String
        let mediaId: String
        let kind: CoreTrackKind
        let type: CoreTrackType
    }

    var set: [SetCall] = []
    var muted: [String] = []
    var removed: [String] = []
    var failure: Error?
    var failedMediaId: String?

    func setLocalSource(sourceId: String, mediaId: String, kind: CoreTrackKind, type: CoreTrackType) throws {
        if let failure {
            failedMediaId = mediaId
            throw failure
        }
        set.append(SetCall(sourceId: sourceId, mediaId: mediaId, kind: kind, type: type))
    }

    func muteLocalSource(sourceId: String) {
        muted.append(sourceId)
    }

    func removeLocalSource(sourceId: String) {
        removed.append(sourceId)
    }
}

final class FakeLocalSourceSink: LocalSourceSink {
    var added: [(trackId: String, type: CoreTrackType)] = []
    var removed: [String] = []
    var replaced: [String] = []
    var binds: [(trackId: String, track: RTCMediaStreamTrack)] = []
    var replacedMedia: [(trackId: String, track: RTCMediaStreamTrack)] = []
    var senderMuted: [String] = []
    var mutedEvents: [String] = []
    var unmutedEvents: [String] = []

    func bind(trackId: String, track: RTCMediaStreamTrack, generation: Int) {
        binds.append((trackId, track))
    }

    func replace(trackId: String, track: RTCMediaStreamTrack) {
        replacedMedia.append((trackId, track))
    }

    func mute(trackId: String) {
        senderMuted.append(trackId)
    }

    func localTrackMuted(trackId: String) {
        mutedEvents.append(trackId)
    }

    func localTrackUnmuted(trackId: String) {
        unmutedEvents.append(trackId)
    }

    func localTrackAdded(trackId: String, type: CoreTrackType) {
        added.append((trackId, type))
    }

    func localTrackRemoved(trackId: String) {
        removed.append(trackId)
    }

    func localTrackReplaced(trackId: String) {
        replaced.append(trackId)
    }
}
