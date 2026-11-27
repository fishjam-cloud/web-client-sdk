import Foundation
import WebRTC

/// Thrown when a custom source id uses the prefix that the built-in devices own.
struct InvalidSourceIdError: LocalizedError {
    var errorDescription: String? {
        "Source ids that start with \(builtInSourcePrefix) belong to the built-in devices"
    }
}

/// One custom video track per source id. The core publishes it, republishes it after a reconnect,
/// and replaces it on the same track id. This class keeps the track for each source id.
/// Setting nil unpublishes the track and does not stop it.
/// Call it on the main thread.
final class CustomSourceController {
    private let sources: LocalSources
    private let isOpen: () -> Bool
    private let captureGeneration: () -> Int
    private var tracks: [String: VideoTrack] = [:]

    init(sources: LocalSources, isOpen: @escaping () -> Bool, captureGeneration: @escaping () -> Int) {
        self.sources = sources
        self.isOpen = isOpen
        self.captureGeneration = captureGeneration
    }

    func track(sourceId: String) -> VideoTrack? {
        tracks[sourceId]
    }

    func set(sourceId: String, track: VideoTrack?) throws {
        guard !sourceId.hasPrefix(builtInSourcePrefix) else { throw InvalidSourceIdError() }
        guard isOpen() else { return }
        guard let track else {
            guard tracks.removeValue(forKey: sourceId) != nil else { return }
            sources.remove(sourceId: sourceId)
            return
        }
        if tracks[sourceId] === track { return }
        try sources.set(
            sourceId: sourceId,
            track: track,
            kind: .video,
            type: .customVideo,
            generation: captureGeneration()
        )
        tracks[sourceId] = track
    }

    func close() {
        tracks.removeAll()
    }
}
