import AVFoundation
import CoreVideo
import FishjamClient
import QuartzCore

/// Plays a bundled video, muted and looping, and forwards each decoded frame.
final class VideoFileSource: NSObject {
    private let track: ForwardVideoTrack
    private let player = AVPlayer()
    private var output: AVPlayerItemVideoOutput?
    private var displayLink: CADisplayLink?
    private var endObserver: NSObjectProtocol?

    init(track: ForwardVideoTrack) {
        self.track = track
    }

    func start(url: URL) {
        let item = AVPlayerItem(url: url)
        let output = AVPlayerItemVideoOutput(pixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferIOSurfacePropertiesKey as String: [:] as [String: Any]
        ])
        item.add(output)
        self.output = output
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            self?.player.seek(to: .zero)
            self?.player.play()
        }
        player.replaceCurrentItem(with: item)
        player.isMuted = true
        let link = CADisplayLink(target: self, selector: #selector(tick))
        link.add(to: .main, forMode: .common)
        displayLink = link
        player.play()
    }

    func stop() {
        displayLink?.invalidate()
        displayLink = nil
        player.pause()
        if let endObserver {
            NotificationCenter.default.removeObserver(endObserver)
        }
        endObserver = nil
        track.stop()
    }

    @objc private func tick() {
        guard let output else { return }
        let time = output.itemTime(forHostTime: CACurrentMediaTime())
        guard output.hasNewPixelBuffer(forItemTime: time),
              let buffer = output.copyPixelBuffer(forItemTime: time, itemTimeForDisplay: nil) else { return }
        track.forwardFrame(buffer: buffer)
    }
}
