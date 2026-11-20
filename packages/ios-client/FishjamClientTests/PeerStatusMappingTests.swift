@testable import FishjamClient
import XCTest

final class PeerStatusMappingTests: XCTestCase {
    func testMapsConnectingConnectedAndIdle() {
        XCTAssertEqual(status(of: .connecting).peerStatus, .connecting)
        XCTAssertEqual(status(of: .connected).peerStatus, .connected)
        XCTAssertEqual(status(of: .idle).peerStatus, .idle)
        XCTAssertEqual(status(of: .idle).peerStatus.label, "idle")
    }

    func testMapsAuthErrorReason() {
        let error = coreFailure("invalid token", auth: .invalidToken)
        let update = status(of: .error, error: error)

        XCTAssertEqual(update.peerStatus.failure?.authReason, .invalidToken)
        XCTAssertNil(update.peerStatus.failure?.joinReason)
        XCTAssertEqual(update.peerStatus.label, "error")
        XCTAssertEqual(joinFailure(update)?.message, "invalid token")
        XCTAssertEqual(joinFailure(update)?.authReason, .invalidToken)
    }

    func testMapsJoinErrorReason() {
        let error = coreFailure("reached peers limit", join: .reachedPeersLimit)
        let update = status(of: .error, error: error)

        XCTAssertEqual(update.peerStatus.failure?.joinReason, .reachedPeersLimit)
        XCTAssertNil(update.peerStatus.failure?.authReason)
        XCTAssertEqual(joinFailure(update)?.message, "reached peers limit")
        XCTAssertEqual(joinFailure(update)?.joinReason, .reachedPeersLimit)
    }

    func testRoomNotFoundCarriesBothReasons() {
        let error = coreFailure("room not found", auth: .roomNotFound, join: .roomNotFound)
        let failure = status(of: .error, error: error).peerStatus.failure

        XCTAssertEqual(failure?.authReason, .roomNotFound)
        XCTAssertEqual(failure?.joinReason, .roomNotFound)
    }

    func testJoinRoomErrorUsesTheReasonWhenTheDetailIsEmpty() {
        let error = joinRoomError(of: coreFailure(auth: .expiredToken))

        XCTAssertEqual(error.message, "expired token")
        XCTAssertEqual(error.authReason, .expiredToken)
        XCTAssertNil(error.joinReason)
    }

    func testIgnoresEventsThatAreNotPeerStatus() {
        XCTAssertNil(peerStatusUpdate(.closePeerConnection))
        XCTAssertNil(joinFailure(status(of: .connected)))
    }

    private func status(of peerStatus: CorePeerStatus, error: CoreError? = nil) -> PeerStatusUpdate {
        peerStatusUpdate(.peerStatusChanged(peerStatus: peerStatus, error: error))!
    }
}
