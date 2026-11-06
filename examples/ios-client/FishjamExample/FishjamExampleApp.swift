import FishjamClient
import SwiftUI
import UIKit

private let fishjamID = FishjamConfig.fishjamId

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
    @State private var mirrored = false
    @State private var cover = true
    @State private var hasJoinedCall = false
    @State private var connectionToast: ConnectionToast?
    @State private var toastDismiss: Task<Void, Never>?
    @State private var deviceSetup = DeviceSetup()
    @State private var permissionsDenied = false
    @State private var audioDialog = false
    @Environment(\.scenePhase) private var scenePhase
    @FocusState private var focusedField: Field?

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
            Text("Fishjam example")
                .font(.title2)
            TextField("Room name", text: $roomName)
                .exampleTextField(focused: $focusedField, field: .room, identifier: "room")
            TextField("Peer name", text: $peerName)
                .exampleTextField(focused: $focusedField, field: .peer, identifier: "peer")
                WrappingHStack(spacing: 8, views: [AnyView(fetchTokenButton)])
                TextField("Token", text: $token)
                    .exampleTextField(focused: $focusedField, field: .token, identifier: "token")
                WrappingHStack(spacing: 8, views: actionButtons)
                roomVideos
                Text(notice.isEmpty ? client.peerStatus.label : notice)
                    .accessibilityIdentifier("status")
            }
            .padding(16)
            .frame(maxWidth: .infinity, minHeight: geometry.size.height, alignment: .topLeading)
            .background {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { focusedField = nil }
            }
            }
        }
        .overlay(alignment: .top) {
            if let toast = connectionToast {
                ConnectionToastBanner(toast: toast)
                    .padding(.top, 8)
                    .padding(.horizontal, 16)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: connectionToast)
        .onChange(of: client.peerStatus) { _ in
            applyConnectionToast()
        }
        .onChange(of: client.reconnectionStatus) { _ in
            applyConnectionToast()
        }
        .task {
            await prepareDevices(
                client: client,
                setup: deviceSetup,
                notice: $notice,
                permissionsDenied: $permissionsDenied
            )
        }
        .confirmationDialog("Audio output", isPresented: $audioDialog, titleVisibility: .visible) {
            Button("Speaker") { applyAudioOverride(.speaker) }
            Button("Default") { applyAudioOverride(.none) }
            Button("Choose device") { client.showAudioRoutePicker() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Now: \(client.currentAudioOutput?.name ?? "unknown")")
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active else { return }
            Task {
                await prepareDevices(
                    client: client,
                    setup: deviceSetup,
                    notice: $notice,
                    permissionsDenied: $permissionsDenied
                )
            }
        }
    }

    private var fetchTokenButton: some View {
        prominentButton(
            "Fetch token",
            identifier: "fetch",
            disabled: roomName.isEmpty || peerName.isEmpty
        ) {
            notice = ""
            Task {
                do {
                    token = try await fetchPeerToken(roomName: roomName, peerName: peerName)
                } catch {
                    notice = error.localizedDescription
                }
            }
        }
    }

    private var actionButtons: [AnyView] {
        [
            AnyView(joinButton),
            AnyView(updateNameButton),
            AnyView(leaveButton),
            AnyView(cameraButton),
            AnyView(switchCameraButton),
            AnyView(microphoneButton),
            AnyView(mirrorButton),
            AnyView(containButton),
            AnyView(coverButton),
            AnyView(audioButton)
        ] + (permissionsDenied ? [AnyView(settingsButton)] : [])
    }

    private var joinButton: some View {
        prominentButton(
            "Join",
            identifier: "join",
            disabled: token.isEmpty || client.peerStatus == .connected
        ) {
            notice = ""
            let peerToken = token.trimmingCharacters(in: .whitespacesAndNewlines)
            Task {
                do {
                    try await client.joinRoom(
                        peerToken: peerToken,
                        peerMetadata: ["name": peerName]
                    )
                } catch is CancellationError {
                    return
                } catch {
                    notice = error.localizedDescription
                }
            }
        }
    }

    private var leaveButton: some View {
        Button("Leave") {
            notice = ""
            // Clear this before leaveRoom, so the Idle status that follows
            // is not treated as an unexpected disconnect.
            hasJoinedCall = false
            connectionToast = nil
            toastDismiss?.cancel()
            toastDismiss = nil
            client.leaveRoom()
        }
        .buttonStyle(.bordered)
        .disabled(client.peerStatus == .idle)
        .accessibilityIdentifier("leave")
    }

    private var cameraButton: some View {
        prominentButton(client.isCameraOn ? "Camera on" : "Camera off", identifier: "camera") {
            notice = ""
            Task {
                await setCamera(client: client, notice: $notice)
            }
        }
    }

    private var switchCameraButton: some View {
        prominentButton("Switch camera", identifier: "switch-camera", disabled: !client.isCameraOn) {
            notice = ""
            Task {
                await switchCamera(client: client, notice: $notice)
            }
        }
    }

    private var microphoneButton: some View {
        prominentButton(client.isMicrophoneOn ? "Microphone on" : "Microphone off", identifier: "microphone") {
            notice = ""
            Task {
                await setMicrophone(client: client, notice: $notice)
            }
        }
    }

    private var mirrorButton: some View {
        prominentButton(mirrored ? "Mirror on" : "Mirror off", identifier: "mirror") {
            mirrored.toggle()
        }
    }

    private var containButton: some View {
        prominentButton("Contain", identifier: "contain") {
            cover = false
        }
    }

    private var coverButton: some View {
        prominentButton("Cover", identifier: "cover") {
            cover = true
        }
    }

    private var audioButton: some View {
        let name = client.currentAudioOutput?.name ?? "Audio"
        return prominentButton("Audio: \(name)", identifier: "audio") {
            audioDialog = true
        }
    }

    private func applyAudioOverride(_ output: AudioOutputOverride) {
        notice = ""
        do {
            try client.overrideAudioOutput(output)
        } catch {
            notice = error.localizedDescription
        }
    }

    private var settingsButton: some View {
        prominentButton("Open Settings", identifier: "settings") {
            guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
            UIApplication.shared.open(url)
        }
    }

    private func applyConnectionToast() {
        let previous = connectionToast
        let decision = decideConnectionToast(
            hasJoinedCall: hasJoinedCall,
            peerStatus: client.peerStatus,
            reconnectionStatus: client.reconnectionStatus,
            current: connectionToast
        )
        hasJoinedCall = decision.hasJoinedCall
        connectionToast = decision.toast
        if decision.autoDismiss && decision.toast == .reconnected && previous != .reconnected {
            toastDismiss?.cancel()
            toastDismiss = Task {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                guard !Task.isCancelled else { return }
                connectionToast = nil
            }
        } else if decision.toast != .reconnected {
            toastDismiss?.cancel()
            toastDismiss = nil
        }
    }

    private func prominentButton(
        _ title: String,
        identifier: String,
        disabled isDisabled: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(title, action: action)
            .buttonStyle(.borderedProminent)
            .disabled(isDisabled)
            .accessibilityIdentifier(identifier)
    }
}

