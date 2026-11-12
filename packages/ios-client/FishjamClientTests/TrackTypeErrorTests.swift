import XCTest
@testable import FishjamClient

final class TrackTypeErrorTests: XCTestCase {
    func testTrackTypeReasonMapsToTrackTypeError() {
        var error = Fishjam_Sdk_Error()
        error.callErrorReason = .trackType
        XCTAssertTrue(isTrackTypeError(error))
        XCTAssertTrue(TrackTypeError().errorDescription?.contains("audio-only") == true)
    }

    func testAnotherReasonIsNotTrackTypeError() {
        var error = Fishjam_Sdk_Error()
        error.message = "Cannot add tracks before being accepted by the server"
        XCTAssertFalse(isTrackTypeError(error))
    }

    func testConnectedAudioOnlyRejectsBeforeTheCameraOpens() {
        XCTAssertEqual(cameraStart(connected: true, audioOnly: true), .rejectVideo)
    }

    func testNotConnectedOpensTheCameraAndPublishesInTheBackground() {
        XCTAssertEqual(cameraStart(connected: false, audioOnly: true), .openAndPublish)
        XCTAssertEqual(cameraStart(connected: true, audioOnly: false), .openAndPublish)
        XCTAssertEqual(cameraStart(connected: false, audioOnly: false), .openAndPublish)
    }
}
