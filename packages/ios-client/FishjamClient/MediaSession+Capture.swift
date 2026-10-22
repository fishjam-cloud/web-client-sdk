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
        #endif
    }

    func cameraDevice() -> AVCaptureDevice? {
        let webrtcDevices = RTCCameraVideoCapturer.captureDevices()
        if let device = webrtcDevices.first(where: { $0.position == .front }) ?? webrtcDevices.first {
            return device
        }
        var types: [AVCaptureDevice.DeviceType] = [.builtInWideAngleCamera]
        if #available(iOS 17.0, *) {
            types.append(.external)
            types.append(.continuityCamera)
        }
        let discovered = AVCaptureDevice.DiscoverySession(
            deviceTypes: types,
            mediaType: .video,
            position: .unspecified
        ).devices
        return discovered.first { $0.position == .front } ?? discovered.first
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
