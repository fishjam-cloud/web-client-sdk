import Foundation
import WebRTC

extension MediaSession {
    func startScreenShare(
        generation: Int,
        appGroupId: String,
        isCurrent: @escaping () -> Bool,
        onReady: @escaping (VideoTrack) -> Void
    ) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            queue.async {
                guard !self.stopped, generation == self.readGeneration(), isCurrent() else {
                    continuation.resume()
                    return
                }
                do {
                    try self.startScreenShareOnQueue(
                        appGroupId: appGroupId,
                        generation: generation,
                        isCurrent: isCurrent,
                        onReady: onReady
                    )
                    continuation.resume()
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    func stopScreenShare(generation: Int) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            queue.async {
                if !self.stopped, generation == self.readGeneration() {
                    self.stopScreenShareOnQueue()
                }
                continuation.resume()
            }
        }
    }

    func startScreenShareOnQueue(
        appGroupId: String,
        generation: Int,
        isCurrent: @escaping () -> Bool,
        onReady: @escaping (VideoTrack) -> Void
    ) throws {
        let readyHandler: () -> Void = { [weak self] in
            self?.queue.async {
                guard let self, !self.stopped, generation == self.readGeneration(), isCurrent() else { return }
                guard let track = self.localScreen else { return }
                onReady(track)
            }
        }
        if let existing = screenCapturer, localScreen != nil {
            existing.whenReady(readyHandler)
            return
        }
        let source = ensureFactory().videoSource(forScreenCast: true)
        let capturer = ScreenCapturer(appGroupId: appGroupId)
        capturer.videoSource = source
        capturer.whenReady(readyHandler)
        capturer.onEnded = { [weak self] in
            self?.queue.async {
                guard let self, !self.stopped else { return }
                self.stopScreenShareOnQueue()
                self.onScreenCaptureEnded?()
            }
        }
        let track = ensureFactory().videoTrack(with: source, trackId: UUID().uuidString)
        track.isEnabled = true
        try capturer.start()
        screenCapturer = capturer
        localScreen = track
    }

    func stopScreenShareOnQueue() {
        screenCapturer?.stop()
        screenCapturer = nil
        if let track = localScreen {
            stopSender(track)
            track.isEnabled = false
            removeLocalTrack(track)
        }
        localScreen = nil
    }
}
