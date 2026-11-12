import XCTest
@testable import FishjamClient

final class SandboxApiTests: XCTestCase {
    func testEmptyURLFailsBeforeARequest() {
        XCTAssertThrowsError(
            try sandboxPeerTokenURL(sandboxApiUrl: "  ", roomName: "room", peerName: "peer")
        ) { error in
            XCTAssertTrue(sandboxMessage(error).contains("sandboxApiUrl"))
        }
    }

    func testPeerTokenBuildsTheQuery() throws {
        let url = try sandboxPeerTokenURL(
            sandboxApiUrl: "https://sandbox.test/api",
            roomName: "my-room",
            peerName: "alice",
            roomType: .audioOnly
        )
        let items = queryItems(url)
        XCTAssertEqual(query(items, "roomName"), "my-room")
        XCTAssertEqual(query(items, "peerName"), "alice")
        XCTAssertEqual(query(items, "roomType"), "audio_only")
    }

    func testPeerTokenDefaultsRoomTypeToConference() throws {
        let url = try sandboxPeerTokenURL(sandboxApiUrl: "https://sandbox.test/api", roomName: "room", peerName: "bob")
        XCTAssertEqual(query(queryItems(url), "roomType"), "conference")
    }

    func testPeerTokenPassesTheVideoCodec() throws {
        let url = try sandboxPeerTokenURL(
            sandboxApiUrl: "https://sandbox.test/api",
            roomName: "room",
            peerName: "bob",
            videoCodec: .h264
        )
        XCTAssertEqual(query(queryItems(url), "videoCodec"), "h264")
    }

    func testPeerTokenOmitsTheVideoCodecByDefault() throws {
        let url = try sandboxPeerTokenURL(sandboxApiUrl: "https://sandbox.test/api", roomName: "room", peerName: "bob")
        XCTAssertNil(query(queryItems(url), "videoCodec"))
    }

    func testPeerTokenKeepsAnExistingQueryParameter() throws {
        let url = try sandboxPeerTokenURL(
            sandboxApiUrl: "https://sandbox.test/api?foo=1",
            roomName: "room",
            peerName: "bob"
        )
        XCTAssertEqual(query(queryItems(url), "foo"), "1")
        XCTAssertEqual(query(queryItems(url), "roomName"), "room")
    }

    func testPeerTokenReturnsTheToken() throws {
        let token = try sandboxPeerToken(
            status: 200,
            body: json(["peerToken": "pt-1"]),
            roomName: "room",
            peerName: "bob",
            roomType: .conference
        )
        XCTAssertEqual(token, "pt-1")
    }

    func testPeerTokenExplainsAConflictingRoom() {
        XCTAssertThrowsError(try peerToken(status: 409, body: Data())) { error in
            XCTAssertTrue(sandboxMessage(error).contains("already exists with a different"))
        }
    }

    func testPeerTokenExplainsAnotherFailure() {
        XCTAssertThrowsError(try peerToken(status: 500, body: Data())) { error in
            XCTAssertTrue(sandboxMessage(error).contains("Failed to retrieve peer token"))
        }
    }

    func testPeerTokenRejectsABodyWithNoToken() {
        XCTAssertThrowsError(try peerToken(status: 200, body: json([:]))) { error in
            XCTAssertTrue(sandboxMessage(error).contains("no peer token"))
        }
    }

    func testLivestreamPassesVisibilityAndCodec() throws {
        let url = try sandboxLivestreamURL(
            sandboxApiUrl: "https://sandbox.test/api",
            roomName: "room",
            isPublic: true,
            videoCodec: .h264
        )
        let items = queryItems(url)
        XCTAssertTrue(url.path.hasSuffix("/livestream"))
        XCTAssertEqual(query(items, "public"), "true")
        XCTAssertEqual(query(items, "roomName"), "room")
        XCTAssertEqual(query(items, "videoCodec"), "h264")
    }

    func testLivestreamOmitsTheVideoCodecByDefault() throws {
        let url = try sandboxLivestreamURL(sandboxApiUrl: "https://sandbox.test/api", roomName: "room")
        let items = queryItems(url)
        XCTAssertEqual(query(items, "public"), "false")
        XCTAssertNil(query(items, "videoCodec"))
    }

    func testLivestreamReturnsTheStreamerToken() throws {
        let result = try sandboxLivestream(status: 200, body: livestreamBody(), roomName: "room")
        XCTAssertEqual(result.streamerToken, "st")
        XCTAssertEqual(result.roomId, "r")
        XCTAssertEqual(result.roomName, "n")
    }

    func testLivestreamExplainsAConflictingRoom() {
        XCTAssertThrowsError(try sandboxLivestream(status: 409, body: Data(), roomName: "room")) { error in
            XCTAssertTrue(sandboxMessage(error).contains("already exists with a different"))
        }
    }

    func testLivestreamRejectsABodyWithNoToken() {
        XCTAssertThrowsError(try sandboxLivestream(status: 200, body: json([:]), roomName: "room")) { error in
            XCTAssertTrue(sandboxMessage(error).contains("no streamer token"))
        }
    }

    func testViewerTokenBuildsThePath() throws {
        let url = try sandboxViewerTokenURL(sandboxApiUrl: "https://sandbox.test/api?foo=1", roomName: "a b/c")
        XCTAssertTrue(url.absoluteString.contains("/a%20b%2Fc/livestream-viewer-token"))
        XCTAssertEqual(query(queryItems(url), "foo"), "1")
    }

    func testViewerTokenGivesAFriendlyErrorWhenTheRoomIsMissing() {
        XCTAssertThrowsError(try sandboxViewerToken(status: 404, body: Data(), roomName: "ghost")) { error in
            XCTAssertTrue(sandboxMessage(error).contains("does not exist"))
        }
    }

    func testViewerTokenReturnsTheToken() throws {
        let token = try sandboxViewerToken(status: 200, body: json(["token": "vt"]), roomName: "room")
        XCTAssertEqual(token, "vt")
    }

    func testViewerTokenExplainsAnotherFailure() {
        XCTAssertThrowsError(try sandboxViewerToken(status: 500, body: Data(), roomName: "room")) { error in
            XCTAssertTrue(sandboxMessage(error).contains("Failed to retrieve viewer token"))
        }
    }

    private func peerToken(status: Int, body: Data) throws -> String {
        try sandboxPeerToken(status: status, body: body, roomName: "room", peerName: "bob", roomType: .conference)
    }

    private func livestreamBody() -> Data {
        json([
            "streamerToken": "st",
            "room": ["id": "r", "name": "n"]
        ])
    }

    private func json(_ value: [String: Any]) -> Data {
        guard let data = try? JSONSerialization.data(withJSONObject: value) else {
            XCTFail("Could not encode JSON")
            return Data()
        }
        return data
    }

    private func queryItems(_ url: URL) -> [URLQueryItem] {
        URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
    }

    private func query(_ items: [URLQueryItem], _ name: String) -> String? {
        items.first { $0.name == name }?.value
    }
}

private func sandboxMessage(_ error: Error) -> String {
    (error as? LocalizedError)?.errorDescription ?? ""
}
