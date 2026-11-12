import Combine
import FishjamCore
import Foundation
import WebRTC

/// Owns the microphone: start, stop, its publish loop, and its error.
final class MicrophoneController: ObservableObject {
    @Published private(set) var isOn = false
    @Published private(set) var deviceError: DeviceError?

    private let host: DeviceHost
    private let epoch = DeviceEpoch()
    private let publisher: TrackPublisher

    init(host: DeviceHost) {
        self.host = host
        self.publisher = TrackPublisher(host: host)
    }

    func start() async throws {
        if await MainActor.run(body: { self.isOn }) {
            await MainActor.run { self.deviceError = nil }
            return
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
            ) else { return }
            track = started
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            let mapped = deviceErrorForMicrophoneFailure(error)
            await MainActor.run { self.deviceError = mapped }
            throw error
        }
        await MainActor.run {
            guard self.isCurrentDevice(generation, epochValue) else { return }
            self.isOn = true
            self.deviceError = nil
            self.publisher.start(
                track: track,
                kind: .audio,
                type: .microphone,
                generation: generation,
                isCurrent: { self.isCurrentDevice(generation, epochValue) }
            )
        }
    }

    func stop() async throws {
        let (generation, epochValue) = await MainActor.run { () -> (Int, Int) in
            (self.host.captureGeneration, self.epoch.advance())
        }
        let trackIds = await MainActor.run { self.publisher.stopAndTakeTrackIds() }
        await host.session.stopMicrophone(generation: generation)
        for trackId in trackIds {
            try await host.removePublishedTrack(trackId)
        }
        await MainActor.run {
            guard self.epoch.current() == epochValue else { return }
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
        _ = publisher.stopAndTakeTrackIds()
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
