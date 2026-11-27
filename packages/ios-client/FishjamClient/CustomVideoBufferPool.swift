import CoreVideo
import Foundation

/// One buffer in a `CustomVideoBufferPool`. `index` does not change.
public struct CustomVideoBuffer {
    public let index: Int
    public let buffer: CVPixelBuffer
    public let width: Int
    public let height: Int
}

/// Buffers the app renders into, then hands back with `PooledVideoTrack.pushFrame`.
/// BGRA, IOSurface-backed. Dispose only after the track that uses the pool has stopped.
public final class CustomVideoBufferPool {
    public private(set) var buffers: [CustomVideoBuffer]
    let gate = CustomVideoPoolGate()
    private var pool: CVPixelBufferPool?

    init(buffers: [CustomVideoBuffer], pool: CVPixelBufferPool) {
        self.buffers = buffers
        self.pool = pool
    }

    /// Frees the pool's memory. Call it only after the track that uses this pool has been stopped.
    /// Calling it again does nothing.
    ///
    /// - Throws: `CustomVideoError` while that track is still running.
    public func dispose() throws {
        guard try gate.dispose() else { return }
        buffers = []
        pool = nil
    }
}

func createCustomVideoBufferPool(width: Int, height: Int, poolSize: Int) throws -> CustomVideoBufferPool {
    try requireCustomVideoPoolSize(width: width, height: height, poolSize: poolSize)
    let pixelBufferAttributes: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
        kCVPixelBufferIOSurfacePropertiesKey as String: [:] as [String: Any],
        kCVPixelBufferMetalCompatibilityKey as String: true
    ]
    let poolAttributes: [String: Any] = [
        kCVPixelBufferPoolMinimumBufferCountKey as String: poolSize
    ]
    var pool: CVPixelBufferPool?
    let poolStatus = CVPixelBufferPoolCreate(
        kCFAllocatorDefault,
        poolAttributes as CFDictionary,
        pixelBufferAttributes as CFDictionary,
        &pool
    )
    guard poolStatus == kCVReturnSuccess, let pool else {
        throw CustomVideoError(message: "CVPixelBufferPoolCreate failed: \(poolStatus)")
    }
    var buffers: [CustomVideoBuffer] = []
    for index in 0 ..< poolSize {
        var pixelBuffer: CVPixelBuffer?
        let status = CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pixelBuffer)
        guard status == kCVReturnSuccess, let pixelBuffer else {
            throw CustomVideoError(message: "CVPixelBufferPoolCreatePixelBuffer failed at index \(index): \(status)")
        }
        buffers.append(CustomVideoBuffer(index: index, buffer: pixelBuffer, width: width, height: height))
    }
    return CustomVideoBufferPool(buffers: buffers, pool: pool)
}
