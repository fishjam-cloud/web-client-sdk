import Combine
import Foundation
import WebRTC

/// Owns screen sharing: socket listen, publish, and its error.
final class ScreenShareController: ObservableObject {
    @Published private(set) var isOn = false
    @Published private(set) var deviceError: DeviceError?

    private let host: DeviceHost
    private let config: () -> ScreenShareConfig?
    private let epoch = DeviceEpoch()
    private let publisher: TrackPublisher

    init(host: DeviceHost, config: @escaping () -> ScreenShareConfig?) {
        self.host = host
        self.config = config
        self.publisher = TrackPublisher(host: host)
    }

    func start(presentPicker: Bool = true) async throws {
        if await MainActor.run(body: { self.isOn }) {
            await MainActor.run { self.deviceError = nil }
            return
        }
        try await rejectIfAudioOnly()
        let resolved = try await resolveConfig()
        let (generation, epochValue) = await MainActor.run {
            (self.host.captureGeneration, self.epoch.advance())
        }
        try await beginCapture(resolved: resolved, generation: generation, epochValue: epochValue)
        if presentPicker {
            await MainActor.run {
                _ = presentBroadcastPicker(extensionBundleId: resolved.extensionBundleId)
            }
        }
    }

    func stop() async throws {
        let (generation, epochValue) = await MainActor.run { () -> (Int, Int) in
            (self.host.captureGeneration, self.epoch.advance())
        }
        let trackIds = await MainActor.run { self.publisher.stopAndTakeTrackIds() }
        await host.session.stopScreenShare(generation: generation)
        for trackId in trackIds {
            try await host.removePublishedTrack(trackId)
            await MainActor.run { self.host.localTrackRemoved(trackId: trackId) }
        }
        await MainActor.run {
            guard self.epoch.current() == epochValue else { return }
            self.isOn = false
        }
    }

    /// Called when the broadcast extension closes the socket (user stopped the broadcast).
    func onSystemStopped() {
        Task {
            guard await MainActor.run(body: { self.isOn }) else { return }
            try? await stop()
        }
    }

    func toggle() async throws {
        if await MainActor.run(body: { self.isOn }) {
            try await stop()
        } else {
            try await start()
        }
    }

    /// Stops screen sharing when the room is left. The error is kept.
    func reset() {
        epoch.advance()
        publisher.stopAndReportRemoved()
        isOn = false
    }

    private func rejectIfAudioOnly() async throws {
        let rejectVideo = await MainActor.run {
            cameraStart(connected: self.host.peerStatus == .connected, audioOnly: self.host.audioOnly) == .rejectVideo
        }
        if rejectVideo {
            throw TrackTypeError()
        }
    }

    private func resolveConfig() async throws -> ScreenShareConfig {
        do {
            return try ScreenShareConfig.resolve(config())
        } catch {
            let mapped = deviceErrorForScreenShareFailure(error)
            await MainActor.run { self.deviceError = mapped }
            throw error
        }
    }

    private func beginCapture(
        resolved: ScreenShareConfig,
        generation: Int,
        epochValue: Int
    ) async throws {
        let epoch = self.epoch
        do {
            try await host.session.startScreenShare(
                generation: generation,
                appGroupId: resolved.appGroupId,
                isCurrent: { epoch.current() == epochValue },
                onReady: { [weak self] track in
                    self?.publishWhenReady(track: track, generation: generation, epochValue: epochValue)
                }
            )
        } catch is CancellationError {
            throw CancellationError()
        } catch is TrackTypeError {
            throw TrackTypeError()
        } catch {
            let mapped = deviceErrorForScreenShareFailure(error)
            await MainActor.run { self.deviceError = mapped }
            throw error
        }
    }

    private func publishWhenReady(track: VideoTrack, generation: Int, epochValue: Int) {
        Task { @MainActor in
            guard self.isCurrentDevice(generation, epochValue) else { return }
            self.isOn = true
            self.deviceError = nil
            self.publisher.start(
                track: track,
                kind: .video,
                type: .screenShareVideo,
                generation: generation,
                isCurrent: { self.isCurrentDevice(generation, epochValue) }
            )
        }
    }

    private func isCurrentDevice(_ generation: Int, _ epochValue: Int) -> Bool {
        host.isCurrentCapture(generation) && epoch.current() == epochValue
    }
}
