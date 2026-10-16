import AVFoundation
import FishjamClient
import SwiftUI

private let fishjamID = FishjamConfig.fishjamId
private let roomManagerURL = FishjamConfig.sdkApiUrl

@main
struct FishjamExampleApp: App {
    var body: some Scene {
        WindowGroup {
            JoinView()
        }
    }
}

struct JoinView: View {
    @StateObject private var client = FishjamClient(fishjamId: fishjamID)
    @State private var roomName = "testtest"
    @State private var peerName = "ios"
    @State private var token = ""
    @State private var notice = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Fishjam example")
                    .font(.title2)
                TextField("Room name", text: $roomName)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("room")
                TextField("Peer name", text: $peerName)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("peer")
                Button("Fetch token") {
                    notice = ""
                    Task {
                        do {
                            token = try await fetchPeerToken(roomName: roomName, peerName: peerName)
                        } catch {
                            notice = error.localizedDescription
                        }
                    }
                }
                .buttonStyle(.borderedProminent)
                .frame(maxWidth: .infinity)
                .disabled(roomName.isEmpty || peerName.isEmpty)
                .accessibilityIdentifier("fetch")
                TextField("Token", text: $token)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("token")
                Button("Join") {
                    notice = ""
                    let peerToken = token.trimmingCharacters(in: .whitespacesAndNewlines)
                    Task {
                        do {
                            try await client.joinRoom(peerToken: peerToken)
                        } catch is CancellationError {
                            return
                        } catch {
                            notice = error.localizedDescription
                        }
                    }
                }
                .buttonStyle(.borderedProminent)
                .frame(maxWidth: .infinity)
                .disabled(token.isEmpty || client.peerStatus == .connected)
                .accessibilityIdentifier("join")
                Button("Leave") {
                    notice = ""
                    client.leaveRoom()
                }
                .buttonStyle(.bordered)
                .frame(maxWidth: .infinity)
                .disabled(client.peerStatus == .idle)
                .accessibilityIdentifier("leave")
                Button("Camera") {
                    notice = ""
                    Task {
                        await startCamera(client: client, notice: $notice)
                    }
                }
                .buttonStyle(.borderedProminent)
                .frame(maxWidth: .infinity)
                .accessibilityIdentifier("camera")
                Button("Microphone") {
                    notice = ""
                    Task {
                        await startMicrophone(client: client, notice: $notice)
                    }
                }
                .buttonStyle(.borderedProminent)
                .frame(maxWidth: .infinity)
                .accessibilityIdentifier("microphone")
                if let video = client.roomState.localPeer?.cameraTrack?.videoTrack {
                    VideoView(track: video, mirror: true)
                        .frame(maxWidth: .infinity)
                        .frame(height: 200)
                        .background(Color.black)
                        .accessibilityIdentifier("local-video")
                }
                ForEach(client.roomState.remotePeers, id: \.id) { peer in
                    if let video = peer.cameraTrack?.videoTrack {
                        VideoView(track: video)
                            .frame(maxWidth: .infinity)
                            .frame(height: 200)
                            .background(Color.black)
                            .accessibilityIdentifier("remote-video")
                    }
                }
                Text(notice.isEmpty ? client.peerStatus.rawValue : notice)
                    .accessibilityIdentifier("status")
            }
            .padding(16)
        }
    }
}

private func startCamera(client: FishjamClient, notice: Binding<String>) async {
    let granted = await AVCaptureDevice.requestAccess(for: .video)
    guard granted else {
        notice.wrappedValue = "camera permission denied"
        return
    }
    do {
        try await client.startCamera()
    } catch {
        notice.wrappedValue = error.localizedDescription
    }
}

private func startMicrophone(client: FishjamClient, notice: Binding<String>) async {
    let granted = await requestMicrophoneAccess()
    guard granted else {
        notice.wrappedValue = "microphone permission denied"
        return
    }
    do {
        try await client.startMicrophone()
    } catch {
        notice.wrappedValue = error.localizedDescription
    }
}

private func requestMicrophoneAccess() async -> Bool {
    await withCheckedContinuation { continuation in
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            continuation.resume(returning: granted)
        }
    }
}

func fetchPeerToken(roomName: String, peerName: String) async throws -> String {
    var components = URLComponents(string: roomManagerURL)
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
