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
        var error = Fishjam_Sdk_Error()
        error.message = "invalid token"
        error.authErrorReason = .invalidToken

        XCTAssertEqual(run(status(.error, error: error)), ["authError invalidToken", "disconnected"])
    }

    func testRoomNotFoundIsAnAuthErrorOnly() {
        _ = run(status(.connecting))
        var error = Fishjam_Sdk_Error()
        error.authErrorReason = .roomNotFound
        error.joinErrorReason = .roomNotFound

        XCTAssertEqual(run(status(.error, error: error)), ["authError roomNotFound", "disconnected"])
    }

    func testJoinErrorIsFollowedByDisconnected() {
        _ = run(status(.connecting))
        var error = Fishjam_Sdk_Error()
        error.joinErrorReason = .reachedPeersLimit

        XCTAssertEqual(run(status(.error, error: error)), ["joinError reachedPeersLimit", "disconnected"])
    }

    func testErrorWithoutReasonIsAConnectionError() {
        join()
        var error = Fishjam_Sdk_Error()
        error.message = "ice failed"

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
        var error = Fishjam_Sdk_Error()
        error.message = "Reconnection attempts exhausted"
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
        let camera = track("remote:cam", .camera)
        var joined = Fishjam_Sdk_PeerJoined()
        joined.peer = peer("remote", tracks: ["remote:cam"])
        var joinedEvent = Fishjam_Sdk_SdkEvent()
        joinedEvent.peerJoined = joined
        var ready = Fishjam_Sdk_TrackReady()
        ready.peerID = "remote"
        ready.track = camera
        var readyEvent = Fishjam_Sdk_SdkEvent()
        readyEvent.trackReady = ready
        var updated = Fishjam_Sdk_PeerUpdated()
        updated.peer = peer("remote")
        var updatedEvent = Fishjam_Sdk_SdkEvent()
        updatedEvent.peerUpdated = updated

        XCTAssertEqual(run(joinedEvent), ["peerJoined remote tracks=1"])
        XCTAssertEqual(run(readyEvent), ["trackReady remote remote:cam"])
        XCTAssertEqual(run(updatedEvent), ["peerUpdated remote tracks=0"])
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
        var left = Fishjam_Sdk_PeerLeft()
        left.peer = peer("remote")
        var leftEvent = Fishjam_Sdk_SdkEvent()
        leftEvent.peerLeft = left

        XCTAssertEqual(run(leftEvent), ["peerLeft remote"])
        XCTAssertEqual(run(roomChanged(local: nil, remote: [])), [])
    }

    func testHubDeliversInOrderToEveryStream() async {
        let hub = EventHub()
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
        let hub = EventHub()
        hub.emit(.connectionStarted)
        let late = hub.stream()
        hub.emit(.reconnected)
        hub.finish()

        var names: [String] = []
        for await event in late { names.append(describeEvent(event)) }

        XCTAssertEqual(names, ["reconnected"])
    }

    func testHubForgetsAStreamThatWasCancelled() async {
        let hub = EventHub()
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

    private func join(remote: [Fishjam_Sdk_PeerState] = []) {
        _ = run(status(.connecting))
        _ = run(authenticated())
        _ = run(roomChanged(local: peer("local"), remote: remote))
        _ = run(status(.connected))
    }

    private func run(_ event: Fishjam_Sdk_SdkEvent) -> [String] {
        mapper.map(event, media: [:]).map(describeEvent)
    }

    private func status(_ status: Fishjam_Sdk_PeerStatus, error: Fishjam_Sdk_Error? = nil) -> Fishjam_Sdk_SdkEvent {
        var changed = Fishjam_Sdk_PeerStatusChanged()
        changed.peerStatus = status
        if let error { changed.error = error }
        var event = Fishjam_Sdk_SdkEvent()
        event.peerStatusChanged = changed
        return event
    }

    private func reconnection(_ status: Fishjam_Sdk_ReconnectionStatus) -> Fishjam_Sdk_SdkEvent {
        var changed = Fishjam_Sdk_ReconnectionStatusChanged()
        changed.status = status
        var event = Fishjam_Sdk_SdkEvent()
        event.reconnectionStatusChanged = changed
        return event
    }

    private func authenticated(audioOnly: Bool = false) -> Fishjam_Sdk_SdkEvent {
        var authenticated = Fishjam_Sdk_Authenticated()
        authenticated.audioOnly = audioOnly
        var event = Fishjam_Sdk_SdkEvent()
        event.authenticated = authenticated
        return event
    }

    private func roomChanged(
        local: Fishjam_Sdk_PeerState?,
        remote: [Fishjam_Sdk_PeerState]
    ) -> Fishjam_Sdk_SdkEvent {
        var room = Fishjam_Sdk_RoomState()
        if let local { room.localPeer = local }
        room.remotePeers = remote
        var changed = Fishjam_Sdk_RoomStateChanged()
        changed.roomState = room
        var event = Fishjam_Sdk_SdkEvent()
        event.roomStateChanged = changed
        return event
    }

    private func peerJoined(_ peer: Fishjam_Sdk_PeerState) -> Fishjam_Sdk_SdkEvent {
        var joined = Fishjam_Sdk_PeerJoined()
        joined.peer = peer
        var event = Fishjam_Sdk_SdkEvent()
        event.peerJoined = joined
        return event
    }

    private func peer(_ id: String, tracks: [String] = []) -> Fishjam_Sdk_PeerState {
        var state = Fishjam_Sdk_PeerState()
        state.id = id
        state.tracks = tracks.map { track($0, .camera) }
        return state
    }

    private func track(_ id: String, _ type: Fishjam_Sdk_TrackType) -> Fishjam_Sdk_TrackState {
        var metadata = Fishjam_Sdk_TrackMetadata()
        metadata.type = type
        var state = Fishjam_Sdk_TrackState()
        state.trackID = id
        state.metadata = metadata
        return state
    }
}
