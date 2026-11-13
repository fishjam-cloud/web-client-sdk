@testable import FishjamClient
import Foundation
import WebRTC
import XCTest

final class LivestreamUrlTests: XCTestCase {
    func testABareFishjamIdUsesTheDefaultDomain() throws {
        XCTAssertEqual(
            try livestreamWhepBaseUrl("abc123"),
            "https://fishjam.io/api/v1/live/api/whep"
        )
    }

    func testAFishjamIdThatIsAUrlUsesItsOrigin() throws {
        XCTAssertEqual(
            try livestreamWhepBaseUrl("https://cloud.fishjam.work/api/v1/connect/abc123"),
            "https://cloud.fishjam.work/api/v1/live/api/whep"
        )
        XCTAssertEqual(
            try livestreamWhepBaseUrl("http://localhost:5002/api/v1/connect/abc123"),
            "http://localhost:5002/api/v1/live/api/whep"
        )
    }

    func testABlankFishjamIdIsRejected() {
        XCTAssertThrowsError(try livestreamWhepBaseUrl("  "))
    }

    func testAStreamIdIsAppendedToTheBaseUrl() {
        XCTAssertEqual(
            whepUrl(.streamId("stream-1"), baseUrl: "https://fishjam.io/api/v1/live/api/whep", override: nil),
            "https://fishjam.io/api/v1/live/api/whep/stream-1"
        )
    }

    func testATokenUsesTheBaseUrlAlone() {
        XCTAssertEqual(
            whepUrl(.token("secret"), baseUrl: "https://fishjam.io/api/v1/live/api/whep", override: nil),
            "https://fishjam.io/api/v1/live/api/whep"
        )
    }

    func testAnExplicitUrlWins() {
        XCTAssertEqual(
            whepUrl(.streamId("stream-1"), baseUrl: "https://fishjam.io/x", override: "https://example.com/whep"),
            "https://example.com/whep"
        )
    }

    func testHttpStatusesMapToLivestreamErrors() {
        XCTAssertEqual(livestreamError(forStatus: 401), .unauthorized)
        XCTAssertEqual(livestreamError(forStatus: 404), .streamNotFound)
        XCTAssertEqual(livestreamError(forStatus: 500), .unknownError)
        XCTAssertEqual(livestreamError(forStatus: 409), .unknownError)
    }

    func testOnlyAConnectedPeerConnectionIsConnected() {
        XCTAssertTrue(isLivestreamConnected(.connected))
        XCTAssertFalse(isLivestreamConnected(.connecting))
        XCTAssertFalse(isLivestreamConnected(.disconnected))
        XCTAssertFalse(isLivestreamConnected(.failed))
    }
}

final class SignalTests: XCTestCase {
    func testWaitReturnsTrueWhenFiredBefore() async throws {
        let signal = Signal()
        signal.fire()

        let fired = try await signal.wait(timeout: 5)

        XCTAssertTrue(fired)
    }

    func testWaitReturnsTrueWhenFiredWhileWaiting() async throws {
        let signal = Signal()
        DispatchQueue.global().asyncAfter(deadline: .now() + 0.05) { signal.fire() }

        let fired = try await signal.wait(timeout: 5)

        XCTAssertTrue(fired)
    }

    func testWaitReturnsFalseOnTimeout() async throws {
        let fired = try await Signal().wait(timeout: 0.05)

        XCTAssertFalse(fired)
    }

    func testWaitThrowsTheFailureItWasFiredWith() async {
        let signal = Signal()
        signal.fire(.failure(LivestreamError.unauthorized))

        do {
            _ = try await signal.wait(timeout: 5)
            XCTFail("should throw")
        } catch {
            XCTAssertEqual(error as? LivestreamError, .unauthorized)
        }
    }

    func testOnlyTheFirstFireCounts() async throws {
        let signal = Signal()
        signal.fire()
        signal.fire(.failure(LivestreamError.unknownError))

        let fired = try await signal.wait(timeout: 5)

        XCTAssertTrue(fired)
    }
}

final class WhepSignalingTests: XCTestCase {
    private let endpoint = "https://fishjam.test/api/v1/live/api/whep/stream-1"
    private var signaling: WhepSignaling!

    override func setUp() {
        super.setUp()
        StubURLProtocol.reset()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        signaling = WhepSignaling(session: URLSession(configuration: configuration))
    }

    func testPostOfferSendsTheOfferAndReturnsTheAnswerAndResource() async throws {
        StubURLProtocol.respond = { _ in
            .init(status: 201, body: "v=0 answer", headers: ["Location": "/api/v1/live/api/whep/resource-1"])
        }

        let answer = try await signaling.postOffer(url: endpoint, token: nil, offerSdp: "v=0 offer")

        XCTAssertEqual(answer.sdp, "v=0 answer")
        XCTAssertEqual(answer.resource?.absoluteString, "https://fishjam.test/api/v1/live/api/whep/resource-1")
        let request = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(request.method, "POST")
        XCTAssertEqual(request.url, endpoint)
        XCTAssertEqual(request.contentType, "application/sdp")
        XCTAssertEqual(request.body, "v=0 offer")
        XCTAssertNil(request.authorization)
    }

