import Combine
import FishjamCore
import Foundation
import WebRTC

private enum CameraSelection {
    case same
    case running(Int)
    case stopped
}

/// Owns the camera: start, stop, switch, its publish loop, and its error.
final class CameraController: ObservableObject {
    @Published private(set) var isOn = false
    @Published private(set) var currentCamera: CameraDevice?
    @Published private(set) var deviceError: DeviceError?

    private let host: DeviceHost
    private let epoch = DeviceEpoch()
    private let publisher: TrackPublisher
    private var preferredCameraId: String?

    init(host: DeviceHost) {
        self.host = host
        self.publisher = TrackPublisher(host: host)
    }

    func devices() -> [CameraDevice] {
        host.session.cameraDevices()
    }

    /// Switches to `deviceId` from `devices()`.
    /// An open camera stays the same video track, so the room and the published track stay.
    func select(deviceId: String) async throws {
        let devices = devices()
        do {
            let device = try requireListedCamera(devices, deviceId: deviceId)
            let selection = await MainActor.run { () -> CameraSelection in
                guard self.isOn else { return .stopped }
                if self.currentCamera?.deviceId == device.deviceId {
                    return .same
                }
                return .running(self.host.captureGeneration)
            }
            switch selection {
            case .same:
                await MainActor.run { self.deviceError = nil }
            case .running(let generation):
                try await host.session.switchCamera(generation: generation, deviceId: device.deviceId)
                await MainActor.run {
                    guard self.host.captureGeneration == generation, self.isOn else { return }
                    self.preferredCameraId = device.deviceId
                    self.currentCamera = device
                    self.deviceError = nil
                }
            case .stopped:
                try await start(deviceId: device.deviceId)
            }
        } catch is CancellationError {
            throw CancellationError()
        } catch is TrackTypeError {
            throw TrackTypeError()
        } catch {
            let mapped = deviceErrorForCameraFailure(error)
            await MainActor.run { self.deviceError = mapped }
            throw error
        }
    }

    func start() async throws {
        let deviceId = await MainActor.run { () -> String? in
            guard let preferredCameraId = self.preferredCameraId else { return nil }
            let listed = self.devices().contains { $0.deviceId == preferredCameraId }
            return listed ? preferredCameraId : nil
        }
        try await start(deviceId: deviceId)
    }

    func stop() async throws {
        let (generation, epochValue) = await MainActor.run { () -> (Int, Int) in
            (self.host.captureGeneration, self.epoch.advance())
        }
        let trackIds = await MainActor.run { self.publisher.stopAndTakeTrackIds() }
        await host.session.stopCamera(generation: generation)
        for trackId in trackIds {
            try await host.removePublishedTrack(trackId)
        }
        await MainActor.run {
            guard self.epoch.current() == epochValue else { return }
            self.host.setLocalCamera(nil)
            self.isOn = false
            self.currentCamera = nil
        }
    }

    func toggle() async throws {
        if await MainActor.run(body: { self.isOn }) {
            try await stop()
        } else {
            try await start()
        }
    }

    /// Stops the camera when the room is left. The error is kept.
    func reset() {
        epoch.advance()
        _ = publisher.stopAndTakeTrackIds()
        host.setLocalCamera(nil)
        isOn = false
        currentCamera = nil
    }

    /// Used by `initializeDevices`. Asks for camera permission, then starts the camera.
    /// Returns the error, or nil when the camera is on.
    func startRequested() async throws -> DeviceError? {
        if await MainActor.run(body: { self.isOn }) {
            await MainActor.run { self.deviceError = nil }
            return nil
        }
        var status = queryPermission(for: .video)
        if status != .granted {
            status = await requestPermission(for: .video)
        }
        guard status == .granted else {
            await MainActor.run { self.deviceError = .notAllowed }
            return .notAllowed
        }
        do {
            try await start()
        } catch is CancellationError {
            throw CancellationError()
        } catch is TrackTypeError {
            throw TrackTypeError()
        } catch {
            let stored = await MainActor.run { self.deviceError }
            if let stored { return stored }
            return deviceErrorForCameraFailure(error)
        }
        let cameraIsOn = await MainActor.run { self.isOn }
        if cameraIsOn { return nil }
        let stored = await MainActor.run { self.deviceError }
        if let stored { return stored }
        await MainActor.run { self.deviceError = .unknown }
        return .unknown
    }

    private func start(deviceId: String?) async throws {
        if await MainActor.run(body: { self.isOn }) {
            await MainActor.run { self.deviceError = nil }
            return
        }
        let rejectVideo = await MainActor.run {
            cameraStart(connected: self.host.peerStatus == .connected, audioOnly: self.host.audioOnly) == .rejectVideo
        }
        if rejectVideo {
            throw TrackTypeError()
        }
        let (generation, epochValue) = await MainActor.run {
            (self.host.captureGeneration, self.epoch.advance())
        }
        let epoch = self.epoch
        let opened: OpenedCamera
        do {
            guard let started = try await host.session.startCamera(
                generation: generation,
                deviceId: deviceId,
                isCurrent: { epoch.current() == epochValue }
            ) else { return }
            opened = started
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            let mapped = deviceErrorForCameraFailure(error)
            await MainActor.run { self.deviceError = mapped }
            throw error
        }
        await MainActor.run {
            guard self.isCurrentDevice(generation, epochValue) else { return }
            self.isOn = true
            self.preferredCameraId = opened.device.deviceId
            self.currentCamera = opened.device
            self.host.setLocalCamera(opened.track)
            self.deviceError = nil
            self.publisher.start(
                track: opened.track,
                kind: .video,
                type: .camera,
                generation: generation,
                isCurrent: { self.isCurrentDevice(generation, epochValue) }
            )
        }
    }

    private func isCurrentDevice(_ generation: Int, _ epochValue: Int) -> Bool {
        host.isCurrentCapture(generation) && epoch.current() == epochValue
    }
}
