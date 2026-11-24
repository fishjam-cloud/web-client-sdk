import CallKit
@testable import FishjamClient
import XCTest

final class VoIPTests: XCTestCase {
    func testParsesIncomingPayload() {
        let payload = parseVoIPIncomingPayload([
            "roomName": "room-1",
            "displayName": "Alice",
            "handle": "alice-id",
            "isVideo": true,
            "avatarUrl": "https://example.com/a.png"
        ])
        XCTAssertEqual(payload?.roomName, "room-1")
        XCTAssertEqual(payload?.displayName, "Alice")
        XCTAssertEqual(payload?.handle, "alice-id")
        XCTAssertEqual(payload?.isVideo, true)
        XCTAssertEqual(payload?.avatarUrl, "https://example.com/a.png")
    }

    func testIncomingPayloadDefaults() {
        let payload = parseVoIPIncomingPayload(["roomName": "r"])
        XCTAssertEqual(payload?.displayName, "Incoming call")
        XCTAssertEqual(payload?.handle, "Incoming call")
        XCTAssertEqual(payload?.isVideo, false)
        XCTAssertNil(payload?.avatarUrl)
    }

    func testIncomingPayloadRequiresRoomName() {
        XCTAssertNil(parseVoIPIncomingPayload([:]))
        XCTAssertNil(parseVoIPIncomingPayload(["roomName": "  "]))
        XCTAssertNil(parseVoIPIncomingPayload(["displayName": "Alice"]))
    }

    func testHandleFallsBackToDisplayName() {
        let payload = parseVoIPIncomingPayload([
            "roomName": "r",
            "displayName": "Bob"
        ])
        XCTAssertEqual(payload?.handle, "Bob")
    }

    func testIsVideoFromString() {
        let payload = parseVoIPIncomingPayload([
            "roomName": "r",
            "isVideo": "true"
        ])
        XCTAssertEqual(payload?.isVideo, true)
    }

    func testEndedReasonMappingStillCoversAllCases() {
        for reason in CallEndedReason.allCases {
            _ = cxEndedReason(reason)
        }
        XCTAssertNil(cxEndedReason(.local))
        XCTAssertNil(cxEndedReason(.rejected))
        XCTAssertEqual(cxEndedReason(.missed), .unanswered)
    }

    func testTimeoutFromInfoPlistFallsBack() {
        let value = timeoutFromInfoPlist("VoIPIncomingCallTimeout_MissingKey", fallback: 45)
        XCTAssertEqual(value, 45)
    }

    func testFulfillRequestFulfillsOnce() {
        let manager = FulfillRequestManager.shared
        let expectation = expectation(description: "fulfilled")
        var results: [FulfillResult] = []
        let id = manager.createRequest(timeout: 5) { result in
            results.append(result)
            expectation.fulfill()
        }
        XCTAssertTrue(manager.fulfill(id))
        XCTAssertFalse(manager.fulfill(id))
        wait(for: [expectation], timeout: 1)
        XCTAssertEqual(results, [.fulfilled])
    }

    func testFulfillRequestTimesOut() {
        let manager = FulfillRequestManager.shared
        let expectation = expectation(description: "timed out")
        let id = manager.createRequest(timeout: 0.05) { result in
            XCTAssertEqual(result, .timedOut)
            expectation.fulfill()
        }
        wait(for: [expectation], timeout: 1)
        XCTAssertFalse(manager.fulfill(id))
    }

    func testFulfillRequestCancelAll() {
        let manager = FulfillRequestManager.shared
        let expectation = expectation(description: "cancelled")
        expectation.expectedFulfillmentCount = 2
        _ = manager.createRequest(timeout: 5) { result in
            XCTAssertEqual(result, .cancelled)
            expectation.fulfill()
        }
        _ = manager.createRequest(timeout: 5) { result in
            XCTAssertEqual(result, .cancelled)
            expectation.fulfill()
        }
        manager.cancelAll()
        wait(for: [expectation], timeout: 1)
    }
}
