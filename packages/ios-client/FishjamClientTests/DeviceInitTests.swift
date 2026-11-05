import XCTest
@testable import FishjamClient

final class DeviceInitTests: XCTestCase {
    func testBothDevicesStartedIsInitialized() {
        let result = initializeDevicesResult(
            videoRequested: true,
            audioRequested: true,
            videoError: nil,
            audioError: nil
        )
        XCTAssertEqual(result.status, .initialized)
        XCTAssertNil(result.errors)
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
            audioError: .unhandled
        )
        XCTAssertEqual(result.status, .failed)
        XCTAssertEqual(result.errors?.video, .notAllowed)
        XCTAssertEqual(result.errors?.audio, .unhandled)
    }

    func testADeviceLeftOutIsNotAnError() {
        let videoOnly = initializeDevicesResult(
            videoRequested: true,
            audioRequested: false,
            videoError: nil,
            audioError: .notAllowed
        )
        XCTAssertEqual(videoOnly.status, .initialized)
        XCTAssertNil(videoOnly.errors)

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
            videoError: .notAllowed,
            audioError: .notAllowed
        )
        XCTAssertEqual(result.status, .initialized)
        XCTAssertNil(result.errors)
    }

    func testLabelsMatchReactNative() {
        XCTAssertEqual(InitializeDevicesStatus.initialized.label, "initialized")
        XCTAssertEqual(InitializeDevicesStatus.failed.label, "failed")
        XCTAssertEqual(InitializeDevicesStatus.initializedWithErrors.label, "initialized_with_errors")
        XCTAssertEqual(InitializeDevicesStatus.alreadyInitialized.label, "already_initialized")
        XCTAssertEqual(DeviceError.notAllowed.rawValue, "NotAllowedError")
        XCTAssertEqual(DeviceError.notFound.rawValue, "NotFoundError")
        XCTAssertEqual(DeviceError.overconstrained.rawValue, "OverconstrainedError")
        XCTAssertEqual(DeviceError.unhandled.rawValue, "UNHANDLED_ERROR")
    }

    func testCameraPermissionDeniedIsNotAllowed() {
        XCTAssertEqual(
            deviceErrorForCameraFailure(MediaError.cameraPermission, listedDeviceCount: 1, requestedDeviceId: nil),
            .notAllowed
        )
    }

    func testNoCameraAtAllIsNotFound() {
        XCTAssertEqual(
            deviceErrorForCameraFailure(MediaError.noCamera, listedDeviceCount: 0, requestedDeviceId: nil),
            .notFound
        )
    }

    func testMissingCameraIdIsOverconstrained() {
        XCTAssertEqual(
            deviceErrorForCameraFailure(MediaError.noCamera, listedDeviceCount: 2, requestedDeviceId: "missing"),
            .overconstrained
        )
    }

    func testOtherCameraFailureIsUnhandled() {
        XCTAssertEqual(
            deviceErrorForCameraFailure(
                MediaError.cameraFailed("Camera switch timed out"),
                listedDeviceCount: 2,
                requestedDeviceId: "0"
            ),
            .unhandled
        )
    }

    func testMicrophonePermissionDeniedIsNotAllowed() {
        XCTAssertEqual(deviceErrorForMicrophoneFailure(MediaError.microphonePermission), .notAllowed)
        XCTAssertEqual(deviceErrorForMicrophoneFailure(MediaError.cameraFailed("audio failed")), .unhandled)
    }

    func testInterruptedCallIsFailed() {
        let result = interruptedInitializeDevicesResult(videoRequested: true, audioRequested: false)
        XCTAssertEqual(result.status, .failed)
        XCTAssertEqual(result.errors?.video, .unhandled)
        XCTAssertNil(result.errors?.audio)
    }
}
