import AVFoundation
import CoreMedia
import Foundation
import WebRTC

extension MediaSession {
    func enableAudio() {
        #if targetEnvironment(simulator)
        // The simulator voice-processing audio unit aborts inside AudioUnitInitialize.
        #else
        let session = RTCAudioSession.sharedInstance()
        session.lockForConfiguration()
        do {
            try session.setCategory(
                AVAudioSession.Category.playAndRecord,
                mode: .voiceChat,
                options: [.defaultToSpeaker, .allowBluetoothHFP]
            )
            try session.setActive(true)
        } catch {
            NSLog("Fishjam audio session failed: %@", error.localizedDescription)
        }
        session.unlockForConfiguration()
        session.isAudioEnabled = true
        audioActive = true
        #endif
    }

    func disableAudio() {
        guard audioActive else { return }
        audioActive = false
        #if targetEnvironment(simulator)
        #else
        let session = RTCAudioSession.sharedInstance()
        session.lockForConfiguration()
        session.isAudioEnabled = false
        do {
            try session.setActive(false)
        } catch {
            NSLog("Fishjam audio session failed: %@", error.localizedDescription)
        }
        session.unlockForConfiguration()
        #endif
    }

    func cameraDevices() -> [CameraDevice] {
        listedCameras(from: captureDeviceList().map { device in
            DiscoveredCamera(
                deviceId: device.uniqueID,
                name: device.localizedName,
                front: device.position == .front
            )
        })
    }

    func captureDeviceList() -> [AVCaptureDevice] {
        var types: [AVCaptureDevice.DeviceType] = [
            .builtInWideAngleCamera,
            .builtInUltraWideCamera,
            .builtInTelephotoCamera,
            .builtInDualCamera,
            .builtInDualWideCamera,
            .builtInTripleCamera
        ]
        if #available(iOS 17.0, *) {
            types.append(.external)
            types.append(.continuityCamera)
        }
        let discovered = AVCaptureDevice.DiscoverySession(
            deviceTypes: types,
            mediaType: .video,
            position: .unspecified
        ).devices.filter { !$0.uniqueID.isEmpty }
        if !discovered.isEmpty {
            return discovered
        }
        return RTCCameraVideoCapturer.captureDevices().filter { !$0.uniqueID.isEmpty }
    }

    func resolveCamera(deviceId: String?) throws -> AVCaptureDevice {
        let devices = captureDeviceList()
        if let deviceId {
            guard !deviceId.isEmpty, let device = devices.first(where: { $0.uniqueID == deviceId }) else {
                throw MediaError.noCamera
            }
            return device
        }
        guard let device = devices.first(where: { $0.position == .front }) ?? devices.first else {
            throw MediaError.noCamera
        }
        return device
    }

    func beginCapture(on capturer: RTCCameraVideoCapturer, device: AVCaptureDevice) throws {
        let formats = RTCCameraVideoCapturer.supportedFormats(for: device)
        guard let format = cameraFormat(from: formats) else {
            throw MediaError.noCamera
        }
        let done = DispatchSemaphore(value: 0)
        let captureError = ErrorBox()
        capturer.startCapture(with: device, format: format.format, fps: format.fps) { error in
            captureError.error = error
            done.signal()
        }
        if done.wait(timeout: .now() + 5) == .timedOut {
            throw MediaError.cameraFailed("Camera switch timed out")
        }
        if let error = captureError.error {
            throw MediaError.cameraFailed(error.localizedDescription)
        }
    }

    func cameraFormat(from formats: [AVCaptureDevice.Format]) -> (format: AVCaptureDevice.Format, fps: Int)? {
        let match = formats.first { format in
            let dimensions = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            return dimensions.width == 1280 && dimensions.height == 720
        }
        guard let chosen = match ?? formats.last else {
            return nil
        }
        let maxFps = chosen.videoSupportedFrameRateRanges.map { Int($0.maxFrameRate) }.max() ?? 30
        return (chosen, min(30, maxFps))
    }
}

/// A camera from `FishjamClient.cameraDevices()`.
public struct CameraDevice: Equatable {
    public let deviceId: String
    public let label: String
    public let front: Bool

    public init(deviceId: String, label: String, front: Bool) {
        self.deviceId = deviceId
        self.label = label
        self.front = front
    }
}

struct DiscoveredCamera: Equatable {
    let deviceId: String
    let name: String
    let front: Bool
}

func listedCameras(from discovered: [DiscoveredCamera]) -> [CameraDevice] {
    discovered.compactMap { camera in
        guard !camera.deviceId.isEmpty else {
            return nil
        }
        let name = camera.name.trimmingCharacters(in: .whitespacesAndNewlines)
        let label = name.isEmpty ? "Unknown video device" : name
        return CameraDevice(deviceId: camera.deviceId, label: label, front: camera.front)
    }
}

private final class ErrorBox {
    var error: Error?
}

func requireListedCamera(_ devices: [CameraDevice], deviceId: String) throws -> CameraDevice {
    guard !deviceId.isEmpty, let device = devices.first(where: { $0.deviceId == deviceId }) else {
        throw MediaError.noCamera
    }
    return device
}
