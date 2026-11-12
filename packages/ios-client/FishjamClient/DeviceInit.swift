import Foundation

/// A camera or microphone failure.
public enum DeviceError: Equatable, Sendable {
    case notAllowed
    case notFound
    case unknown
}

/// Outcome of `FishjamClient.initializeDevices`.
public enum InitializeDevicesStatus: Equatable, Sendable {
    case initialized
    case failed
    case initializedWithErrors
    case alreadyInitialized
}

/// Per-device errors from `FishjamClient.initializeDevices`. Nil means that device started or was not requested.
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
    let anyFailed = videoFailed || audioFailed
    let anyStarted = (videoRequested && video == nil) || (audioRequested && audio == nil)
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

/// The call was interrupted, so the requested devices are reported as failed and the next call can try again.
func interruptedInitializeDevicesResult(
    videoRequested: Bool,
    audioRequested: Bool
) -> InitializeDevicesResult {
    InitializeDevicesResult(
        status: .failed,
        errors: DeviceErrors(
            audio: audioRequested ? .unknown : nil,
            video: videoRequested ? .unknown : nil
        )
    )
}

func deviceErrorForCameraFailure(_ error: Error) -> DeviceError {
    guard let media = error as? MediaError else {
        return .unknown
    }
    switch media {
    case .cameraPermission, .microphonePermission:
        return .notAllowed
    case .noCamera:
        return .notFound
    case .cameraFailed:
        return .unknown
    }
}

func deviceErrorForMicrophoneFailure(_ error: Error) -> DeviceError {
    guard let media = error as? MediaError else {
        return .unknown
    }
    switch media {
    case .cameraPermission, .microphonePermission:
        return .notAllowed
    case .noCamera, .cameraFailed:
        return .unknown
    }
}
