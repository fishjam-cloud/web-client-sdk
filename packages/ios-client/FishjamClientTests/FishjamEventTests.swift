@testable import FishjamClient
import XCTest

final class FishjamEventTests: XCTestCase {
    private var mapper = FishjamEventMapper()

    func testJoinEmitsConnectionStartedAuthSuccessAndJoined() {
        var names: [String] = []
        names += run(status(.connecting))
        names += run(authenticated())
        names += run(roomChanged(local: peer("local"), remote: [peer("remote", tracks: ["remote:cam"])]))
        names += run(status(.connected))

        XCTAssertEqual(names, ["connectionStarted", "authSuccess audioOnly=false", "joined local peers=remote"])
    }

    func testAuthSuccessReportsAudioOnlyRoom() {
        XCTAssertEqual(run(authenticated(audioOnly: true)), ["authSuccess audioOnly=true"])
    }

    func testAuthErrorIsFollowedByDisconnected() {
        _ = run(status(.connecting))
        let error = coreFailure("invalid token", auth: .invalidToken)

        XCTAssertEqual(run(status(.error, error: error)), ["authError invalidToken", "disconnected"])
    }

    func testRoomNotFoundIsAnAuthErrorOnly() {
        _ = run(status(.connecting))
        let error = coreFailure(auth: .roomNotFound, join: .roomNotFound)

        XCTAssertEqual(run(status(.error, error: error)), ["authError roomNotFound", "disconnected"])
    }

    func testJoinErrorIsFollowedByDisconnected() {
        _ = run(status(.connecting))
        let error = coreFailure(join: .reachedPeersLimit)

        XCTAssertEqual(run(status(.error, error: error)), ["joinError reachedPeersLimit", "disconnected"])
    }

    func testErrorWithoutReasonIsAConnectionError() {
        join()
        let error = coreFailure("ice failed")

        XCTAssertEqual(run(status(.error, error: error)), ["connectionError ice failed", "disconnected"])
    }

    func testLeavingEmitsDisconnectedOnce() {
        join()

        XCTAssertEqual(run(status(.idle)), ["disconnected"])
        XCTAssertEqual(run(status(.idle)), [])
    }

    func testIdleBeforeAnyJoinEmitsNothing() {
        XCTAssertEqual(run(status(.idle)), [])
    }

    func testReconnectionSucceedsWithJoined() {
        join()
        var names: [String] = []
        names += run(reconnection(.reconnecting))
        names += run(reconnection(.reconnecting))
        names += run(roomChanged(local: nil, remote: []))
        names += run(roomChanged(local: peer("local"), remote: []))
        names += run(reconnection(.idle))

        XCTAssertEqual(names, ["reconnectionStarted", "joined local peers=", "reconnected"])
    }

    func testNoDisconnectedWhileReconnecting() {
        join()
        let names = run(reconnection(.reconnecting)) + run(roomChanged(local: nil, remote: []))

        XCTAssertFalse(names.contains("disconnected"))
    }

    func testRetriesExhaustedEmitsLimitReachedThenDisconnectedWithoutReconnected() {
        join()
        let error = coreFailure("Reconnection attempts exhausted")
        var names: [String] = []
        names += run(reconnection(.reconnecting))
        names += run(reconnection(.error))
        names += run(status(.error, error: error))

        XCTAssertEqual(names, ["reconnectionStarted", "reconnectionRetriesLimitReached", "disconnected"])
    }

    func testLeavingWhileReconnectingNeverEmitsJoined() {
        join()
        _ = run(reconnection(.reconnecting))
        var names: [String] = []
        names += run(roomChanged(local: nil, remote: []))
        names += run(reconnection(.idle))
        names += run(status(.idle))
        names += run(status(.connecting))
        names += run(roomChanged(local: peer("local"), remote: []))
        names += run(status(.connected))

        XCTAssertEqual(names, ["disconnected", "connectionStarted", "joined local peers="])
    }

    func testPeerAndTrackEventsAreForwarded() {
        let joinedEvent = CoreEvent.peerJoined(peer: peer("remote", tracks: ["remote:cam"]))
        let readyEvent = CoreEvent.trackReady(peerId: "remote", track: coreTrack("remote:cam", .camera))
        let updatedEvent = CoreEvent.peerUpdated(peer: peer("remote"))

        XCTAssertEqual(run(joinedEvent), ["peerJoined remote tracks=1"])
        XCTAssertEqual(run(readyEvent), ["trackReady remote remote:cam"])
        XCTAssertEqual(run(updatedEvent), ["peerUpdated remote tracks=0"])
    }

