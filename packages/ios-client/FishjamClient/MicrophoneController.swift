import Combine
import Foundation
import WebRTC

/// Owns the microphone: start, stop, its source in the room, and its error.
final class MicrophoneController: ObservableObject {
    @Published private(set) var isOn = false
    @Published private(set) var deviceError: DeviceError?

    private let host: DeviceHost
    private let epoch = DeviceEpoch()
    private var runningTrack: AudioTrack?

    init(host: DeviceHost) {
        self.host = host
    }

    func start() async throws -> AudioTrack {
        if await MainActor.run(body: { self.isOn }) {
            await MainActor.run { self.deviceError = nil }
            guard let track = await MainActor.run(body: { self.runningTrack }) else {
                throw DeviceStopped()
            }
            return track
        }
        let (generation, epochValue) = await MainActor.run {
            (self.host.captureGeneration, self.epoch.advance())
        }
        let epoch = self.epoch
        let track: AudioTrack
        do {
            guard let started = try await host.session.startMicrophone(
                generation: generation,
                isCurrent: { epoch.current() == epochValue }
            ) else { throw DeviceStopped() }
            track = started
        } catch is CancellationError {
            throw CancellationError()
        } catch is DeviceStopped {
            throw DeviceStopped()
        } catch {
            let mapped = deviceErrorForMicrophoneFailure(error)
            await MainActor.run { self.deviceError = mapped }
            throw error
        }
        guard let published = try await MainActor.run(body: { () throws -> AudioTrack? in
            guard self.isCurrentDevice(generation, epochValue) else { return nil }
            self.isOn = true
            self.deviceError = nil
            self.runningTrack = track
            try self.host.publishSource(
                microphoneSourceId,
                track: track,
                kind: .audio,
                type: .microphone,
                generation: generation
            )
            return track
        }) else {
            throw DeviceStopped()
        }
        return published
    }

    func stop() async throws {
        let (generation, epochValue) = await MainActor.run { () -> (Int, Int) in
            (self.host.captureGeneration, self.epoch.advance())
        }
        await MainActor.run { self.host.muteLocalSource(sourceId: microphoneSourceId) }
        await host.session.stopMicrophone(generation: generation)
        await MainActor.run {
            guard self.epoch.current() == epochValue else { return }
            self.runningTrack = nil
            self.isOn = false
        }
    }

    func toggle() async throws {
        if await MainActor.run(body: { self.isOn }) {
            try await stop()
        } else {
            try await start()
        }
    }

    /// Stops the microphone when the room is left. The error is kept.
    func reset() {
        epoch.advance()
        host.removeLocalSource(sourceId: microphoneSourceId)
        runningTrack = nil
        isOn = false
    }

    /// Used by `initializeDevices`. Asks for microphone permission, then starts the microphone.
    /// Returns the error, or nil when the microphone is on.
    func startRequested() async throws -> DeviceError? {
        if await MainActor.run(body: { self.isOn }) {
            await MainActor.run { self.deviceError = nil }
            return nil
        }
        var status = queryPermission(for: .audio)
        if status != .granted {
            status = await requestPermission(for: .audio)
        }
        guard status == .granted else {
            await MainActor.run { self.deviceError = .notAllowed }
            return .notAllowed
        }
        do {
            try await start()
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            let stored = await MainActor.run { self.deviceError }
            return stored ?? deviceErrorForMicrophoneFailure(error)
        }
        let microphoneIsOn = await MainActor.run { self.isOn }
        if microphoneIsOn { return nil }
        let stored = await MainActor.run { self.deviceError }
        if let stored { return stored }
        await MainActor.run { self.deviceError = .unknown }
        return .unknown
    }

    private func isCurrentDevice(_ generation: Int, _ epochValue: Int) -> Bool {
        host.isCurrentCapture(generation) && epoch.current() == epochValue
    }
}
