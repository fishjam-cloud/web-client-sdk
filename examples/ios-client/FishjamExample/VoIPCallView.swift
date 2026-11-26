import FishjamClient
import SwiftUI

/// Local VoIP push test panel. Talks to `voip-test-server` and drives `VoIP.shared`.
struct VoIPCallView: View {
    @State private var serverURL = "http://192.168.100.24:8787"
    @State private var userId = "ios"
    @State private var peerId = "android"
    @State private var roomName = "voip-test"
    @State private var isVideo = false
    @State private var notice = ""
    @State private var token = ""
    @State private var callStatus: VoIPCallStatus = .available
    @State private var lastEnded: String = "—"
    @State private var isOnHold = false
    @State private var isMuted = false
    @State private var currentCallLabel = "—"
    @State private var client = FishjamClient(fishjamId: FishjamConfig.fishjamId)
    @State private var listenTask: Task<Void, Never>?
    @State private var eventTask: Task<Void, Never>?
    @State private var remoteJoinedCall = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("VoIP push test").font(.title2)
                Text("Registers the PushKit token with the local test server and starts/answers calls.")
                    .font(.footnote)

                TextField("Test server URL", text: $serverURL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                TextField("My user id", text: $userId)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                TextField("Peer user id", text: $peerId)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                TextField("Room name", text: $roomName)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Toggle("Video call", isOn: $isVideo)

                Group {
                    InfoRow(label: "Token", value: token.isEmpty ? "—" : token)
                    InfoRow(label: "Status", value: callStatus.rawValue)
                    InfoRow(label: "Call", value: currentCallLabel)
                    InfoRow(label: "Last ended", value: lastEnded)
                    InfoRow(label: "Hold", value: isOnHold ? "yes" : "no")
                    InfoRow(label: "Mute", value: isMuted ? "yes" : "no")
                }
                .font(.system(.body, design: .monospaced))

                if !notice.isEmpty {
                    Text(notice).foregroundStyle(.secondary)
                }

                HStack {
                    Button("Register token") { Task { await registerToken() } }
                    Button("Call peer") { Task { await startOutgoing() } }
                    Button("End") { Task { await VoIP.shared.endCall() } }
                }
            }
            .padding()
        }
        .onAppear {
            refreshState()
            listenTask = Task { await pollState() }
            eventTask = Task { await listenEvents() }
            if let intent = VoIP.shared.pendingCallIntent {
                notice = "Recents intent: \(intent.handle)"
                peerId = intent.handle
                VoIP.shared.clearCallIntent()
            }
        }
        .onDisappear {
            listenTask?.cancel()
            eventTask?.cancel()
        }
    }

    private func refreshState() {
        token = VoIP.shared.token ?? ""
        callStatus = VoIP.shared.callStatus
        isOnHold = VoIP.shared.isOnHold
        isMuted = VoIP.shared.isMuted
        lastEnded = VoIP.shared.lastEndedReason?.rawValue ?? "—"
        if let call = VoIP.shared.currentCall {
            currentCallLabel = "\(call.displayName) / \(call.roomName)"
        } else {
            currentCallLabel = "—"
        }
    }

    private func pollState() async {
        while !Task.isCancelled {
            let previous = callStatus
            refreshState()
            if previous != callStatus {
                await handleStatusChange(to: callStatus)
            }
            await endCallIfPeerLeft()
            try? await Task.sleep(nanoseconds: 300_000_000)
        }
    }

    /// The SDK does not send a hang-up to the other phone. The room is the signal: when the
    /// other peer leaves during an active call, end this call as remote.
    private func endCallIfPeerLeft() async {
        guard callStatus == .active else {
            remoteJoinedCall = false
            return
        }
        if !client.roomState.remotePeers.isEmpty {
            remoteJoinedCall = true
        } else if remoteJoinedCall {
            remoteJoinedCall = false
            await VoIP.shared.endCall(reason: .remote)
        }
    }

    /// Events happen once and are not replayed, so they only update the notice line.
    /// Joining the room stays on `callStatus` (see `pollState`): a call answered before
    /// this view opened would otherwise be missed.
    private func listenEvents() async {
        for await event in VoIP.shared.events {
            switch event {
            case .incoming(let payload):
                notice = "Incoming call from \(payload.displayName)"
            case .answered(let call):
                notice = "Answered call from \(call.displayName)"
            case .ended(let reason):
                notice = "Call ended: \(reason.rawValue)"
            case .heldChanged(let onHold):
                notice = onHold ? "On hold" : "Resumed"
            case .muteChanged(let muted):
                notice = muted ? "Muted from system UI" : "Unmuted from system UI"
            case .callIntent(let intent):
                notice = "Recents intent: \(intent.handle)"
            case .waitingCallDeclined(let payload):
                notice = "Waiting call declined: \(payload.displayName)"
            case .tokenUpdated(let value):
                // Registering with the server happens only when the user taps "Register token".
                token = value
            }
        }
    }

    private func handleStatusChange(to next: VoIPCallStatus) async {
        switch next {
        case .connecting:
            // Outgoing joins from startOutgoing. Incoming joins here after the user answers.
            guard let call = VoIP.shared.currentCall, !call.isOutgoing else { return }
            await joinAndReport(roomName: call.roomName, peerName: userId)
        case .available:
            // Leaving the room keeps the microphone on, so the call stops it explicitly.
            if client.isMicrophoneOn {
                do {
                    try await client.stopMicrophone()
                } catch {
                    notice = "Microphone stop failed: \(error.localizedDescription)"
                }
            }
            if client.peerStatus == .connected || client.peerStatus == .connecting {
                client.leaveRoom()
            }
        default:
            break
        }
    }

    private func registerToken() async {
        guard let pushToken = VoIP.shared.token, !pushToken.isEmpty else {
            notice = "No VoIP token yet (needs a real device + Push entitlement)"
            return
        }
        do {
            try await postJSON(
                path: "/register",
                body: ["userId": userId, "platform": "ios", "token": pushToken]
            )
            notice = "Registered \(userId)"
        } catch {
            notice = "Register failed: \(error.localizedDescription)"
        }
    }

    private func startOutgoing() async {
        do {
            try await VoIP.shared.startCall(to: peerId, roomName: roomName, isVideo: isVideo)
            try await postJSON(
                path: "/call",
                body: [
                    "from": userId,
                    "to": peerId,
                    "roomName": roomName,
                    "isVideo": isVideo
                ]
            )
            await joinAndReport(roomName: roomName, peerName: userId, outgoing: true)
        } catch {
            notice = "Call failed: \(error.localizedDescription)"
        }
    }

    /// Publishes the microphone and uses the loudspeaker. Joining the room alone
    /// sends no audio, and CallKit plays it through the earpiece.
    private func startCallAudio() async {
        var status = client.queryMicrophonePermission()
        if status != .granted {
            status = await client.requestMicrophonePermission()
        }
        guard status == .granted else {
            notice = "Microphone permission denied"
            return
        }
        if !client.isMicrophoneOn {
            do {
                try await client.startMicrophone()
            } catch {
                notice = "Microphone failed: \(error.localizedDescription)"
            }
        }
        try? client.overrideAudioOutput(.speaker)
    }

    private func joinAndReport(roomName: String, peerName: String, outgoing: Bool = false) async {
        do {
            let peerToken = try await SandboxApi(sandboxApiUrl: FishjamConfig.sdkApiUrl)
                .getSandboxPeerToken(roomName: roomName, peerName: peerName)
            try await client.joinRoom(peerToken: peerToken)
            if outgoing {
                // Alone in the room the call is not connected yet. Wait for the callee to join.
                notice = "Calling... waiting for the other phone"
                guard await waitForRemotePeer(timeoutSeconds: 60) else {
                    await VoIP.shared.endCall(reason: .missed)
                    notice = "No answer in \(roomName)"
                    return
                }
            }
            // Incoming audio starts only after the answer is fulfilled. The microphone
            // has to be created after that, or the recorder never starts.
            await VoIP.shared.reportConnected()
            await startCallAudio()
            notice = "Connected in \(roomName)"
        } catch {
            await VoIP.shared.reportConnectFailed()
            notice = "Join failed: \(error.localizedDescription)"
        }
    }

    /// Returns true once another peer is in the room. Returns false on timeout or when the call ended.
    private func waitForRemotePeer(timeoutSeconds: Double) async -> Bool {
        let deadline = Date().addingTimeInterval(timeoutSeconds)
        while Date() < deadline {
            if !client.roomState.remotePeers.isEmpty { return true }
            if VoIP.shared.currentCall == nil || Task.isCancelled { return false }
            try? await Task.sleep(nanoseconds: 300_000_000)
        }
        return !client.roomState.remotePeers.isEmpty
    }

    private func postJSON(path: String, body: [String: Any]) async throws {
        guard let url = URL(string: serverURL.trimmingCharacters(in: .whitespaces) + path) else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
    }
}

/// Label/value row that works on iOS 15 (LabeledContent needs iOS 16).
private struct InfoRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
            Spacer()
            Text(value).foregroundStyle(.secondary).multilineTextAlignment(.trailing)
        }
    }
}
