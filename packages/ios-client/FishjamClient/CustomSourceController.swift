import Foundation
import WebRTC

protocol CustomSourceHost: AnyObject {
    var peerStatus: PeerStatus { get }
    var isClosed: Bool { get }
    var audioOnly: Bool { get }
    var captureGeneration: Int { get }
    func publishCustomVideo() throws -> String
    func removePublishedTrack(_ trackId: String) async
    func localTrackAdded(trackId: String)
    func localTrackRemoved(trackId: String)
    func bind(trackId: String, track: RTCMediaStreamTrack, generation: Int)
    func waitUntil(_ matches: @escaping (PeerStatus) -> Bool, isCurrent: @escaping () -> Bool) async
}

/// One custom video track per source id.
/// `set` calls run one at a time. A track set before the peer is connected is published on connect,
/// and published again after the connection drops and comes back.
/// Setting nil unpublishes the track and does not stop it.
final class CustomSourceController {
    private var chain: Task<Void, Error> = Task {}
    private var sources: [String: Source] = [:]

    func track(sourceId: String) -> VideoTrack? {
        sources[sourceId]?.track
    }

    func set(sourceId: String, track: VideoTrack?, host: CustomSourceHost) async throws {
        let previous = chain
        let task = Task {
            _ = try? await previous.value
            try await self.apply(sourceId: sourceId, track: track, host: host)
        }
        chain = task
        try await task.value
    }

    func close() {
        chain.cancel()
        sources.values.forEach { source in
            source.epoch += 1
            source.task?.cancel()
        }
        sources.removeAll()
    }

    private func apply(sourceId: String, track: VideoTrack?, host: CustomSourceHost) async throws {
        if host.isClosed {
            return
        }
        if let existing = sources[sourceId], track == nil {
            retire(existing, host: host)
            sources.removeValue(forKey: sourceId)
            return
        }
        if let existing = sources[sourceId], existing.track === track {
            return
        }
        if host.peerStatus == .connected && host.audioOnly {
            throw TrackTypeError()
        }
        if let existing = sources[sourceId] {
            retire(existing, host: host)
        }
        guard let track else { return }
        let source = Source(track: track, generation: host.captureGeneration, host: host)
        sources[sourceId] = source
        let epoch = source.epoch
        source.task = Task { [weak self] in
            guard let self else { return }
            await self.publish(sourceId: sourceId, source: source, epoch: epoch, host: host)
        }
    }

    private func publish(sourceId: String, source: Source, epoch: Int, host: CustomSourceHost) async {
        while current(sourceId: sourceId, source: source, epoch: epoch, host: host) {
            await host.waitUntil({ $0 == .connected }, isCurrent: {
                self.current(sourceId: sourceId, source: source, epoch: epoch, host: host)
            })
            guard current(sourceId: sourceId, source: source, epoch: epoch, host: host) else { return }
            let trackId: String
            do {
                trackId = try host.publishCustomVideo()
            } catch {
                return
            }
            guard current(sourceId: sourceId, source: source, epoch: epoch, host: host) else {
                await host.removePublishedTrack(trackId)
                return
            }
            source.trackIds.append(trackId)
            host.localTrackAdded(trackId: trackId)
            host.bind(trackId: trackId, track: source.track, generation: source.generation)
            await host.waitUntil({ $0 != .connected }, isCurrent: {
                self.current(sourceId: sourceId, source: source, epoch: epoch, host: host)
            })
            if current(sourceId: sourceId, source: source, epoch: epoch, host: host) {
                host.localTrackRemoved(trackId: trackId)
            }
        }
    }

    private func current(sourceId: String, source: Source, epoch: Int, host: CustomSourceHost) -> Bool {
        !host.isClosed && sources[sourceId] === source && source.epoch == epoch
    }

    private func retire(_ source: Source, host: CustomSourceHost) {
        source.epoch += 1
        source.task?.cancel()
        let ids = source.trackIds
        source.trackIds.removeAll()
        ids.forEach { trackId in
            host.localTrackRemoved(trackId: trackId)
            Task { await host.removePublishedTrack(trackId) }
        }
    }

    private final class Source {
        let track: VideoTrack
        let host: CustomSourceHost
        var generation: Int
        var epoch = 0
        var task: Task<Void, Never>?
        var trackIds: [String] = []

        init(track: VideoTrack, generation: Int, host: CustomSourceHost) {
            self.track = track
            self.generation = generation
            self.host = host
        }
    }
}
