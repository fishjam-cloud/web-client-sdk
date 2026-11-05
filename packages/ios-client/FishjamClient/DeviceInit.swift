import Foundation

/// A camera or microphone failure.
///
/// `rawValue` is the React Native device error name.
public enum DeviceError: String, Equatable, Sendable {
    case notAllowed = "NotAllowedError"
    case notFound = "NotFoundError"
    case overconstrained = "OverconstrainedError"
    case unhandled = "UNHANDLED_ERROR"
}

/// Outcome of `FishjamClient.initializeDevices`.
///
/// `label` is the React Native status string.
public enum InitializeDevicesStatus: String, Equatable, Sendable {
    case initialized
    case failed
    case initializedWithErrors = "initialized_with_errors"
    case alreadyInitialized = "already_initialized"

    public var label: String { rawValue }
}

/// Per-device errors from `FishjamClient.initializeDevices`. Nil means that device started.
public struct DeviceErrors: Equatable, Sendable {
    public let audio: DeviceError?
    public let video: DeviceError?

    public init(audio: DeviceError?, video: DeviceError?) {
        self.audio = audio
        self.video = video
    }
}

public struct InitializeDevicesResult: Equatable, Sendable {
    public let status: InitializeDevicesStatus
    public let errors: DeviceErrors?

    public init(status: InitializeDevicesStatus, errors: DeviceErrors?) {
        self.status = status
        self.errors = errors
    }
}

func initializeDevicesResult(
    videoRequested: Bool,
    audioRequested: Bool,
    videoError: DeviceError?,
    audioError: DeviceError?
) -> InitializeDevicesResult {
    let video = videoRequested ? videoError : nil
    let audio = audioRequested ? audioError : nil
    let videoFailed = videoRequested && video != nil
    let audioFailed = audioRequested && audio != nil
    let videoStarted = videoRequested && video == nil
    let audioStarted = audioRequested && audio == nil
    let anyFailed = videoFailed || audioFailed
    let anyStarted = videoStarted || audioStarted
    let status: InitializeDevicesStatus
    if anyFailed && anyStarted {
        status = .initializedWithErrors
    } else if anyFailed {
        status = .failed
    } else {
        status = .initialized
    }
    let errors = status == .initialized ? nil : DeviceErrors(audio: audio, video: video)
    return InitializeDevicesResult(status: status, errors: errors)
}

func interruptedInitializeDevicesResult(
    videoRequested: Bool,
    audioRequested: Bool
) -> InitializeDevicesResult {
    InitializeDevicesResult(
        status: .failed,
        errors: DeviceErrors(
            audio: audioRequested ? .unhandled : nil,
            video: videoRequested ? .unhandled : nil
        )
    )
}

func deviceErrorForCameraFailure(
    _ error: Error,
    listedDeviceCount: Int,
    requestedDeviceId: String?
) -> DeviceError {
    guard let media = error as? MediaError else {
        return .unhandled
    }
    switch media {
    case .cameraPermission, .microphonePermission:
        return .notAllowed
    case .noCamera:
        if requestedDeviceId != nil && listedDeviceCount > 0 {
            return .overconstrained
        }
        return .notFound
    case .cameraFailed:
        return .unhandled
    }
}

func deviceErrorForMicrophoneFailure(_ error: Error) -> DeviceError {
    guard let media = error as? MediaError else {
        return .unhandled
    }
    switch media {
    case .cameraPermission, .microphonePermission:
        return .notAllowed
    case .noCamera, .cameraFailed:
        return .unhandled
    }
}
