@testable import FishjamClient
import XCTest

final class LocalVoiceActivityTests: XCTestCase {
    func testALevelAboveTheThresholdIsSpeech() {
        var detector = SpeakingDetector()

        XCTAssertEqual(detector.onLevel(SpeakingDetector.speechThreshold + 0.001), .speech)
    }

    func testALevelAtTheThresholdStaysSilent() {
        var detector = SpeakingDetector()

        XCTAssertEqual(detector.onLevel(SpeakingDetector.speechThreshold), .silence)
        XCTAssertEqual(detector.onLevel(0), .silence)
        XCTAssertEqual(detector.onLevel(nil), .silence)
    }

    func testSilenceNeedsTwoQuietPolls() {
        var detector = SpeakingDetector()
        _ = detector.onLevel(0.1)

        XCTAssertEqual(detector.onLevel(0), .speech)
        XCTAssertEqual(detector.onLevel(0), .silence)
    }

    func testALoudPollResetsTheQuietCount() {
        var detector = SpeakingDetector()
        _ = detector.onLevel(0.1)
        _ = detector.onLevel(0)

        XCTAssertEqual(detector.onLevel(0.1), .speech)
        XCTAssertEqual(detector.onLevel(0), .speech)
        XCTAssertEqual(detector.onLevel(nil), .silence)
    }

    func testResetClearsSpeech() {
        var detector = SpeakingDetector()
        _ = detector.onLevel(0.1)
        detector.reset()

        XCTAssertEqual(detector.onLevel(0), .silence)
    }
}
