import Combine
import FishjamClient
import SwiftUI

@MainActor
private final class StreamerScreenModel: ObservableObject {
    let client: FishjamClient
    let streamer: LivestreamStreamer
    private var subscriptions: [AnyCancellable] = []

    init() {
        let client = FishjamClient(fishjamId: FishjamConfig.fishjamId)
        client.screenShareConfig = ScreenShareConfig(
            appGroupId: "group.io.fishjam.example.voipcall",
            extensionBundleId: "io.fishjam.example.voipcall.ScreenBroadcastExtension"
        )
        self.client = client
        streamer = LivestreamStreamer(client: client)
        subscriptions = [
            client.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() },
            streamer.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }
        ]
    }
}

struct LivestreamStreamerView: View {
    @StateObject private var model = StreamerScreenModel()
    @State private var roomName = "testtest"
    @State private var notice = ""
    @State private var connecting = false
    @State private var devicesReady = false
    @State private var camera: VideoTrack?
    @State private var screen: VideoTrack?
    @State private var audio: AudioTrack?
    @State private var screenMode = false
    @State private var token: String?
    @State private var connectTask: Task<Void, Never>?

    private var client: FishjamClient { model.client }
    private var streamer: LivestreamStreamer { model.streamer }
    private var preview: VideoTrack? { screenMode ? screen : camera }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(statusLabel)
                    .accessibilityIdentifier("streamer-status")
                if let message = errorMessage {
                    Text(message)
                        .foregroundColor(.red)
                        .accessibilityIdentifier("streamer-error")
                }
                TextField("Room name", text: $roomName)
                    .textFieldStyle(.roundedBorder)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("streamer-room")
                Text("Not for production.")
                    .font(.footnote)
                    .accessibilityIdentifier("streamer-sandbox-warning")
                HStack(spacing: 12) {
                    sourceButton("Camera", selected: !screenMode, action: useCamera)
                        .accessibilityIdentifier("streamer-camera")
                    sourceButton("Share screen", selected: screenMode, action: useScreen)
                        .accessibilityIdentifier("streamer-screen")
                }
                if streamer.isConnected {
                    Button("Stop Streaming", action: stop)
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("streamer-stop")
                } else {
                    Button(connecting ? "Connecting..." : "Start Streaming", action: start)
                        .buttonStyle(.borderedProminent)
                        .disabled(!(devicesReady || screen != nil) || roomName.isEmpty || connecting)
                        .accessibilityIdentifier("streamer-start")
                }
                ZStack {
                    Color.black
                    if let preview {
                        VideoView(
                            track: preview,
                            mirror: !screenMode,
                            objectFit: screenMode ? .contain : .cover
                        )
                        .accessibilityIdentifier("streamer-preview")
                    } else {
                        Text(placeholderText)
                            .foregroundColor(.white)
                            .accessibilityIdentifier("streamer-no-video")
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 320)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color(red: 0.75, green: 0.91, blue: 0.97))
        .task { await startDevices() }
        // The system stop sheet ends screen sharing. Stop the stream too, and go back to the camera.
        .onChange(of: client.isScreenSharing) { sharing in
            if !sharing && screenMode {
                streamer.disconnect()
                screenMode = false
                screen = nil
            }
        }
        .onDisappear(perform: stop)
    }

    private var statusLabel: String {
        if connecting { return "Connecting..." }
        if streamer.isConnected { return "Streaming" }
        return "Not streaming"
    }

    private var placeholderText: String {
        if screenMode { return "Starting screen share..." }
        return devicesReady ? "Camera ready" : "Initializing camera..."
    }

    private var errorMessage: String? {
        if !notice.isEmpty { return notice }
        return streamer.error.map(describe)
    }

    private func startDevices() async {
        let result = await client.initializeDevices(enableVideo: true, enableAudio: true)
        if result.status == .failed {
            notice = "Camera and microphone permission denied"
            return
        }
        do {
            camera = try await client.startCamera()
        } catch {
            notice = error.localizedDescription
        }
        do {
            audio = try await client.startMicrophone()
        } catch {
            let message = error.localizedDescription
            notice = notice.isEmpty ? message : "\(notice) \(message)"
        }
        devicesReady = camera != nil || audio != nil
    }

    private func start() {
        connectTask?.cancel()
        notice = ""
        connecting = true
        connectTask = Task {
            do {
                let streamToken = try await SandboxApi(sandboxApiUrl: FishjamConfig.sdkApiUrl)
                    .getSandboxLivestream(roomName: roomName.trimmingCharacters(in: .whitespacesAndNewlines))
                    .streamerToken
                token = streamToken
                try await streamer.connect(video: preview, audio: audio, token: streamToken)
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

    @ViewBuilder
    private func sourceButton(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        if selected {
            Button(title, action: action)
                .buttonStyle(.borderedProminent)
                .disabled(connecting)
        } else {
            Button(title, action: action)
                .buttonStyle(.bordered)
                .disabled(connecting)
        }
    }

    /// Switches to the camera. Replaces the live stream's video when streaming.
    private func useCamera() {
        guard screenMode else { return }
        connectTask?.cancel()
        notice = ""
        connecting = true
        connectTask = Task {
            screenMode = false
            try? await client.stopScreenShare()
            screen = nil
            await reconnect(camera)
            connecting = false
        }
    }

    /// Switches to the screen. Replaces the live stream's video when streaming.
    private func useScreen() {
        guard !screenMode else { return }
        connectTask?.cancel()
        notice = ""
        connecting = true
        connectTask = Task {
            do {
                let track = try await client.startScreenShare()
                screen = track
                screenMode = true
                await reconnect(track)
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

    private func reconnect(_ track: VideoTrack?) async {
        guard let token, streamer.isConnected else { return }
        if track == nil && audio == nil {
            streamer.disconnect()
            return
        }
        do {
            try await streamer.connect(video: track, audio: audio, token: token)
        } catch let error as LivestreamError {
            notice = describe(error)
        } catch {
            notice = error.localizedDescription
        }
    }

    private func stop() {
        connectTask?.cancel()
        connectTask = nil
        connecting = false
        streamer.disconnect()
        if screenMode {
            screenMode = false
            screen = nil
            Task { try? await client.stopScreenShare() }
        }
    }

    private func describe(_ error: LivestreamError) -> String {
        switch error {
        case .unauthorized: return "Unauthorized: the streamer token was rejected"
        case .streamNotFound: return "Stream not found"
        case .streamerAlreadyConnected: return "A streamer is already connected to this room"
        case .unknownError: return "Could not start the livestream"
        }
    }
}
