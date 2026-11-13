import Foundation

/// Room type sent to the Sandbox API.
public enum SandboxRoomType: String, Sendable {
    case conference
    case livestream
    case audioOnly = "audio_only"
}

/// Video codec sent to the Sandbox API. Leave it unset and the server chooses.
public enum SandboxVideoCodec: String, Sendable {
    case vp8
    case h264
}

/// Streamer token and room returned for a Sandbox livestream.
public struct SandboxLivestream: Equatable, Sendable {
    public let streamerToken: String
    public let roomId: String
    public let roomName: String

    public init(streamerToken: String, roomId: String, roomName: String) {
        self.streamerToken = streamerToken
        self.roomId = roomId
        self.roomName = roomName
    }
}

/// A Sandbox API request failed. `errorDescription` is the message to show.
public struct SandboxError: Error, LocalizedError, Equatable, Sendable {
    /// The message to show.
    public let message: String

    public var errorDescription: String? { message }

    init(message: String) {
        self.message = message
    }
}

/// Not for production. The Sandbox API is an unauthenticated test backend:
/// anyone who knows its URL can create rooms and peers. In production, your
/// own backend creates the peer and gives the app its token.
///
/// Get a URL at https://fishjam.io/app/sandbox.
public struct SandboxApi: Sendable {
    /// Sandbox API URL from the Fishjam dashboard.
    public let sandboxApiUrl: String

    public init(sandboxApiUrl: String) {
        self.sandboxApiUrl = sandboxApiUrl
    }

    /// Creates or reuses a room and returns a peer token for [peerName].
    public func getSandboxPeerToken(
        roomName: String,
        peerName: String,
        roomType: SandboxRoomType = .conference,
        videoCodec: SandboxVideoCodec? = nil
    ) async throws -> String {
        let url = try sandboxPeerTokenURL(
            sandboxApiUrl: sandboxApiUrl,
            roomName: roomName,
            peerName: peerName,
            roomType: roomType,
            videoCodec: videoCodec
        )
        let response = try await sandboxGet(url)
        return try sandboxPeerToken(
            status: response.status,
            body: response.body,
            roomName: roomName,
            peerName: peerName,
            roomType: roomType
        )
    }

    /// Creates or reuses a livestream room and returns its streamer token.
    /// `isPublic` is sent as the `public` query parameter.
    public func getSandboxLivestream(
        roomName: String,
        isPublic: Bool = false,
        videoCodec: SandboxVideoCodec? = nil
    ) async throws -> SandboxLivestream {
        let url = try sandboxLivestreamURL(
            sandboxApiUrl: sandboxApiUrl,
            roomName: roomName,
            isPublic: isPublic,
            videoCodec: videoCodec
        )
        let response = try await sandboxGet(url)
        return try sandboxLivestream(status: response.status, body: response.body, roomName: roomName)
    }

    /// Returns a viewer token for an existing livestream room.
    public func getSandboxViewerToken(roomName: String) async throws -> String {
        let url = try sandboxViewerTokenURL(sandboxApiUrl: sandboxApiUrl, roomName: roomName)
        let response = try await sandboxGet(url)
        return try sandboxViewerToken(status: response.status, body: response.body, roomName: roomName)
    }
}

let sandboxMissingURLMessage =
    "useSandbox requires a sandboxApiUrl, you can get it at: https://fishjam.io/app/sandbox"

func sandboxPeerTokenURL(
    sandboxApiUrl: String,
    roomName: String,
    peerName: String,
    roomType: SandboxRoomType = .conference,
    videoCodec: SandboxVideoCodec? = nil
) throws -> URL {
    var query = [
        "peerName": peerName,
        "roomName": roomName,
        "roomType": roomType.rawValue
    ]
    if let videoCodec {
        query["videoCodec"] = videoCodec.rawValue
    }
    return try sandboxURL(sandboxApiUrl: sandboxApiUrl, pathSegments: [], query: query)
}

func sandboxLivestreamURL(
    sandboxApiUrl: String,
    roomName: String,
    isPublic: Bool = false,
    videoCodec: SandboxVideoCodec? = nil
) throws -> URL {
    var query = [
        "public": isPublic ? "true" : "false",
        "roomName": roomName
    ]
    if let videoCodec {
        query["videoCodec"] = videoCodec.rawValue
    }
    return try sandboxURL(sandboxApiUrl: sandboxApiUrl, pathSegments: ["livestream"], query: query)
}

func sandboxViewerTokenURL(sandboxApiUrl: String, roomName: String) throws -> URL {
    try sandboxURL(
        sandboxApiUrl: sandboxApiUrl,
        pathSegments: [roomName, "livestream-viewer-token"],
        query: [:]
    )
}

