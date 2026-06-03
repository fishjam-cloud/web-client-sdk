//
//  WhipClient.swift
//  Livestream Broadcast Extension
//
//  Minimal WHIP (WebRTC-HTTP Ingestion Protocol) client over URLSession,
//  mirroring the semantics of @binbat/whip-whep used by the JS livestream client:
//    publish: POST <url> (Content-Type: application/sdp, Bearer token) with the SDP offer
//             -> 201 Created, "Location" header = resource URL, body = SDP answer
//    stop:    DELETE <resourceURL> (Bearer token)
//

import Foundation

enum WhipError: Error {
    case requestFailed(status: Int, body: String)
    case missingLocationHeader
    case invalidResponse
}

final class WhipClient {

    private let endpoint: URL
    private let token: String
    private let session: URLSession

    /// Absolute resource URL returned in the `Location` header of a successful publish.
    /// Used to tear the stream down with DELETE.
    private(set) var resourceURL: URL?

    init(url: URL, token: String, session: URLSession = .shared) {
        self.endpoint = url
        self.token = token
        self.session = session
    }

    /// POSTs the SDP offer and returns the SDP answer. Stores the resource URL for `stop()`.
    func publish(sdpOffer: String, completion: @escaping (Result<String, Error>) -> Void) {
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/sdp", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = sdpOffer.data(using: .utf8)

        LSLog("WHIP POST -> \(endpoint.absoluteString)")
        let task = session.dataTask(with: request) { [weak self] data, response, error in
            if let error = error {
                LSLog("WHIP POST transport error: \(error.localizedDescription)")
                completion(.failure(error))
                return
            }
            guard let http = response as? HTTPURLResponse else {
                LSLog("WHIP POST: non-HTTP response")
                completion(.failure(WhipError.invalidResponse))
                return
            }
            let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
            LSLog("WHIP POST status=\(http.statusCode), bodyLength=\(body.count)")
            guard (200...299).contains(http.statusCode) else {
                LSLog("WHIP POST rejected (\(http.statusCode)): \(body.prefix(300))")
                completion(.failure(WhipError.requestFailed(status: http.statusCode, body: body)))
                return
            }
            guard let location = http.value(forHTTPHeaderField: "Location") else {
                LSLog("WHIP POST: missing Location header")
                completion(.failure(WhipError.missingLocationHeader))
                return
            }
            // Location may be relative; resolve against the publish endpoint.
            self?.resourceURL = URL(string: location, relativeTo: self?.endpoint)?.absoluteURL
            LSLog("WHIP resource: \(self?.resourceURL?.absoluteString ?? location)")
            completion(.success(body))
        }
        task.resume()
    }

    /// DELETEs the WHIP resource to stop ingestion. Best-effort; errors are reported but non-fatal.
    func stop(completion: ((Error?) -> Void)? = nil) {
        guard let resourceURL = resourceURL else {
            completion?(nil)
            return
        }
        var request = URLRequest(url: resourceURL)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let task = session.dataTask(with: request) { _, _, error in
            completion?(error)
        }
        task.resume()
    }
}
