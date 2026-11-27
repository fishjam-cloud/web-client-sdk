import CoreGraphics
import CoreVideo
import FishjamClient
import Foundation

/// Draws a clock into the SDK buffer pool at about 15 fps and pushes each frame.
final class ClockSource {
    private let pool: CustomVideoBufferPool
    private let track: PooledVideoTrack
    private var timer: Timer?
    private var slot = 0

    init(pool: CustomVideoBufferPool, track: PooledVideoTrack) {
        self.pool = pool
        self.track = track
    }

    func start() {
        let timer = Timer(timeInterval: 1.0 / 15.0, repeats: true) { [weak self] _ in
            self?.draw()
        }
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        track.stop()
        try? pool.dispose()
    }

    private func draw() {
        guard !pool.buffers.isEmpty else { return }
        let buffer = pool.buffers[slot]
        slot = (slot + 1) % pool.buffers.count
        let pixel = buffer.buffer
        CVPixelBufferLockBaseAddress(pixel, [])
        defer { CVPixelBufferUnlockBaseAddress(pixel, []) }
        guard let base = CVPixelBufferGetBaseAddress(pixel) else { return }
        let width = CVPixelBufferGetWidth(pixel)
        let height = CVPixelBufferGetHeight(pixel)
        let rowBytes = CVPixelBufferGetBytesPerRow(pixel)
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmap = CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
        guard let context = CGContext(
            data: base,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: rowBytes,
            space: colorSpace,
            bitmapInfo: bitmap
        ) else { return }
        drawClock(context, width: width, height: height)
        track.pushFrame(bufferIndex: buffer.index, timestampNs: Int64(clock_gettime_nsec_np(CLOCK_UPTIME_RAW)))
    }

    private func drawClock(_ context: CGContext, width: Int, height: Int) {
        context.setFillColor(CGColor(gray: 0.1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        let centerX = CGFloat(width) / 2
        let centerY = CGFloat(height) / 2
        let radius = min(centerX, centerY) * 0.8
        context.setStrokeColor(CGColor(gray: 1, alpha: 1))
        context.setLineWidth(4)
        let originX = centerX - radius
        let originY = centerY - radius
        context.strokeEllipse(in: CGRect(x: originX, y: originY, width: radius * 2, height: radius * 2))
        let now = Date()
        let seconds = Calendar.current.component(.second, from: now)
        let nanos = Calendar.current.component(.nanosecond, from: now)
        let secondFraction = (Double(seconds) + Double(nanos) / 1_000_000_000) / 60
        let minutes = Calendar.current.component(.minute, from: now)
        let minuteFraction = (Double(minutes) + secondFraction) / 60
        context.setLineCap(.round)
        context.setLineWidth(8)
        drawHand(context, centerX: centerX, centerY: centerY, length: radius * 0.65, fraction: minuteFraction)
        context.setLineWidth(4)
        drawHand(context, centerX: centerX, centerY: centerY, length: radius * 0.9, fraction: secondFraction)
        context.setFillColor(CGColor(gray: 1, alpha: 1))
        context.fillEllipse(in: CGRect(x: centerX - 6, y: centerY - 6, width: 12, height: 12))
    }

    private func drawHand(
        _ context: CGContext,
        centerX: CGFloat,
        centerY: CGFloat,
        length: CGFloat,
        fraction: Double
    ) {
        let angle = CGFloat.pi / 2 - CGFloat(fraction) * 2 * .pi
        context.move(to: CGPoint(x: centerX, y: centerY))
        context.addLine(to: CGPoint(x: centerX + cos(angle) * length, y: centerY + sin(angle) * length))
        context.strokePath()
    }
}
