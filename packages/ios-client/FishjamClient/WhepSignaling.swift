import Foundation
import WebRTC

private let defaultLivestreamDomain = "https://fishjam.io"
private let whepPath = "/api/v1/live/api/whep"

enum LivestreamUrlError: Error {
    case blankFishjamId
}

/// The WHEP endpoint of `fishjamId`: the origin of the id when it is a URL, `https://fishjam.io` otherwise.
func livestreamWhepBaseUrl(_ fishjamId: String) throws -> String {
    let trimmed = fishjamId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { throw LivestreamUrlError.blankFishjamId }
    var origin = defaultLivestreamDomain
    if let components = URLComponents(string: trimmed), let scheme = components.scheme, let host = components.host {
        let port = components.port.map { ":\($0)" } ?? ""
        origin = "\(scheme)://\(host)\(port)"
    }
    return origin + whepPath
}

func whepUrl(_ config: ConnectViewerConfig, baseUrl: String, override: String?) -> String {
    if let override { return override }
    switch config {
    case .streamId(let streamId):
        return "\(baseUrl)/\(streamId)"
    case .token:
        return baseUrl
    }
}

func livestreamError(forStatus status: Int) -> LivestreamError {
    switch status {
    case 401: return .unauthorized
    case 404: return .streamNotFound
    default: return .unknownError
    }
}

func isLivestreamConnected(_ state: RTCPeerConnectionState) -> Bool {
    state == .connected
}

struct WhepAnswer: Equatable {
    let sdp: String
    let resource: URL?
}

/// The HTTP half of WHEP.
final class WhepSignaling {
    private let session: URLSession
    private let timeout: TimeInterval

    init(session: URLSession = .shared, timeout: TimeInterval = 10) {
        self.session = session
        self.timeout = timeout
    }

    /// Sends `offerSdp` to the endpoint `url`. `resource` is the `Location` header resolved against `url`, or `nil`
    /// when the response has none. Throws `LivestreamError` for any failure.
    func postOffer(url: String, token: String?, offerSdp: String) async throws -> WhepAnswer {
        guard let endpoint = URL(string: url) else { throw LivestreamError.unknownError }
        var request = URLRequest(url: endpoint, timeoutInterval: timeout)
        request.httpMethod = "POST"
        request.setValue("application/sdp", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        request.httpBody = Data(offerSdp.utf8)
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw LivestreamError.unknownError
        }
        guard let http = response as? HTTPURLResponse, let answer = String(data: data, encoding: .utf8) else {
            throw LivestreamError.unknownError
        }
        guard (200..<300).contains(http.statusCode) else {
            throw livestreamError(forStatus: http.statusCode)
        }
        let resource = http.value(forHTTPHeaderField: "Location")
            .flatMap { URL(string: $0, relativeTo: endpoint)?.absoluteURL }
        return WhepAnswer(sdp: answer, resource: resource)
    }

    /// Ends the session at `resource`. A failure is ignored: the peer connection is closed either way.
    func delete(resource: URL, token: String?) async {
        var request = URLRequest(url: resource, timeoutInterval: timeout)
        request.httpMethod = "DELETE"
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        _ = try? await session.data(for: request)
    }
}

/// An event that happens once. `wait` returns `true` when it fired, `false` when the timeout came first, and throws
/// when it was fired with a failure.
final class Signal: @unchecked Sendable {
    private let lock = NSLock()
    private var outcome: Result<Void, Error>?
    private var waiters: [UUID: CheckedContinuation<Bool, Error>] = [:]

    func fire(_ result: Result<Void, Error> = .success(())) {
        lock.lock()
        guard outcome == nil else {
            lock.unlock()
            return
        }
        outcome = result
        let pending = waiters
        waiters = [:]
        lock.unlock()
        for continuation in pending.values {
            continuation.resume(with: result.map { true })
        }
    }

    func wait(timeout: TimeInterval) async throws -> Bool {
        try await withCheckedThrowingContinuation { continuation in
            lock.lock()
            if let outcome {
                lock.unlock()
                continuation.resume(with: outcome.map { true })
                return
            }
            let id = UUID()
            waiters[id] = continuation
            lock.unlock()
            DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { [weak self] in
                guard let self else { return }
                self.lock.lock()
                let pending = self.waiters.removeValue(forKey: id)
                self.lock.unlock()
                pending?.resume(returning: false)
            }
        }
    }
}
