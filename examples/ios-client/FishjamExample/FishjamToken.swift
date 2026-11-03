import Foundation

func fetchPeerToken(roomName: String, peerName: String) async throws -> String {
    var components = URLComponents(string: FishjamConfig.sdkApiUrl)
    components?.queryItems = [
        URLQueryItem(name: "roomName", value: roomName),
        URLQueryItem(name: "peerName", value: peerName),
        URLQueryItem(name: "roomType", value: "conference")
    ]
    guard let url = components?.url else {
        throw URLError(.badURL)
    }
    let (data, response) = try await URLSession.shared.data(from: url)
    guard let http = response as? HTTPURLResponse, http.statusCode == 200,
          let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          let peerToken = json["peerToken"] as? String
    else {
        throw URLError(.badServerResponse)
    }
    return peerToken
}
