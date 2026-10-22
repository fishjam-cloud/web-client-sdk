@testable import FishjamClient
import XCTest

final class PeerStatusMappingTests: XCTestCase {
    func testMapsConnectingConnectedAndIdle() {
        XCTAssertEqual(status(of: .connecting).peerStatus, .connecting)
        XCTAssertEqual(status(of: .connected).peerStatus, .connected)
        XCTAssertEqual(status(of: .idle).peerStatus, .idle)
    }

    func testMapsAuthErrorReason() {
        var error = Fishjam_Sdk_Error()
        error.message = "invalid token"
        error.authReason = "invalid token"
        let update = status(of: .error, error: error)

        XCTAssertEqual(update.peerStatus, .error)
        XCTAssertEqual(update.authReason, "invalid token")
        XCTAssertEqual(update.joinReason, "")
        XCTAssertEqual(joinFailure(update)?.message, "invalid token")
    }

    func testMapsJoinErrorReason() {
        var error = Fishjam_Sdk_Error()
        error.message = "reached peers limit"
        error.joinReason = "reached peers limit"
        let update = status(of: .error, error: error)

        XCTAssertEqual(update.joinReason, "reached peers limit")
        XCTAssertEqual(update.authReason, "")
        XCTAssertEqual(joinFailure(update)?.message, "reached peers limit")
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
