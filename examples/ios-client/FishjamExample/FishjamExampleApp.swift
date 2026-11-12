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
    @StateObject var client = FishjamClient(
        fishjamId: fishjamID,
        bandwidthLimits: BandwidthLimits(
            singleStreamKbps: 1500,
            lowKbps: 150,
            mediumKbps: 500,
            highKbps: 1500
        ),
        videoConfig: VideoConfig(sentQualities: [.low, .medium, .high])
    )
    @State var roomName = "testtest"
    @State var peerName = "ios"
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
