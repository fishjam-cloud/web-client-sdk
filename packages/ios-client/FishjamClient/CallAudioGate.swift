import Foundation

/// Remembers whether CallKit has activated call audio, and lets callers wait for it.
final class CallAudioGate: @unchecked Sendable {
    private struct Waiter {
        let id: UUID
        let continuation: CheckedContinuation<Bool, Never>
    }

    private let lock = NSLock()
    private var active = false
    private var waiters: [Waiter] = []

    var isActive: Bool {
        lock.lock()
        defer { lock.unlock() }
        return active
    }

    /// Waits until call audio is active. Returns false on timeout.
    func waitUntilActive(timeout: TimeInterval) async -> Bool {
        let id = UUID()
        return await withCheckedContinuation { continuation in
            enqueue(id: id, continuation: continuation, timeout: timeout)
        }
    }

    func setActive(_ value: Bool) {
        lock.lock()
        active = value
        let pending = waiters
        waiters.removeAll()
        lock.unlock()
        for waiter in pending {
            waiter.continuation.resume(returning: value)
        }
    }

    private func enqueue(id: UUID, continuation: CheckedContinuation<Bool, Never>, timeout: TimeInterval) {
        lock.lock()
        if active {
            lock.unlock()
            continuation.resume(returning: true)
            return
        }
        waiters.append(Waiter(id: id, continuation: continuation))
        lock.unlock()
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { [weak self] in
            self?.resumeWaiter(id: id, ready: false)
        }
    }

    private func resumeWaiter(id: UUID, ready: Bool) {
        lock.lock()
        guard let index = waiters.firstIndex(where: { $0.id == id }) else {
            lock.unlock()
            return
        }
        let waiter = waiters.remove(at: index)
        lock.unlock()
        waiter.continuation.resume(returning: ready)
    }
}
