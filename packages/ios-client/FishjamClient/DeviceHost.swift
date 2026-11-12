import FishjamCore
import Foundation
import WebRTC

/// What the camera and microphone controllers need from `FishjamClient`.
/// Read and write the published state only on the main thread.
protocol DeviceHost: AnyObject {
    var session: MediaSession { get }
    var peerStatus: PeerStatus { get }
    var captureGeneration: Int { get }
    var isClosed: Bool { get }
    var audioOnly: Bool { get }

    func resumeStatusWaiters()
    func waitForPeerStatus(
        _ matches: @escaping (PeerStatus) -> Bool,
        whileCurrent isCurrent: @escaping () -> Bool
    ) async
    func publish(kind: Fishjam_Sdk_TrackKind, type: Fishjam_Sdk_TrackType) throws -> String
    func removePublishedTrack(_ trackId: String) async throws
    func setLocalCamera(_ track: VideoTrack?)
    /// Report local track changes to `FishjamClient.events`. Call these on the main thread.
    func localTrackAdded(trackId: String, type: Fishjam_Sdk_TrackType)
    func localTrackRemoved(trackId: String)
    func localTracksReplaced(type: Fishjam_Sdk_TrackType)
}

extension DeviceHost {
    func isCurrentCapture(_ generation: Int) -> Bool {
        !isClosed && generation == captureGeneration
    }
}

/// Counts the start and stop calls of one device. Safe to read from any thread.
final class DeviceEpoch: @unchecked Sendable {
    private let lock = NSLock()
    private var value = 0

    @discardableResult
    func advance() -> Int {
        lock.lock()
        defer { lock.unlock() }
        value += 1
        return value
    }

    func current() -> Int {
        lock.lock()
        defer { lock.unlock() }
        return value
    }
}

/// Publishes one local track each time the peer connects, and removes it when the device stops.
final class TrackPublisher {
    private let host: DeviceHost
    private var task: Task<Void, Never>?
    private var trackIds: [String] = []

    init(host: DeviceHost) {
        self.host = host
    }

    /// Starts the publish loop. It stops once `isCurrent` returns false.
    func start(
        track: RTCMediaStreamTrack,
        kind: Fishjam_Sdk_TrackKind,
        type: Fishjam_Sdk_TrackType,
        generation: Int,
        isCurrent: @escaping () -> Bool
    ) {
        task?.cancel()
        task = Task {
            await self.run(track: track, kind: kind, type: type, generation: generation, isCurrent: isCurrent)
        }
    }

    /// Stops the loop, wakes the status waits so they see they are stale, and returns the published track ids.
    func stopAndTakeTrackIds() -> [String] {
        task?.cancel()
        task = nil
        host.resumeStatusWaiters()
        let ids = trackIds
        trackIds.removeAll()
        return ids
    }

    /// Like `stopAndTakeTrackIds`, for a room that was left: nothing is removed on the server,
    /// so the tracks are reported removed here.
    func stopAndReportRemoved() {
        stopAndTakeTrackIds().forEach { host.localTrackRemoved(trackId: $0) }
    }

    private func run(
        track: RTCMediaStreamTrack,
        kind: Fishjam_Sdk_TrackKind,
        type: Fishjam_Sdk_TrackType,
        generation: Int,
        isCurrent: @escaping () -> Bool
    ) async {
        while await isCurrentOnMain(isCurrent) {
            await host.waitForPeerStatus({ $0 == .connected }, whileCurrent: isCurrent)
            guard await isCurrentOnMain(isCurrent) else { return }
            let trackId: String
            do {
                trackId = try host.publish(kind: kind, type: type)
            } catch {
                return
            }
            let kept = await MainActor.run { () -> Bool in
                guard isCurrent() else { return false }
                self.trackIds.append(trackId)
                return true
            }
            guard kept else {
                try? await host.removePublishedTrack(trackId)
                return
            }
            guard await isCurrentOnMain(isCurrent) else {
                await MainActor.run { self.trackIds.removeAll { $0 == trackId } }
                try? await host.removePublishedTrack(trackId)
                return
            }
            await MainActor.run { self.host.localTrackAdded(trackId: trackId, type: type) }
            host.session.bind(trackId: trackId, track: track, generation: generation)
            await host.waitForPeerStatus({ $0 != .connected }, whileCurrent: isCurrent)
            // Still current: the connection ended for good, and the core dropped the track.
            // When the device was stopped, the stopper reports the removal.
            await MainActor.run {
                if isCurrent() { self.host.localTrackRemoved(trackId: trackId) }
            }
        }
    }

    private func isCurrentOnMain(_ isCurrent: @escaping () -> Bool) async -> Bool {
        if Task.isCancelled {
            return false
        }
        return await MainActor.run { isCurrent() }
    }
}
