import Foundation

enum FulfillResult {
    case fulfilled
    case cancelled
    case timedOut
}

/// One-time requests with a timeout. Used to park a CallKit answer action until
/// the app reports that media is connected (or the deadline passes).
final class FulfillRequestManager: @unchecked Sendable {
    static let shared = FulfillRequestManager()

    private let queue = DispatchQueue(label: "io.fishjam.voip.fulfill-requests")
    private var requests: [String: (FulfillResult) -> Void] = [:]

    private init() {}

    /// Creates a request that calls `completion` once: on fulfill, cancel, or timeout.
    @discardableResult
    func createRequest(timeout: TimeInterval, completion: @escaping (FulfillResult) -> Void) -> String {
        let requestId = UUID().uuidString
        queue.sync {
            requests[requestId] = completion
        }
        let delay = max(0, timeout)
        queue.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self else { return }
            guard let pending = self.requests.removeValue(forKey: requestId) else { return }
            DispatchQueue.main.async {
                pending(.timedOut)
            }
        }
        return requestId
    }

    @discardableResult
    func fulfill(_ requestId: String) -> Bool {
        resolve(requestId, result: .fulfilled)
    }

    @discardableResult
    func cancel(_ requestId: String) -> Bool {
        resolve(requestId, result: .cancelled)
    }

    func cancelAll() {
        let completions: [(FulfillResult) -> Void] = queue.sync {
            let values = Array(requests.values)
            requests.removeAll()
            return values
        }
        for completion in completions {
            DispatchQueue.main.async {
                completion(.cancelled)
            }
        }
    }

    private func resolve(_ requestId: String, result: FulfillResult) -> Bool {
        let completion: ((FulfillResult) -> Void)? = queue.sync {
            requests.removeValue(forKey: requestId)
        }
        guard let completion else { return false }
        DispatchQueue.main.async {
            completion(result)
        }
        return true
    }
}
