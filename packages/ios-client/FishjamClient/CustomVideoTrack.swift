import CoreVideo
import Foundation
import Metal
import WebRTC

/// A custom video track the app fills by index from a `CustomVideoBufferPool`.
public final class PooledVideoTrack {
    public let track: VideoTrack
    private let pool: CustomVideoBufferPool
    private let capture: CustomVideoCapture
    private let onStopped: (VideoTrack) -> Void
    private var stopped = false

    init(
        track: VideoTrack,
        pool: CustomVideoBufferPool,
        capture: CustomVideoCapture,
        onStopped: @escaping (VideoTrack) -> Void
    ) {
        self.track = track
        self.pool = pool
        self.capture = capture
        self.onStopped = onStopped
    }

    /// Sends the frame you drew into the pool slot at `bufferIndex`.
    ///
    /// `timestampNs` is a number of nanoseconds that says when the frame belongs in time.
    /// It must go up with every frame. Use the device uptime clock, for example `DispatchTime.now().uptimeNanoseconds`.
    /// The SDK sends it unchanged.
    ///
    /// `rotation` is 0, 90, 180, or 270 clockwise. Any other value is treated as 0.
    /// `fence` is only needed when the GPU may still be drawing into the slot. Pass nil otherwise.
    public func pushFrame(
        bufferIndex: Int,
        timestampNs: Int64,
        rotation: Int = 0,
        fence: CustomVideoFence? = nil
    ) {
        guard !stopped else { return }
        capture.pushFrame(
            bufferIndex: bufferIndex,
            timestampNs: timestampNs,
            rotation: customVideoRotation(rotation),
            fence: fence
        )
    }

    /// Ends this track for good. Frames stop, and the track cannot be restarted.
    /// To send again, create a new track.
    /// Unpublish it first with `setCustomSource(sourceId:track:)` using nil.
    /// Then stop it, and only then dispose its pool.
    public func stop() {
        guard !stopped else { return }
        stopped = true
        track.isEnabled = false
        capture.stop()
        pool.gate.trackStopped()
        onStopped(track)
    }
}

/// A custom video track the app fills with buffers it already owns.
public final class ForwardVideoTrack {
    public let track: VideoTrack
    private let capture: CustomVideoCapture
    private let onStopped: (VideoTrack) -> Void
    private var stopped = false

    init(track: VideoTrack, capture: CustomVideoCapture, onStopped: @escaping (VideoTrack) -> Void) {
        self.track = track
        self.capture = capture
        self.onStopped = onStopped
    }

    /// Sends `buffer`, a frame that already exists (for example from a video file or camera).
    /// The SDK keeps the buffer for encoding, so you may release your own reference right away.
    ///
    /// `timestampNs` is nanoseconds, as in `PooledVideoTrack.pushFrame`. Leave it at 0 and the SDK
    /// stamps the frame with the device uptime clock when it delivers it.
    /// `rotation` is 0, 90, 180, or 270 clockwise. Any other value is treated as 0.
    public func forwardFrame(buffer: CVPixelBuffer, timestampNs: Int64 = 0, rotation: Int = 0) {
        guard !stopped else { return }
        capture.forwardFrame(buffer, timestampNs: timestampNs, rotation: customVideoRotation(rotation))
    }

    /// Ends this track for good. Frames stop, and the track cannot be restarted.
    /// To send again, create a new track.
    /// Unpublish it first with `setCustomSource(sourceId:track:)` using nil, then stop it.
    public func stop() {
        guard !stopped else { return }
        stopped = true
        track.isEnabled = false
        capture.stop()
        onStopped(track)
    }
}

final class CustomVideoFactory {
    private let session: MediaSession
    private var tracks: [AnyObject] = []
    private var pools: [CustomVideoBufferPool] = []

    init(session: MediaSession) {
        self.session = session
    }

    func createPool(width: Int, height: Int, poolSize: Int) throws -> CustomVideoBufferPool {
        let pool = try createCustomVideoBufferPool(width: width, height: height, poolSize: poolSize)
        pools.append(pool)
        return pool
    }

    func createPooled(_ pool: CustomVideoBufferPool) throws -> PooledVideoTrack {
        try pool.gate.attach()
        let (source, track) = session.createCustomVideoTrack()
        let capture = CustomVideoCapture(source: source, pool: pool)
        let created = PooledVideoTrack(track: track, pool: pool, capture: capture) { [weak self] stopped in
            self?.session.unregisterCustomTrack(stopped)
        }
        tracks.append(created)
        return created
    }

    func createForward() -> ForwardVideoTrack {
        let (source, track) = session.createCustomVideoTrack()
        let capture = CustomVideoCapture(source: source, pool: nil)
        let created = ForwardVideoTrack(track: track, capture: capture) { [weak self] stopped in
            self?.session.unregisterCustomTrack(stopped)
        }
        tracks.append(created)
        return created
    }

    func close() {
        tracks.forEach { track in
            if let pooled = track as? PooledVideoTrack {
                pooled.stop()
            } else if let forwarded = track as? ForwardVideoTrack {
                forwarded.stop()
            }
        }
        pools.forEach { pool in try? pool.dispose() }
        tracks.removeAll()
        pools.removeAll()
    }
}