func sandboxPeerToken(
    status: Int,
    body: Data,
    roomName: String,
    peerName: String,
    roomType: SandboxRoomType
) throws -> String {
    if status == 409 {
        throw SandboxError(message: sandboxRoomConflictMessage(roomName))
    }
    guard (200..<300).contains(status) else {
        throw SandboxError(message: sandboxPeerTokenFailure(peerName, roomType, roomName))
    }
    guard let token = sandboxJSONObject(body)?["peerToken"] as? String, !token.isEmpty else {
        throw SandboxError(message: "Sandbox API response has no peer token")
    }
    return token
}

func sandboxLivestream(status: Int, body: Data, roomName: String) throws -> SandboxLivestream {
    if status == 409 {
        throw SandboxError(message: sandboxRoomConflictMessage(roomName))
    }
    guard (200..<300).contains(status) else {
        throw SandboxError(message: "Failed to retrieve streamer token for '\(roomName)' livestream room.")
    }
    guard let json = sandboxJSONObject(body),
          let streamerToken = json["streamerToken"] as? String, !streamerToken.isEmpty,
          let room = json["room"] as? [String: Any],
          let roomId = room["id"] as? String, !roomId.isEmpty,
          let name = room["name"] as? String, !name.isEmpty
    else {
        throw SandboxError(message: "Sandbox API response has no streamer token")
    }
    return SandboxLivestream(streamerToken: streamerToken, roomId: roomId, roomName: name)
}

func sandboxViewerToken(status: Int, body: Data, roomName: String) throws -> String {
    if status == 404 {
        throw SandboxError(message: "A livestream room of name '\(roomName)' does not exist.")
    }
    guard (200..<300).contains(status) else {
        throw SandboxError(message: "Failed to retrieve viewer token for '\(roomName)' livestream room.")
    }
    guard let token = sandboxJSONObject(body)?["token"] as? String, !token.isEmpty else {
        throw SandboxError(message: "Sandbox API response has no viewer token")
    }
    return token
}

private func sandboxPeerTokenFailure(
    _ peerName: String,
    _ roomType: SandboxRoomType,
    _ roomName: String
) -> String {
    "Failed to retrieve peer token for peer '\(peerName)' in \(roomType.rawValue) room '\(roomName)'."
}

private func sandboxRoomConflictMessage(_ roomName: String) -> String {
    "Room '\(roomName)' already exists with a different room type or video codec."
}

private func sandboxJSONObject(_ body: Data) -> [String: Any]? {
    (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
}

private func sandboxBaseURL(_ sandboxApiUrl: String) throws -> URL {
    let trimmed = sandboxApiUrl.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty,
          let components = URLComponents(string: trimmed),
          let scheme = components.scheme?.lowercased(),
          scheme == "http" || scheme == "https",
          components.host != nil,
          let url = components.url
    else {
        throw SandboxError(message: sandboxMissingURLMessage)
    }
    return url
}

private func sandboxURL(
    sandboxApiUrl: String,
    pathSegments: [String],
    query: [String: String]
) throws -> URL {
    guard var components = URLComponents(url: try sandboxBaseURL(sandboxApiUrl), resolvingAgainstBaseURL: false) else {
        throw SandboxError(message: sandboxMissingURLMessage)
    }
    if !pathSegments.isEmpty {
        var path = components.percentEncodedPath
        if path.hasSuffix("/") {
            path.removeLast()
        }
        for segment in pathSegments {
            path += "/" + sandboxEncodedPathSegment(segment)
        }
        components.percentEncodedPath = path
    }
    var items = components.queryItems ?? []
    for name in query.keys.sorted() {
        items.removeAll { $0.name == name }
        items.append(URLQueryItem(name: name, value: query[name]))
    }
    components.queryItems = items.isEmpty ? nil : items
    guard let result = components.url else {
        throw SandboxError(message: sandboxMissingURLMessage)
    }
    return result
}

private func sandboxEncodedPathSegment(_ segment: String) -> String {
    var allowed = CharacterSet.alphanumerics
    allowed.insert(charactersIn: "-._~")
    return segment.addingPercentEncoding(withAllowedCharacters: allowed) ?? segment
}

private func sandboxGet(_ url: URL) async throws -> (status: Int, body: Data) {
    let (data, response) = try await URLSession.shared.data(from: url)
    guard let http = response as? HTTPURLResponse else {
        throw SandboxError(message: "Sandbox API returned a non-HTTP response")
    }
    return (http.statusCode, data)
}
