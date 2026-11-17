import FishjamClient
import SwiftUI
import UIKit

enum Field {
    case room
    case peer
    case token
    case lowKbps
    case mediumKbps
    case highKbps
}

extension View {
    func exampleTextField(
        focused: FocusState<Field?>.Binding,
        field: Field,
        identifier: String
    ) -> some View {
        textFieldStyle(.roundedBorder)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .focused(focused, equals: field)
            .accessibilityIdentifier(identifier)
    }
}

final class DeviceSetup {
    var requestedPermissions = false
    var devicesReady = false
    var preparing = false
}

@MainActor
func prepareDevices(
    client: FishjamClient,
    setup: DeviceSetup,
    notice: Binding<String>,
    permissionsDenied: Binding<Bool>
) async {
    if setup.devicesReady || setup.preparing { return }
    setup.preparing = true
    defer { setup.preparing = false }
    var camera = client.queryCameraPermission()
    var microphone = client.queryMicrophonePermission()
    if !setup.requestedPermissions {
        setup.requestedPermissions = true
        notice.wrappedValue = "Requesting permissions..."
        permissionsDenied.wrappedValue = false
        if camera != .granted { camera = await client.requestCameraPermission() }
        if microphone != .granted { microphone = await client.requestMicrophonePermission() }
    }
    guard camera == .granted, microphone == .granted else {
        notice.wrappedValue = "Permissions denied. Please grant camera and microphone access in settings."
        permissionsDenied.wrappedValue = true
        return
    }
    notice.wrappedValue = "Initializing camera..."
    permissionsDenied.wrappedValue = false
    _ = await client.initializeDevices(enableVideo: true, enableAudio: true)
    setup.devicesReady = true
    if notice.wrappedValue == "Initializing camera..." {
        notice.wrappedValue = ""
    }
}

func setCamera(client: FishjamClient, notice: Binding<String>) async {
    if client.isCameraOn {
        do {
            try await client.stopCamera()
        } catch {
            notice.wrappedValue = error.localizedDescription
        }
        return
    }
    var status = client.queryCameraPermission()
    if status != .granted {
        status = await client.requestCameraPermission()
    }
    guard status == .granted else {
        notice.wrappedValue = "camera permission denied"
        return
    }
    do {
        try await client.startCamera()
    } catch {
        notice.wrappedValue = error.localizedDescription
    }
}

func nextCamera(in cameras: [CameraDevice], current: CameraDevice?) -> CameraDevice? {
    guard let current else { return cameras.first }
    if let opposite = cameras.first(where: { $0.front != current.front }) {
        return opposite
    }
    return cameras.first { $0.deviceId != current.deviceId }
}

func switchCamera(client: FishjamClient, notice: Binding<String>) async {
    do {
        let cameras = client.cameraDevices()
        guard let next = nextCamera(in: cameras, current: client.currentCamera) else {
            notice.wrappedValue = "No camera found"
            return
        }
        try await client.selectCamera(deviceId: next.deviceId)
    } catch {
        notice.wrappedValue = error.localizedDescription
    }
}

func setMicrophone(client: FishjamClient, notice: Binding<String>) async {
    if client.isMicrophoneOn {
        do {
            try await client.stopMicrophone()
        } catch {
            notice.wrappedValue = error.localizedDescription
        }
        return
    }
    var status = client.queryMicrophonePermission()
    if status != .granted {
        status = await client.requestMicrophonePermission()
    }
    guard status == .granted else {
        notice.wrappedValue = "microphone permission denied"
        return
    }
    do {
        try await client.startMicrophone()
    } catch {
        notice.wrappedValue = error.localizedDescription
    }
}

@MainActor
func setScreenShare(client: FishjamClient, notice: Binding<String>) async {
    do {
        if client.isScreenSharing {
            // Prefer the system Stop sheet so the extension does not show an error dialog.
            _ = presentBroadcastPicker(
                extensionBundleId: client.screenShareConfig?.extensionBundleId
            )
        } else {
            try await client.startScreenShare()
        }
    } catch {
        notice.wrappedValue = error.localizedDescription
    }
}
