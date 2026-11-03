import AVFoundation

/// The current status of a device permission.
///
/// - `granted`: the user has granted the permission.
/// - `denied`: the user has denied the permission.
/// - `prompt`: the user has not yet been asked, or the permission can be requested again.
public enum PermissionStatus: String, Equatable, Sendable {
    case granted
    case denied
    case prompt
}

func permissionStatus(for status: AVAuthorizationStatus) -> PermissionStatus {
    switch status {
    case .authorized:
        return .granted
    case .notDetermined:
        return .prompt
    case .denied, .restricted:
        return .denied
    @unknown default:
        return .denied
    }
}

public extension FishjamClient {
    /// Checks the camera permission without showing a dialog.
    func queryCameraPermission() -> PermissionStatus {
        permissionStatus(for: AVCaptureDevice.authorizationStatus(for: .video))
    }

    /// Shows the camera permission dialog when the system still allows it, then returns the status.
    func requestCameraPermission() async -> PermissionStatus {
        await requestPermission(for: .video)
    }

    /// Checks the microphone permission without showing a dialog.
    func queryMicrophonePermission() -> PermissionStatus {
        permissionStatus(for: AVCaptureDevice.authorizationStatus(for: .audio))
    }

    /// Shows the microphone permission dialog when the system still allows it, then returns the status.
    func requestMicrophonePermission() async -> PermissionStatus {
        await requestPermission(for: .audio)
    }
}

private func requestPermission(for mediaType: AVMediaType) async -> PermissionStatus {
    if AVCaptureDevice.authorizationStatus(for: mediaType) == .notDetermined {
        await withCheckedContinuation { continuation in
            AVCaptureDevice.requestAccess(for: mediaType) { _ in
                continuation.resume()
            }
        }
    }
    return permissionStatus(for: AVCaptureDevice.authorizationStatus(for: mediaType))
}
