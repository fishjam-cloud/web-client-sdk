import FishjamClient
import SwiftUI
import UIKit

private let fishjamID = FishjamConfig.fishjamId

@main
struct FishjamExampleApp: App {
    var body: some Scene {
        WindowGroup {
            ExampleHome()
        }
    }
}

private enum ExampleScreen {
    case home
    case room
    case livestream
}

/// One screen at a time. The room client, and its microphone and camera, exist only
/// while Room is open.
private struct ExampleHome: View {
    @State private var screen = ExampleScreen.home

    var body: some View {
        VStack(spacing: 0) {
            if screen != .home {
                HStack {
                    Button("Back") { screen = .home }
                    Spacer()
                    Text(screenTitle)
                        .font(.headline)
                    Spacer()
                    Color.clear.frame(width: 44, height: 1)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
            switch screen {
            case .home:
                ExampleMenu(open: { screen = $0 })
            case .room:
                JoinView()
            case .livestream:
                LivestreamViewerView()
            }
        }
    }

    private var screenTitle: String {
        switch screen {
        case .home: return ""
        case .room: return "Room"
        case .livestream: return "Livestream"
        }
    }
}

private struct ExampleMenu: View {
    let open: (ExampleScreen) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Fishjam example")
                .font(.title2)
            Text("The microphone and camera start only after you open Room.")
                .foregroundStyle(.secondary)
            Button("Room") { open(.room) }
                .buttonStyle(.borderedProminent)
            Button("Livestream") { open(.livestream) }
                .buttonStyle(.borderedProminent)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(24)
    }
}

struct JoinView: View {
    @StateObject var client: FishjamClient = {
        let client = FishjamClient(
            fishjamId: fishjamID,
            bandwidthLimits: BandwidthLimits(
                singleStreamKbps: 1500,
                lowKbps: 150,
                mediumKbps: 500,
                highKbps: 1500
            ),
            videoConfig: VideoConfig(sentQualities: [.low, .medium, .high])
        )
        client.screenShareConfig = ScreenShareConfig(
            appGroupId: "group.io.fishjam.example.voipcall",
            extensionBundleId: "io.fishjam.example.voipcall.ScreenBroadcastExtension"
        )
        return client
    }()
    @State var pip: PictureInPictureController?
    @State var roomName = "testtest"
    @State var peerName = "ios"
    @State var roomType = SandboxRoomType.conference
    @State var codecChoice = SandboxCodecChoice.serverDefault
    @State var token = ""
    @State var notice = ""
    @State var mirrored = false
    @State var cover = true
    @State var hasJoinedCall = false
    @State var connectionToast: ConnectionToast?
    @State var toastDismiss: Task<Void, Never>?
    @State var deviceSetup = DeviceSetup()
    @State var permissionsDenied = false
    @State var audioDialog = false
    @State var showCameraLimits = false
    @State var lowKbps = "150"
    @State var mediumKbps = "500"
    @State var highKbps = "1500"
    @State var sendingLow = 150
    @State var sendingMedium = 500
    @State var sendingHigh = 1500
    @Environment(\.scenePhase) var scenePhase
    @FocusState var focusedField: Field?

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
            Text("Fishjam example")
                .font(.title2)
            VStack(alignment: .leading, spacing: 2) {
                Text(notice.isEmpty ? client.peerStatus.label : notice)
                    .accessibilityIdentifier("status")
                if client.peerStatus == .connected {
                    RoomCodec(client: client)
                }
            }
            TextField("Room name", text: $roomName)
                .exampleTextField(focused: $focusedField, field: .room, identifier: "room")
            TextField("Peer name", text: $peerName)
                .exampleTextField(focused: $focusedField, field: .peer, identifier: "peer")
            Picker("Room type", selection: $roomType) {
                Text("Conference").tag(SandboxRoomType.conference)
                Text("Audio only").tag(SandboxRoomType.audioOnly)
                Text("Livestream").tag(SandboxRoomType.livestream)
            }
            .pickerStyle(.menu)
            .accessibilityIdentifier("room-type")
            Picker("Video codec", selection: $codecChoice) {
                ForEach(SandboxCodecChoice.allCases) { choice in
                    Text(choice.rawValue).tag(choice)
                }
            }
            .pickerStyle(.menu)
            .accessibilityIdentifier("video-codec")
            Text("Not for production.")
                .font(.footnote)
                .accessibilityIdentifier("sandbox-warning")
                WrappingHStack(spacing: 8, views: [AnyView(fetchTokenButton)])
                TextField("Token", text: $token)
                    .exampleTextField(focused: $focusedField, field: .token, identifier: "token")
                WrappingHStack(spacing: 8, views: actionButtons)
                roomVideos
                EventLogView(client: client)
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
        .task { await handleCallKitEvents() }
        .onAppear {
            if pip == nil { pip = .example(client: client) }
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
}
