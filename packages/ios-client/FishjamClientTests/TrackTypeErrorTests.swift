import XCTest
@testable import FishjamClient

final class TrackTypeErrorTests: XCTestCase {
    func testTrackTypeReasonMapsToTrackTypeError() {
        XCTAssertTrue(isTrackTypeError(CoreError.TrackType(detail: "video in an audio-only room")))
        XCTAssertTrue(TrackTypeError().errorDescription?.contains("audio-only") == true)
    }

    func testAnotherReasonIsNotTrackTypeError() {
        XCTAssertFalse(isTrackTypeError(coreFailure("Cannot add tracks before being accepted by the server")))
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
