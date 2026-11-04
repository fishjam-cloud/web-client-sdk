@testable import FishjamClient
import XCTest

final class CameraDeviceTests: XCTestCase {
    func testMapsDeviceIdNameAndPosition() {
        let devices = listedCameras(from: [
            DiscoveredCamera(deviceId: "front-id", name: "Front Camera", front: true),
            DiscoveredCamera(deviceId: "back-id", name: "Back Camera", front: false),
            DiscoveredCamera(deviceId: "", name: "Dropped", front: true)
        ])
        XCTAssertEqual(devices, [
            CameraDevice(deviceId: "front-id", label: "Front Camera", front: true),
            CameraDevice(deviceId: "back-id", label: "Back Camera", front: false)
        ])
    }

    func testBlankNameUsesUnknownLabel() {
        let devices = listedCameras(from: [
            DiscoveredCamera(deviceId: "cam", name: "  ", front: false)
        ])
        XCTAssertEqual(devices.first?.label, "Unknown video device")
        XCTAssertEqual(devices.first?.front, false)
    }

    func testUnknownDeviceIdIsRejectedBeforeCapture() {
        let devices = listedCameras(from: [
            DiscoveredCamera(deviceId: "front-id", name: "Front Camera", front: true)
        ])
        XCTAssertThrowsError(try requireListedCamera(devices, deviceId: "missing")) { error in
            XCTAssertEqual(error as? MediaError, .noCamera)
        }
        XCTAssertThrowsError(try requireListedCamera(devices, deviceId: "")) { error in
            XCTAssertEqual(error as? MediaError, .noCamera)
        }
    }
}
