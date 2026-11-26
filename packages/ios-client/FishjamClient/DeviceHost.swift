import Foundation
import WebRTC

/// Source ids of the built-in devices. Custom source ids may not start with `builtInSourcePrefix`.
let builtInSourcePrefix = "builtin."
let cameraSourceId = "builtin.camera"
let microphoneSourceId = "builtin.microphone"
let screenShareSourceId = "builtin.screenShare"

/// What the camera, microphone and screen share controllers need from `FishjamClient`.
/// Read and write the published state only on the main thread.
protocol DeviceHost: AnyObject {
    var session: MediaSession { get }
    var peerStatus: PeerStatus { get }
    var captureGeneration: Int { get }
    var isClosed: Bool { get }
    var audioOnly: Bool { get }

    /// Publishes `track` as `sourceId`. The core publishes it when connected, and again after a reconnect.
    func setLocalSource(
        sourceId: String,
        track: RTCMediaStreamTrack,
        kind: CoreTrackKind,
        type: CoreTrackType,
        generation: Int
    ) throws
    /// Removes `sourceId` from the room. The device keeps running; the caller stops it.
    func removeLocalSource(sourceId: String)
    func setLocalCamera(_ track: VideoTrack?)
    /// The camera switched device, so the published track of `type` stays but its media changed.
    func localTracksReplaced(type: CoreTrackType)
}

extension DeviceHost {
    func isCurrentCapture(_ generation: Int) -> Bool {
        !isClosed && generation == captureGeneration
    }

    /// Publishes `track` as `sourceId`. A video track in an audio-only room stays on, unpublished.
    func publishSource(
        _ sourceId: String,
        track: RTCMediaStreamTrack,
        kind: CoreTrackKind,
        type: CoreTrackType,
        generation: Int
    ) throws {
        do {
            try setLocalSource(sourceId: sourceId, track: track, kind: kind, type: type, generation: generation)
        } catch is TrackTypeError {
            // The device stays on, unpublished.
        }
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
