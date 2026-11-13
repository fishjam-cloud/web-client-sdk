import FishjamClient
import SwiftUI

struct LivestreamViewerView: View {
    @StateObject private var viewer = LivestreamViewer(fishjamId: FishjamConfig.fishjamId)
    @State private var roomName = "testtest"
    @State private var streamId = ""
    @State private var notice = ""
    @State private var connecting = false
    @State private var connectTask: Task<Void, Never>?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(statusLabel)
                    .accessibilityIdentifier("livestream-status")
                if let message = errorMessage {
                    Text(message)
                        .foregroundColor(.red)
                        .accessibilityIdentifier("livestream-error")
                }
                TextField("Room name (viewer token)", text: $roomName)
                    .livestreamTextField(identifier: "livestream-room")
                TextField("Stream id (public stream)", text: $streamId)
                    .livestreamTextField(identifier: "livestream-stream-id")
                HStack(spacing: 8) {
                    Button("Connect to Livestream") { connectWithToken() }
                        .buttonStyle(.borderedProminent)
                        .disabled(roomName.isEmpty || connecting)
                        .accessibilityIdentifier("livestream-connect-token")
                    Button("Connect public") { connectPublic() }
                        .buttonStyle(.borderedProminent)
                        .disabled(streamId.isEmpty || connecting)
                        .accessibilityIdentifier("livestream-connect-public")
                }
                Button("Disconnect") { disconnect() }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("livestream-disconnect")
                video
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .background(Color(red: 191.0 / 255, green: 231.0 / 255, blue: 248.0 / 255))
        .tint(Color(red: 0, green: 26.0 / 255, blue: 114.0 / 255))
    }

    private var video: some View {
        ZStack {
            Color.black
            if let track = viewer.videoTrack {
                VideoView(track: track, objectFit: .contain)
            } else {
                Text(connecting ? "Connecting..." : "No video")
                    .foregroundColor(.white)
            }
        }
        .frame(height: 320)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var statusLabel: String {
        if connecting { return "Connecting..." }
        return viewer.isConnected ? "Connected" : "Disconnected"
    }

    private var errorMessage: String? {
        if !notice.isEmpty { return notice }
        guard let error = viewer.error else { return nil }
        return describe(error)
    }

    private func connectWithToken() {
        start {
            let token = try await fetchViewerToken(roomName: roomName)
            try await viewer.connect(.token(token))
        }
    }

    private func connectPublic() {
        start {
            try await viewer.connect(.streamId(streamId.trimmingCharacters(in: .whitespacesAndNewlines)))
        }
    }

    private func start(_ work: @escaping () async throws -> Void) {
        connectTask?.cancel()
        notice = ""
        connecting = true
        connectTask = Task {
            do {
                try await work()
            } catch is CancellationError {
                return
            } catch let error as LivestreamError {
                notice = describe(error)
            } catch {
                notice = error.localizedDescription
            }
            connecting = false
        }
    }

    private func disconnect() {
        connectTask?.cancel()
        connectTask = nil
        connecting = false
        viewer.disconnect()
    }

    private func describe(_ error: LivestreamError) -> String {
        switch error {
        case .unauthorized: return "Unauthorized: the viewer token was rejected"
        case .streamNotFound: return "Stream not found"
        case .unknownError: return "Could not play the livestream"
        }
    }
}

private extension View {
    func livestreamTextField(identifier: String) -> some View {
        textFieldStyle(.roundedBorder)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .accessibilityIdentifier(identifier)
    }
}
