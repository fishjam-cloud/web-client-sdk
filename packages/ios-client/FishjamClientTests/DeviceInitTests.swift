import XCTest
@testable import FishjamClient

final class DeviceInitTests: XCTestCase {
    func testBothDevicesStartedHasNoErrors() {
        let result = initializeDevicesResult(
            videoRequested: true,
            audioRequested: true,
            videoError: nil,
            audioError: nil
        )
        XCTAssertEqual(result, InitializeDevicesResult(status: .initialized, errors: nil))
    }

    func testOneDeviceFailedIsInitializedWithErrors() {
        let result = initializeDevicesResult(
            videoRequested: true,
            audioRequested: true,
            videoError: .notFound,
            audioError: nil
        )
        XCTAssertEqual(result.status, .initializedWithErrors)
        XCTAssertEqual(result.errors?.video, .notFound)
        XCTAssertNil(result.errors?.audio)
    }

    func testEveryRequestedDeviceFailedIsFailed() {
        let result = initializeDevicesResult(
            videoRequested: true,
            audioRequested: true,
            videoError: .notAllowed,
            audioError: .unknown
        )
        XCTAssertEqual(result.status, .failed)
        XCTAssertEqual(result.errors?.video, .notAllowed)
        XCTAssertEqual(result.errors?.audio, .unknown)
    }

    func testDeviceLeftOutIsNotAnError() {
        let videoOnly = initializeDevicesResult(
            videoRequested: true,
            audioRequested: false,
            videoError: nil,
            audioError: nil
        )
        XCTAssertEqual(videoOnly, InitializeDevicesResult(status: .initialized, errors: nil))

        let audioFailed = initializeDevicesResult(
            videoRequested: false,
            audioRequested: true,
            videoError: nil,
            audioError: .notAllowed
        )
        XCTAssertEqual(audioFailed.status, .failed)
        XCTAssertNil(audioFailed.errors?.video)
        XCTAssertEqual(audioFailed.errors?.audio, .notAllowed)
    }

    func testNothingRequestedIsInitialized() {
        let result = initializeDevicesResult(
            videoRequested: false,
            audioRequested: false,
            videoError: nil,
            audioError: nil
        )
        XCTAssertEqual(result, InitializeDevicesResult(status: .initialized, errors: nil))
    }

    func testInterruptedCallFailsRequestedDevices() {
        let result = interruptedInitializeDevicesResult(videoRequested: true, audioRequested: false)
        XCTAssertEqual(result.status, .failed)
        XCTAssertEqual(result.errors?.video, .unknown)
        XCTAssertNil(result.errors?.audio)
    }

    func testCameraPermissionDeniedIsNotAllowed() {
        XCTAssertEqual(deviceErrorForCameraFailure(MediaError.cameraPermission), .notAllowed)
    }

    func testNoCameraIsNotFound() {
        XCTAssertEqual(deviceErrorForCameraFailure(MediaError.noCamera), .notFound)
    }

    func testOtherCameraFailureIsUnknown() {
        XCTAssertEqual(
            deviceErrorForCameraFailure(MediaError.cameraFailed("Camera switch timed out")),
            .unknown
        )
    }

    func testMicrophonePermissionDeniedIsNotAllowed() {
        XCTAssertEqual(deviceErrorForMicrophoneFailure(MediaError.microphonePermission), .notAllowed)
        XCTAssertEqual(deviceErrorForMicrophoneFailure(MediaError.cameraFailed("audio failed")), .unknown)
    }
}
