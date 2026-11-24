import CallKit
@testable import FishjamClient
import XCTest

final class CallKitTests: XCTestCase {
    private let config = CallKitConfig(displayName: "Alice", isVideo: true)

    func testMapsEndedReasons() {
        XCTAssertNil(cxEndedReason(.local))
        XCTAssertNil(cxEndedReason(.rejected))
        XCTAssertEqual(cxEndedReason(.missed), .unanswered)
        XCTAssertEqual(cxEndedReason(.remote), .remoteEnded)
        XCTAssertEqual(cxEndedReason(.answeredElsewhere), .answeredElsewhere)
        XCTAssertEqual(cxEndedReason(.failed), .failed)
    }

    func testRejectsAnEmptyDisplayName() {
        XCTAssertThrowsError(try validateCallKitConfig(CallKitConfig(displayName: "", isVideo: false))) { error in
            XCTAssertEqual(error as? CallKitError, .emptyDisplayName)
        }
        XCTAssertThrowsError(try CallKit.shared.startSession(CallKitConfig(displayName: "", isVideo: false)))
        XCTAssertNoThrow(try validateCallKitConfig(config))
    }

    func testDefaults() {
        XCTAssertNil(config.handle)
        XCTAssertFalse(config.isDialing)
    }

    func testProviderResetOnlyCleansUpWhenACallExists() {
        XCTAssertFalse(providerResetNeedsCleanup(hasCurrentCall: false, hasWaitingCall: false))
        XCTAssertTrue(providerResetNeedsCleanup(hasCurrentCall: true, hasWaitingCall: false))
        XCTAssertTrue(providerResetNeedsCleanup(hasCurrentCall: false, hasWaitingCall: true))
    }

    func testStartsWhenConnectedAndEndsWhenTheRoomEnds() {
        XCTAssertEqual(step(from: .idle, to: .connecting, started: false), CallKitSessionStep.none)
        XCTAssertEqual(step(from: .connecting, to: .connected, started: false), .start(config))
        XCTAssertEqual(step(from: .connected, to: .idle, started: true), .end)
        let failure = ConnectionFailure(message: "lost", authReason: nil, joinReason: nil)
        XCTAssertEqual(step(from: .connected, to: .error(failure), started: true), .end)
    }

    func testKeepsTheSessionWhileReconnecting() {
        XCTAssertEqual(step(from: .connected, to: .connected, started: true), CallKitSessionStep.none)
    }

    func testDoesNothingWithoutAConfigOrWhenAlreadyStarted() {
        XCTAssertEqual(
            callKitSessionStep(roomConnected: true, config: nil, started: false),
            CallKitSessionStep.none
        )
        XCTAssertEqual(step(from: .connecting, to: .connected, started: true), CallKitSessionStep.none)
        XCTAssertEqual(step(from: .connected, to: .idle, started: false), CallKitSessionStep.none)
    }

    private func step(from previous: PeerStatus, to next: PeerStatus, started: Bool) -> CallKitSessionStep {
        callKitSessionStep(
            roomConnected: communicationModeChange(from: previous, to: next),
            config: config,
            started: started
        )
    }
}
