import CoreVideo
import Foundation
import WebRTC

extension FishjamClient {
    /// Creates `poolSize` memory slots, each `width` by `height` pixels, that you draw frames into.
    ///
    /// Use a pool only when you draw each frame yourself (for example a clock or graphics).
    /// For frames that already exist, such as from a video file or camera, call `createCustomVideoTrack()`
    /// with no arguments instead.
    ///
    /// Pass the pool to `createCustomVideoTrack(pool:)`. Draw into `pool.buffers[i].buffer`, then call
    /// `PooledVideoTrack.pushFrame` with index `i`. Use 3 slots as a default: while the SDK sends one
    /// slot, you can draw into another.
    ///
    /// - Throws: `CustomVideoError` if the size is not positive or the buffers cannot be allocated.
    public func createCustomVideoBufferPool(width: Int, height: Int, poolSize: Int) throws -> CustomVideoBufferPool {
        try customVideo.createPool(width: width, height: height, poolSize: poolSize)
    }

    /// Creates a video track that you draw into `pool`. Send each frame with `PooledVideoTrack.pushFrame`.
    /// A pool can be used by only one track.
    /// Publish the track with `setCustomSource(sourceId:track:)`.
    ///
    /// - Throws: `CustomVideoError` if the pool is already used by a track or has been disposed.
    public func createCustomVideoTrack(pool: CustomVideoBufferPool) throws -> PooledVideoTrack {
        try customVideo.createPooled(pool)
    }

    /// Creates a video track for frames that already exist, such as from a video file or camera.
    /// Send each frame with `ForwardVideoTrack.forwardFrame`.
    /// Publish the track with `setCustomSource(sourceId:track:)`.
    public func createCustomVideoTrack() -> ForwardVideoTrack {
        customVideo.createForward()
    }

    /// Publishes `track` to the room under `sourceId`, so other peers see it as a custom video.
    ///
    /// You can call it before or after joining. It publishes once you are connected, and again after a reconnect.
    /// Passing nil removes the track from the room. It does not stop the track: call
    /// `ForwardVideoTrack.stop()` or `PooledVideoTrack.stop()` for that.
    /// Setting the same track again does nothing.
    /// Source ids that start with `builtin.` are reserved for the built-in devices.
    public func setCustomSource(sourceId: String, track: VideoTrack?) async throws {
        try await MainActor.run {
            try self.customSources.set(sourceId: sourceId, track: track)
        }
    }

    /// The track currently set for `sourceId`, or nil.
    public func customSource(sourceId: String) -> VideoTrack? {
        customSources.track(sourceId: sourceId)
    }
}
