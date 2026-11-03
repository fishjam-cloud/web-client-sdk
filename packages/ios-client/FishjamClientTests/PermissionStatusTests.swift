import AVFoundation
@testable import FishjamClient
import XCTest

final class PermissionStatusTests: XCTestCase {
    func testMapsAuthorizationStatus() {
        XCTAssertEqual(permissionStatus(for: .authorized), .granted)
        XCTAssertEqual(permissionStatus(for: .notDetermined), .prompt)
        XCTAssertEqual(permissionStatus(for: .denied), .denied)
        XCTAssertEqual(permissionStatus(for: .restricted), .denied)
    }

    func testLabelsAreGrantedDeniedPrompt() {
        XCTAssertEqual(PermissionStatus.granted.rawValue, "granted")
        XCTAssertEqual(PermissionStatus.denied.rawValue, "denied")
        XCTAssertEqual(PermissionStatus.prompt.rawValue, "prompt")
    }
}