    func testPostOfferSendsTheTokenAsABearer() async throws {
        StubURLProtocol.respond = { _ in .init(status: 201, body: "answer") }

        _ = try await signaling.postOffer(url: endpoint, token: "secret", offerSdp: "offer")

        XCTAssertEqual(StubURLProtocol.requests.first?.authorization, "Bearer secret")
    }

    func testAMissingLocationHeaderMeansNoResource() async throws {
        StubURLProtocol.respond = { _ in .init(status: 201, body: "answer") }

        let answer = try await signaling.postOffer(url: endpoint, token: nil, offerSdp: "offer")

        XCTAssertNil(answer.resource)
    }

    func testPostOfferMapsHttpStatusesToErrors() async {
        let expected: [(Int, LivestreamError)] = [
            (401, .unauthorized),
            (404, .streamNotFound),
            (500, .unknownError)
        ]
        for (status, expectedError) in expected {
            StubURLProtocol.respond = { _ in .init(status: status) }
            do {
                _ = try await signaling.postOffer(url: endpoint, token: nil, offerSdp: "offer")
                XCTFail("status \(status) should throw")
            } catch {
                XCTAssertEqual(error as? LivestreamError, expectedError)
            }
        }
    }

    func testAnUnreachableServerIsAnUnknownError() async {
        StubURLProtocol.respond = { _ in nil }

        do {
            _ = try await signaling.postOffer(url: endpoint, token: nil, offerSdp: "offer")
            XCTFail("should throw")
        } catch {
            XCTAssertEqual(error as? LivestreamError, .unknownError)
        }
    }

    func testAnInvalidUrlIsAnUnknownError() async {
        do {
            _ = try await signaling.postOffer(url: "", token: nil, offerSdp: "offer")
            XCTFail("should throw")
        } catch {
            XCTAssertEqual(error as? LivestreamError, .unknownError)
        }
    }

    func testDeleteSendsTheTokenToTheResource() async throws {
        StubURLProtocol.respond = { _ in .init(status: 200) }
        let resource = try XCTUnwrap(URL(string: "https://fishjam.test/api/v1/live/api/whep/resource-1"))

        await signaling.delete(resource: resource, token: "secret")

        let request = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(request.method, "DELETE")
        XCTAssertEqual(request.url, resource.absoluteString)
        XCTAssertEqual(request.authorization, "Bearer secret")
    }

    func testDeleteNeverThrows() async throws {
        let resource = try XCTUnwrap(URL(string: "https://fishjam.test/resource"))
        StubURLProtocol.respond = { _ in .init(status: 500) }
        await signaling.delete(resource: resource, token: nil)
        StubURLProtocol.respond = { _ in nil }
        await signaling.delete(resource: resource, token: nil)
    }
}

/// Answers every request of a `URLSession` that lists it in `protocolClasses`. `respond` returning `nil` fails the
/// request with a network error.
private final class StubURLProtocol: URLProtocol {
    struct Response {
        var status: Int
        var body = ""
        var headers: [String: String] = [:]
    }

    struct Recorded {
        let method: String
        let url: String
        let contentType: String?
        let authorization: String?
        let body: String
    }

    private static let lock = NSLock()
    private static var storedRequests: [Recorded] = []
    private static var storedRespond: (URLRequest) -> Response? = { _ in nil }

    static var requests: [Recorded] {
        lock.lock()
        defer { lock.unlock() }
        return storedRequests
    }

    static var respond: (URLRequest) -> Response? {
        get {
            lock.lock()
            defer { lock.unlock() }
            return storedRespond
        }
        set {
            lock.lock()
            defer { lock.unlock() }
            storedRespond = newValue
        }
    }

    static func reset() {
        lock.lock()
        defer { lock.unlock() }
        storedRequests = []
        storedRespond = { _ in nil }
    }

    override static func canInit(with request: URLRequest) -> Bool { true }

    override static func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lock.lock()
        Self.storedRequests.append(
            Recorded(
                method: request.httpMethod ?? "",
                url: request.url?.absoluteString ?? "",
                contentType: request.value(forHTTPHeaderField: "Content-Type"),
                authorization: request.value(forHTTPHeaderField: "Authorization"),
                body: readBody()
            )
        )
        Self.lock.unlock()
        guard let response = Self.respond(request), let url = request.url,
              let http = HTTPURLResponse(
                url: url,
                statusCode: response.status,
                httpVersion: "HTTP/1.1",
                headerFields: response.headers
              )
        else {
            client?.urlProtocol(self, didFailWithError: URLError(.cannotConnectToHost))
            return
        }
        client?.urlProtocol(self, didReceive: http, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(response.body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    private func readBody() -> String {
        if let body = request.httpBody {
            return String(bytes: body, encoding: .utf8) ?? ""
        }
        guard let stream = request.httpBodyStream else { return "" }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
        return String(bytes: data, encoding: .utf8) ?? ""
    }
}