    func testVoiceActivityChangedIsForwarded() {
        let event = CoreEvent.voiceActivityChanged(peerId: "remote", trackId: "remote:mic", vadStatus: .speech)

        XCTAssertEqual(run(event), ["voiceActivityChanged remote remote:mic speech"])
    }

    func testPeersMissingFromTheNewRoomAreReportedGone() {
        join(remote: [peer("remote", tracks: ["remote:cam", "remote:mic"])])
        _ = run(peerJoined(peer("remote", tracks: ["remote:cam", "remote:mic"])))
        _ = run(reconnection(.reconnecting))

        let names = run(roomChanged(local: nil, remote: []))

        XCTAssertEqual(names, ["trackRemoved remote remote:cam", "trackRemoved remote remote:mic", "peerLeft remote"])
    }

    func testPeerLeftFollowedByRoomStateDoesNotReportItTwice() {
        _ = run(peerJoined(peer("remote", tracks: [])))
        let leftEvent = CoreEvent.peerLeft(peer: peer("remote"))

        XCTAssertEqual(run(leftEvent), ["peerLeft remote"])
        XCTAssertEqual(run(roomChanged(local: nil, remote: [])), [])
    }

    func testHubDeliversInOrderToEveryStream() async {
        let hub = EventHub<FishjamEvent>()
        let first = hub.stream()
        let second = hub.stream()

        hub.emit([.connectionStarted, .disconnected])
        hub.finish()

        var firstNames: [String] = []
        for await event in first { firstNames.append(describeEvent(event)) }
        var secondNames: [String] = []
        for await event in second { secondNames.append(describeEvent(event)) }

        XCTAssertEqual(firstNames, ["connectionStarted", "disconnected"])
        XCTAssertEqual(secondNames, firstNames)
    }

    func testHubStreamSeesOnlyEventsAfterItWasCreated() async {
        let hub = EventHub<FishjamEvent>()
        hub.emit(.connectionStarted)
        let late = hub.stream()
        hub.emit(.reconnected)
        hub.finish()

        var names: [String] = []
        for await event in late { names.append(describeEvent(event)) }

        XCTAssertEqual(names, ["reconnected"])
    }

    func testHubForgetsAStreamThatWasCancelled() async {
        let hub = EventHub<FishjamEvent>()
        let task = Task {
            for await _ in hub.stream() {}
        }
        try? await Task.sleep(nanoseconds: 50_000_000)
        task.cancel()
        await task.value

        hub.emit(.connectionStarted)
        let later = hub.stream()
        hub.emit(.disconnected)
        hub.finish()

        var names: [String] = []
        for await event in later { names.append(describeEvent(event)) }
        XCTAssertEqual(names, ["disconnected"])
    }

    // MARK: Helpers

    private func join(remote: [CorePeerState] = []) {
        _ = run(status(.connecting))
        _ = run(authenticated())
        _ = run(roomChanged(local: peer("local"), remote: remote))
        _ = run(status(.connected))
    }

    private func run(_ event: CoreEvent) -> [String] {
        mapper.map(event, media: [:]).map(describeEvent)
    }

    private func status(_ status: CorePeerStatus, error: CoreError? = nil) -> CoreEvent {
        .peerStatusChanged(peerStatus: status, error: error)
    }

    private func reconnection(_ status: CoreReconnectionStatus) -> CoreEvent {
        .reconnectionStatusChanged(status: status)
    }

    private func authenticated(audioOnly: Bool = false) -> CoreEvent {
        .authenticated(audioOnly: audioOnly)
    }

    private func roomChanged(local: CorePeerState?, remote: [CorePeerState]) -> CoreEvent {
        .roomStateChanged(roomState: coreRoom(local: local, remote: remote))
    }

    private func peerJoined(_ peer: CorePeerState) -> CoreEvent {
        .peerJoined(peer: peer)
    }

    private func peer(_ id: String, tracks: [String] = []) -> CorePeerState {
        var state = corePeer(id)
        state.tracks = tracks.map { coreTrack($0, .camera) }
        return state
    }
}
