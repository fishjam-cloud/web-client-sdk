import CoreVideo
import Foundation
import Metal
import WebRTC

/// Delivers app frames into an `RTCVideoSource`.
/// Pool frames are delivered on a serial queue. A Metal fence waits before that delivery.
/// Forwarded frames are delivered on the caller's thread.
final class CustomVideoCapture {
    private let condition = NSCondition()
    private var accepting = false
    private var inFlight = 0
    private var generation = 0
    private var tornDown = false
    private let videoSource: RTCVideoSource
    private let pool: CustomVideoBufferPool?
    private let queue = DispatchQueue(label: "fishjam.customVideo")
    private let listener: MTLSharedEventListener
    private let capturer = RTCVideoCapturer()

    init(source: RTCVideoSource, pool: CustomVideoBufferPool?) {
        videoSource = source
        self.pool = pool
        listener = MTLSharedEventListener(dispatchQueue: queue)
        condition.lock()
        accepting = true
        condition.unlock()
    }

    func pushFrame(bufferIndex: Int, timestampNs: Int64, rotation: RTCVideoRotation, fence: CustomVideoFence?) {
        condition.lock()
        guard let pool, pool.buffers.indices.contains(bufferIndex), accepting, !tornDown else {
            condition.unlock()
            return
        }
        let frameGeneration = generation
        inFlight += 1
        let buffer = pool.buffers[bufferIndex].buffer
        condition.unlock()

        if let fence {
            let event = fence.event
            event.notify(listener, atValue: fence.value) { [weak self] _, _ in
                self?.complete(
                    buffer: buffer,
                    generation: frameGeneration,
                    timestampNs: timestampNs,
                    rotation: rotation
                )
                _ = event
            }
            return
        }
        queue.async { [weak self] in
            self?.complete(
                buffer: buffer,
                generation: frameGeneration,
                timestampNs: timestampNs,
                rotation: rotation
            )
        }
    }

    func forwardFrame(_ buffer: CVPixelBuffer, timestampNs: Int64, rotation: RTCVideoRotation) {
        condition.lock()
        guard accepting, !tornDown else {
            condition.unlock()
            return
        }
        inFlight += 1
        condition.unlock()
        let stamp = timestampNs == 0 ? Int64(clock_gettime_nsec_np(CLOCK_UPTIME_RAW)) : timestampNs
        deliver(buffer, timestampNs: stamp, rotation: rotation)
        finishInFlight()
    }

    func stop() {
        condition.lock()
        if tornDown {
            condition.unlock()
            return
        }
        accepting = false
        generation += 1
        let deadline = Date().addingTimeInterval(2)
        while inFlight > 0 {
            if !condition.wait(until: deadline) {
                break
            }
        }
        tornDown = true
        condition.unlock()
    }

    private func complete(
        buffer: CVPixelBuffer,
        generation frameGeneration: Int,
        timestampNs: Int64,
        rotation: RTCVideoRotation
    ) {
        condition.lock()
        let current = !tornDown && accepting && generation == frameGeneration
        condition.unlock()
        if current {
            deliver(buffer, timestampNs: timestampNs, rotation: rotation)
        }
        finishInFlight()
    }

    private func deliver(_ buffer: CVPixelBuffer, timestampNs: Int64, rotation: RTCVideoRotation) {
        let pixel = RTCCVPixelBuffer(pixelBuffer: buffer)
        let frame = RTCVideoFrame(buffer: pixel, rotation: rotation, timeStampNs: timestampNs)
        videoSource.capturer(capturer, didCapture: frame)
    }

    private func finishInFlight() {
        condition.lock()
        if inFlight > 0 {
            inFlight -= 1
        }
        if inFlight <= 0 {
            condition.broadcast()
        }
        condition.unlock()
    }
}

public struct CustomVideoFence {
    public let event: MTLSharedEvent
    public let value: UInt64

    public init(event: MTLSharedEvent, value: UInt64) {
        self.event = event
        self.value = value
    }
}