private extension JoinView {
    @ViewBuilder
    var roomVideos: some View {
        let objectFit: ObjectFit = cover ? .cover : .contain
        if let local = client.roomState.localPeer {
            if let video = local.cameraTrack?.videoTrack {
                VideoView(track: video, mirror: client.currentCamera?.front == true, objectFit: objectFit)
                    .frame(maxWidth: .infinity)
                    .frame(height: 200)
                    .background(Color.black)
                    .accessibilityIdentifier("local-video")
            }
            Text(peerDisplayName(local))
                .accessibilityIdentifier("local-name")
        }
        ForEach(client.roomState.remotePeers, id: \.id) { peer in
            if let camera = peer.cameraTrack {
                if let video = camera.videoTrack {
                    VideoView(track: video, mirror: mirrored, objectFit: objectFit)
                        .frame(maxWidth: .infinity)
                        .frame(height: 200)
                        .background(Color.black)
                        .accessibilityIdentifier("remote-video")
                }
                if !camera.trackId.isEmpty {
                    ReceivedRate(client: client, trackId: camera.trackId)
                }
            }
            Text(peerDisplayName(peer))
                .accessibilityIdentifier("remote-name")
        }
    }

    var updateNameButton: some View {
        prominentButton(
            "Update name",
            identifier: "update-name",
            disabled: peerName.isEmpty || client.peerStatus != .connected
        ) {
            notice = ""
            do {
                try client.updatePeerMetadata(["name": peerName])
            } catch {
                notice = error.localizedDescription
            }
        }
    }
}

private struct ReceivedRate: View {
    let client: FishjamClient
    let trackId: String
    @State private var label = "Measuring..."

