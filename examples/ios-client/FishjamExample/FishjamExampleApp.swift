import FishjamClient
import SwiftUI

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
    @State private var microphoneOn = false
    @State private var captureEpoch = 0
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
                let objectFit: ObjectFit = cover ? .cover : .contain
                if let video = client.roomState.localPeer?.cameraTrack?.videoTrack {
                    VideoView(track: video, mirror: !mirrored, objectFit: objectFit)
                        .frame(maxWidth: .infinity)
                        .frame(height: 200)
                        .background(Color.black)
                        .accessibilityIdentifier("local-video")
                }
                ForEach(client.roomState.remotePeers, id: \.id) { peer in
                    if let video = peer.cameraTrack?.videoTrack {
                        VideoView(track: video, mirror: mirrored, objectFit: objectFit)
                            .frame(maxWidth: .infinity)
                            .frame(height: 200)
                            .background(Color.black)
                            .accessibilityIdentifier("remote-video")
                    }
                }
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
            AnyView(leaveButton),
            AnyView(cameraButton),
            AnyView(microphoneButton),
            AnyView(mirrorButton),
            AnyView(containButton),
            AnyView(coverButton)
        ]
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
                    try await client.joinRoom(peerToken: peerToken)
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
            captureEpoch += 1
            microphoneOn = false
            client.leaveRoom()
        }
        .buttonStyle(.bordered)
        .disabled(client.peerStatus == .idle)
        .accessibilityIdentifier("leave")
    }

    private var cameraOn: Bool {
        client.roomState.localPeer?.cameraTrack?.videoTrack != nil
    }

    private var cameraButton: some View {
        prominentButton(cameraOn ? "Camera on" : "Camera off", identifier: "camera") {
            notice = ""
            Task {
                await startCamera(client: client, notice: $notice)
            }
        }
    }

    private var microphoneButton: some View {
        prominentButton(microphoneOn ? "Microphone on" : "Microphone off", identifier: "microphone") {
            notice = ""
            let epoch = captureEpoch
            Task {
                let started = await startMicrophone(client: client, notice: $notice)
                if started, epoch == captureEpoch {
                    microphoneOn = true
                }
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

private struct WrappingHStack: View {
    let spacing: CGFloat
    let views: [AnyView]

    @State private var maxWidth: CGFloat = 0
    @State private var sizes: [Int: CGSize] = [:]

    var body: some View {
        let frames = currentFrames
        framed(buttonStack(frames: frames), height: frames.map(\.maxY).max())
            .background(widthProbe)
            .onPreferenceChange(WidthKey.self, perform: updateWidth)
            .onPreferenceChange(ViewSizeKey.self, perform: updateSizes)
    }

    private func buttonStack(frames: [CGRect]) -> some View {
        ZStack(alignment: .topLeading) {
            ForEach(Array(views.indices), id: \.self) { index in
                HStack(spacing: 0) {
                    views[index]
                }
                .fixedSize()
                .background(sizeProbe(index: index))
                .offset(originOffset(frames: frames, index: index))
            }
        }
        .accessibilityElement(children: .contain)
        .opacity(frames.isEmpty ? 0 : 1)
    }

    @ViewBuilder
    private func framed<Content: View>(_ content: Content, height: CGFloat?) -> some View {
        if let height = height {
            content.frame(
                maxWidth: .infinity,
                minHeight: height,
                maxHeight: height,
                alignment: .topLeading
            )
        } else {
            content.frame(maxWidth: .infinity, alignment: .topLeading)
        }
    }

    private var currentFrames: [CGRect] {
        guard isReady else {
            return []
        }
        return wrappingFrames(
            sizes: sizes,
            count: views.count,
            maxWidth: maxWidth,
            spacing: spacing
        )
    }

    private var isReady: Bool {
        guard maxWidth > 0, sizes.count == views.count else {
            return false
        }
        return sizes.values.allSatisfy { size in
            size.width > 0 && size.height > 0
        }
    }

    private func originOffset(frames: [CGRect], index: Int) -> CGSize {
        guard frames.indices.contains(index) else {
            return .zero
        }
        return CGSize(width: frames[index].minX, height: frames[index].minY)
    }

    private func sizeProbe(index: Int) -> some View {
        GeometryReader { proxy in
            let size = CGSize(
                width: proxy.size.width.rounded(),
                height: proxy.size.height.rounded()
            )
            Color.clear.preference(key: ViewSizeKey.self, value: [index: size])
        }
    }

    private var widthProbe: some View {
        GeometryReader { proxy in
            Color.clear.preference(key: WidthKey.self, value: proxy.size.width.rounded())
        }
    }

    private func updateWidth(_ width: CGFloat) {
        let rounded = width.rounded()
        guard rounded != maxWidth else {
            return
        }
        maxWidth = rounded
    }

    private func updateSizes(_ next: [Int: CGSize]) {
        guard next != sizes else {
            return
        }
        sizes = next
    }

    private func wrappingFrames(
        sizes: [Int: CGSize],
        count: Int,
        maxWidth: CGFloat,
        spacing: CGFloat
    ) -> [CGRect] {
        var frames: [CGRect] = []
        var originX: CGFloat = 0
        var originY: CGFloat = 0
        var rowHeight: CGFloat = 0
        for index in 0..<count {
            let size = sizes[index] ?? .zero
            let wraps = originX > 0 && originX + size.width > maxWidth
            if wraps {
                originX = 0
                originY += rowHeight + spacing
                rowHeight = 0
            }
            let origin = CGPoint(x: originX, y: originY)
            frames.append(CGRect(origin: origin, size: size))
            originX += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return frames
    }
}

private struct WidthKey: PreferenceKey {
    static var defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

private struct ViewSizeKey: PreferenceKey {
    static var defaultValue: [Int: CGSize] = [:]

    static func reduce(value: inout [Int: CGSize], nextValue: () -> [Int: CGSize]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
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

private func startCamera(client: FishjamClient, notice: Binding<String>) async {
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

private func startMicrophone(client: FishjamClient, notice: Binding<String>) async -> Bool {
    var status = client.queryMicrophonePermission()
    if status != .granted {
        status = await client.requestMicrophonePermission()
    }
    guard status == .granted else {
        notice.wrappedValue = "microphone permission denied"
        return false
    }
    do {
        try await client.startMicrophone()
        return true
    } catch {
        notice.wrappedValue = error.localizedDescription
        return false
    }
}
