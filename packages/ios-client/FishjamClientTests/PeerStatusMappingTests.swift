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
        var error = Fishjam_Sdk_Error()
        error.message = "invalid token"
        error.authErrorReason = .invalidToken
        let update = status(of: .error, error: error)

        XCTAssertEqual(update.peerStatus.failure?.authReason, .invalidToken)
        XCTAssertNil(update.peerStatus.failure?.joinReason)
        XCTAssertEqual(update.peerStatus.label, "error")
        XCTAssertEqual(joinFailure(update)?.message, "invalid token")
        XCTAssertEqual(joinFailure(update)?.authReason, .invalidToken)
    }

    func testMapsJoinErrorReason() {
        var error = Fishjam_Sdk_Error()
        error.message = "reached peers limit"
        error.joinErrorReason = .reachedPeersLimit
        let update = status(of: .error, error: error)

        XCTAssertEqual(update.peerStatus.failure?.joinReason, .reachedPeersLimit)
        XCTAssertNil(update.peerStatus.failure?.authReason)
        XCTAssertEqual(joinFailure(update)?.message, "reached peers limit")
        XCTAssertEqual(joinFailure(update)?.joinReason, .reachedPeersLimit)
    }

    func testRoomNotFoundCarriesBothReasons() {
        var error = Fishjam_Sdk_Error()
        error.message = "room not found"
        error.authErrorReason = .roomNotFound
        error.joinErrorReason = .roomNotFound
        let failure = status(of: .error, error: error).peerStatus.failure

        XCTAssertEqual(failure?.authReason, .roomNotFound)
        XCTAssertEqual(failure?.joinReason, .roomNotFound)
    }

    func testFallsBackToReasonStrings() {
        var error = Fishjam_Sdk_Error()
        error.message = "expired token"
        error.authReason = "expired token"
        let update = status(of: .error, error: error)

        XCTAssertEqual(update.peerStatus.failure?.authReason, .expiredToken)
        XCTAssertNil(update.peerStatus.failure?.joinReason)
    }

    func testIgnoresEventsThatAreNotPeerStatus() {
        var event = Fishjam_Sdk_SdkEvent()
        event.closePeerConnection = Fishjam_Sdk_ClosePeerConnection()

        XCTAssertNil(peerStatusUpdate(event))
        XCTAssertNil(joinFailure(status(of: .connected)))
    }

    private func status(
        of peerStatus: Fishjam_Sdk_PeerStatus,
        error: Fishjam_Sdk_Error? = nil
    ) -> PeerStatusUpdate {
        var changed = Fishjam_Sdk_PeerStatusChanged()
        changed.peerStatus = peerStatus
        if let error {
            changed.error = error
        }
        var event = Fishjam_Sdk_SdkEvent()
        event.peerStatusChanged = changed
        return peerStatusUpdate(event)!
    }
}
