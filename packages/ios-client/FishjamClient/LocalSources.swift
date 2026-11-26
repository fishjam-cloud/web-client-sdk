import Foundation
import WebRTC

/// What `LocalSources` asks of the core.
protocol LocalSourceCore: AnyObject {
    func setLocalSource(sourceId: String, mediaId: String, kind: CoreTrackKind, type: CoreTrackType) throws
    func removeLocalSource(sourceId: String)
}

/// What `LocalSources` reports to: the WebRTC session and the app's events.
protocol LocalSourceSink: AnyObject {
    /// Gives the media for `trackId` to the session, so it can go on that track's sender.
    func bind(trackId: String, track: RTCMediaStreamTrack, generation: Int)
    /// Puts `track` on the sender of `trackId`. The track id does not change.
    func replace(trackId: String, track: RTCMediaStreamTrack)
    func localTrackAdded(trackId: String, type: CoreTrackType)
    func localTrackRemoved(trackId: String)
    func localTrackReplaced(trackId: String)
}

/// Keeps the WebRTC media for each source. The platform chooses a media id for each `set` and the core
/// echoes it in its events. The core handles events in order, so a media id that is older than the
/// event's own media id for the same source can no longer be published, and is dropped.
/// Call it on the main thread.
final class LocalSources {
    private struct Media {
        let mediaId: String
        let sourceId: String
        let track: RTCMediaStreamTrack
        let generation: Int
        let type: CoreTrackType
    }

    private let core: LocalSourceCore
    private let sink: LocalSourceSink
    private let lock = NSLock()
    /// In the order they were set.
    private var media: [Media] = []

    init(core: LocalSourceCore, sink: LocalSourceSink) {
        self.core = core
        self.sink = sink
    }

    /// Publishes `track` as `sourceId`. The core publishes it now when connected, otherwise on connect.
    func set(
        sourceId: String,
        track: RTCMediaStreamTrack,
        kind: CoreTrackKind,
        type: CoreTrackType,
        generation: Int
    ) throws {
        let mediaId = UUID().uuidString
        lock.lock()
        media.append(Media(mediaId: mediaId, sourceId: sourceId, track: track, generation: generation, type: type))
        lock.unlock()
        do {
            try core.setLocalSource(sourceId: sourceId, mediaId: mediaId, kind: kind, type: type)
        } catch {
            forget(mediaId: mediaId)
            throw error
        }
    }

    /// Stops publishing `sourceId` and forgets its media. Its track is not stopped.
    func remove(sourceId: String) {
        lock.lock()
        media.removeAll { $0.sourceId == sourceId }
        lock.unlock()
        core.removeLocalSource(sourceId: sourceId)
    }

    func published(mediaId: String, trackId: String) {
        guard let entry = take(mediaId: mediaId) else { return }
        sink.localTrackAdded(trackId: trackId, type: entry.type)
        sink.bind(trackId: trackId, track: entry.track, generation: entry.generation)
    }

    func replaced(mediaId: String, trackId: String) {
        guard let entry = take(mediaId: mediaId) else { return }
        sink.replace(trackId: trackId, track: entry.track)
        sink.localTrackReplaced(trackId: trackId)
    }

    func unpublished(trackId: String) {
        sink.localTrackRemoved(trackId: trackId)
    }

    /// A rejected source keeps its media, so a later publish can use it.
    func rejected() {}

    /// Returns the media for `mediaId` and drops the older media of the same source. Nil when unknown.
    private func take(mediaId: String) -> Media? {
        lock.lock()
        defer { lock.unlock() }
        guard let index = media.firstIndex(where: { $0.mediaId == mediaId }) else { return nil }
        let entry = media[index]
        media = media.enumerated().filter { offset, current in
            offset >= index || current.sourceId != entry.sourceId
        }.map(\.element)
        return entry
    }

    private func forget(mediaId: String) {
        lock.lock()
        media.removeAll { $0.mediaId == mediaId }
        lock.unlock()
    }
}