    var body: some View {
        Text(label)
            .font(.caption)
            .accessibilityIdentifier("received-kbps")
            .task(id: trackId) {
                var previousBytes: Double?
                var previousAt = Date()
                while !Task.isCancelled {
                    let stats = await client.getStatistics(trackId: trackId)
                    let now = Date()
                    if stats.isEmpty {
                        label = "No stats yet"
                    } else if let bytes = inboundVideoBytesReceived(stats) {
                        if let previous = previousBytes,
                           let rate = receivedKilobitsPerSecond(
                               previousBytes: previous,
                               bytes: bytes,
                               elapsedSeconds: now.timeIntervalSince(previousAt)
                           ) {
                            label = "\(rate) kb/s"
                        } else {
                            label = "Measuring..."
                        }
                        previousBytes = bytes
                        previousAt = now
                    } else {
                        label = "No video stats"
                    }
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                }
            }
    }
}

private func peerDisplayName(_ peer: PeerWithTracks) -> String {
    if let object = peer.metadata?.peer as? [String: Any],
       let name = object["name"] as? String,
       !name.isEmpty {
        return name
    }
    return peer.id
}

private enum Field {
    case room
    case peer
    case token
}

private extension View {
    func exampleTextField(
        focused: FocusState<Field?>.Binding,
        field: Field,
        identifier: String
    ) -> some View {
        textFieldStyle(.roundedBorder)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .focused(focused, equals: field)
            .accessibilityIdentifier(identifier)
    }
}

private final class DeviceSetup {
    var requestedPermissions = false
    var devicesReady = false
    var preparing = false
}

@MainActor
private func prepareDevices(
    client: FishjamClient,
    setup: DeviceSetup,
    notice: Binding<String>,
    permissionsDenied: Binding<Bool>
) async {
    if setup.devicesReady || setup.preparing { return }
    setup.preparing = true
    defer { setup.preparing = false }
    var camera = client.queryCameraPermission()
    var microphone = client.queryMicrophonePermission()
    if !setup.requestedPermissions {
        setup.requestedPermissions = true
        notice.wrappedValue = "Requesting permissions..."
        permissionsDenied.wrappedValue = false
        if camera != .granted { camera = await client.requestCameraPermission() }
        if microphone != .granted { microphone = await client.requestMicrophonePermission() }
    }
    guard camera == .granted, microphone == .granted else {
        notice.wrappedValue = "Permissions denied. Please grant camera and microphone access in settings."
        permissionsDenied.wrappedValue = true
        return
    }
    notice.wrappedValue = "Initializing camera..."
    permissionsDenied.wrappedValue = false
    _ = await client.initializeDevices(enableVideo: true, enableAudio: true)
    setup.devicesReady = true
    if notice.wrappedValue == "Initializing camera..." {
        notice.wrappedValue = ""
    }
}

private func setCamera(client: FishjamClient, notice: Binding<String>) async {
    if client.isCameraOn {
        do {
            try await client.stopCamera()
        } catch {
            notice.wrappedValue = error.localizedDescription
        }
        return
    }
    var status = client.queryCameraPermission()
    if status != .granted {
        status = await client.requestCameraPermission()
    }
    guard status == .granted else {
        notice.wrappedValue = "camera permission denied"
        return
    }
    do {
        try await client.startCamera()
    } catch {
        notice.wrappedValue = error.localizedDescription
    }
}

private func nextCamera(in cameras: [CameraDevice], current: CameraDevice?) -> CameraDevice? {
    guard let current else { return cameras.first }
    if let opposite = cameras.first(where: { $0.front != current.front }) {
        return opposite
    }
    return cameras.first { $0.deviceId != current.deviceId }
}

private func switchCamera(client: FishjamClient, notice: Binding<String>) async {
    do {
        let cameras = client.cameraDevices()
        guard let next = nextCamera(in: cameras, current: client.currentCamera) else {
            notice.wrappedValue = "No camera found"
            return
        }
        try await client.selectCamera(deviceId: next.deviceId)
    } catch {
        notice.wrappedValue = error.localizedDescription
    }
}

private func setMicrophone(client: FishjamClient, notice: Binding<String>) async {
    if client.isMicrophoneOn {
        do {
            try await client.stopMicrophone()
        } catch {
            notice.wrappedValue = error.localizedDescription
        }
        return
    }
    var status = client.queryMicrophonePermission()
    if status != .granted {
        status = await client.requestMicrophonePermission()
    }
    guard status == .granted else {
        notice.wrappedValue = "microphone permission denied"
        return
    }
    do {
        try await client.startMicrophone()
    } catch {
        notice.wrappedValue = error.localizedDescription
    }
}
