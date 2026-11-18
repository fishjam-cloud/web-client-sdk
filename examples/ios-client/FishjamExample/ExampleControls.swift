import FishjamClient
import SwiftUI
import UIKit

extension JoinView {
    var fetchTokenButton: some View {
        prominentButton(
            "Fetch token",
            identifier: "fetch",
            disabled: roomName.isEmpty || peerName.isEmpty
        ) {
            notice = ""
            Task {
                do {
                    token = try await SandboxApi(sandboxApiUrl: FishjamConfig.sdkApiUrl).getSandboxPeerToken(
                        roomName: roomName,
                        peerName: peerName,
                        roomType: roomType,
                        videoCodec: codecChoice.codec
                    )
                } catch {
                    notice = error.localizedDescription
                }
            }
        }
    }

    var actionButtons: [AnyView] {
        [
            AnyView(joinButton),
            AnyView(updateNameButton),
            AnyView(leaveButton),
            AnyView(cameraButton),
            AnyView(switchCameraButton),
            AnyView(microphoneButton),
            AnyView(screenShareButton),
            AnyView(mirrorButton),
            AnyView(containButton),
            AnyView(coverButton),
            AnyView(audioButton)
        ] + (permissionsDenied ? [AnyView(settingsButton)] : [])
    }

    var joinButton: some View {
        prominentButton(
            "Join",
            identifier: "join",
            disabled: token.isEmpty || client.peerStatus == .connected
        ) {
            notice = ""
            let peerToken = token.trimmingCharacters(in: .whitespacesAndNewlines)
            client.callKitConfig = CallKitConfig(
                displayName: peerName.isEmpty ? "Fishjam call" : peerName,
                isVideo: true
            )
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

    var leaveButton: some View {
        Button("Leave") { leave() }
        .buttonStyle(.bordered)
        .disabled(client.peerStatus == .idle)
        .accessibilityIdentifier("leave")
    }

    var cameraButton: some View {
        prominentButton(client.isCameraOn ? "Camera on" : "Camera off", identifier: "camera") {
            notice = ""
            Task {
                await setCamera(client: client, notice: $notice)
            }
        }
    }

    var switchCameraButton: some View {
        prominentButton("Switch camera", identifier: "switch-camera", disabled: !client.isCameraOn) {
            notice = ""
            Task {
                await switchCamera(client: client, notice: $notice)
            }
        }
    }

    var microphoneButton: some View {
        prominentButton(client.isMicrophoneOn ? "Microphone on" : "Microphone off", identifier: "microphone") {
            notice = ""
            Task {
                await setMicrophone(client: client, notice: $notice)
            }
        }
    }

    var screenShareButton: some View {
        prominentButton(
            client.isScreenSharing ? "Screen share on" : "Screen share off",
            identifier: "screen-share",
            disabled: client.peerStatus != .connected
        ) {
            notice = ""
            Task {
                await setScreenShare(client: client, notice: $notice)
            }
        }
    }

    var mirrorButton: some View {
        prominentButton(mirrored ? "Mirror on" : "Mirror off", identifier: "mirror") {
            mirrored.toggle()
        }
    }

    var containButton: some View {
        prominentButton("Contain", identifier: "contain") {
            cover = false
        }
    }

    var coverButton: some View {
        prominentButton("Cover", identifier: "cover") {
            cover = true
        }
    }

    var audioButton: some View {
        let name = client.currentAudioOutput?.name ?? "Audio"
        return prominentButton("Audio: \(name)", identifier: "audio") {
            audioDialog = true
        }
    }

    func applyAudioOverride(_ output: AudioOutputOverride) {
        notice = ""
        do {
            try client.overrideAudioOutput(output)
        } catch {
            notice = error.localizedDescription
        }
    }

    var settingsButton: some View {
        prominentButton("Open Settings", identifier: "settings") {
            guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
            UIApplication.shared.open(url)
        }
    }

    func applyConnectionToast() {
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

    func prominentButton(
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

extension JoinView {
    func leave() {
        if client.isScreenSharing {
            // Closing the socket here makes the extension show an error dialog.
            // The system sheet ends the broadcast cleanly. Tap Leave again after.
            notice = "Stop the broadcast, then tap Leave again"
            _ = presentBroadcastPicker(
                extensionBundleId: client.screenShareConfig?.extensionBundleId
            )
            return
        }
        notice = ""
        // Clear this before leaveRoom, so the Idle status that follows
        // is not treated as an unexpected disconnect.
        hasJoinedCall = false
        connectionToast = nil
        toastDismiss?.cancel()
        toastDismiss = nil
        client.leaveRoom()
    }

    /// Applies the mute and end buttons of the system call UI.
    func handleCallKitEvents() async {
        for await event in CallKit.shared.events {
            switch event {
            case .muted(let muted):
                guard muted == client.isMicrophoneOn else { continue }
                await setMicrophone(client: client, notice: $notice)
            case .ended(.local):
                if client.peerStatus != .idle {
                    leave()
                }
            default:
                break
            }
        }
    }

    @ViewBuilder
    func cameraLimits(trackId: String) -> some View {
        Button(showCameraLimits ? "Hide camera limits" : "Show camera limits") {
            showCameraLimits.toggle()
        }
        .buttonStyle(.bordered)
        .accessibilityIdentifier("camera-limits-toggle")
        if showCameraLimits {
            Text("Now sending low \(sendingLow) kb/s, medium \(sendingMedium) kb/s, high \(sendingHigh) kb/s")
                .accessibilityIdentifier("camera-limits-now")
            TextField("Low kb/s", text: $lowKbps)
                .exampleTextField(focused: $focusedField, field: .lowKbps, identifier: "camera-limit-low")
                .keyboardType(.numberPad)
            TextField("Medium kb/s", text: $mediumKbps)
                .exampleTextField(focused: $focusedField, field: .mediumKbps, identifier: "camera-limit-medium")
                .keyboardType(.numberPad)
            TextField("High kb/s", text: $highKbps)
                .exampleTextField(focused: $focusedField, field: .highKbps, identifier: "camera-limit-high")
                .keyboardType(.numberPad)
            Button("Set layers") {
                focusedField = nil
                guard let low = Int(lowKbps), let medium = Int(mediumKbps), let high = Int(highKbps),
                      low >= 0, medium >= 0, high >= 0
                else {
                    notice = "Enter a kb/s number for each layer"
                    return
                }
                notice = ""
                do {
                    try client.setTrackBandwidth(
                        trackId: trackId,
                        limit: .layers(lowKbps: low, mediumKbps: medium, highKbps: high)
                    )
                    sendingLow = low
                    sendingMedium = medium
                    sendingHigh = high
                } catch {
                    notice = error.localizedDescription
                }
            }
            .buttonStyle(.bordered)
            .accessibilityIdentifier("set-layers")
        }
    }

    @ViewBuilder
    var roomVideos: some View {
        let objectFit: ObjectFit = cover ? .cover : .contain
        if let local = client.roomState.localPeer {
            TrackBox(
                name: peerDisplayName(local),
                nameIdentifier: "local-name",
                speaking: client.voiceActivity[local.id] == true
            ) {
                if let camera = local.cameraTrack {
                    if let video = camera.videoTrack {
                        VideoView(track: video, mirror: client.currentCamera?.front == true, objectFit: objectFit)
                            .frame(maxWidth: .infinity)
                            .frame(height: 200)
                            .background(Color.black)
                            .accessibilityIdentifier("local-video")
                    }
                    if !camera.trackId.isEmpty {
                        cameraLimits(trackId: camera.trackId)
                    }
                }
                if let screen = local.screenShareVideoTrack {
                    if let video = screen.videoTrack {
                        ScreenShareVideo(track: video, identifier: "local-screen-share")
                    }
                    if !screen.trackId.isEmpty {
                        ScreenShareRate(
                            client: client,
                            trackId: screen.trackId,
                            webrtcTrackId: screen.videoTrack?.trackId,
                            sent: true
                        )
                    }
                }
            }
        }
        ForEach(client.roomState.remotePeers, id: \.id) { peer in
            TrackBox(
                name: peerDisplayName(peer),
                nameIdentifier: "remote-name",
                speaking: client.voiceActivity[peer.id] == true
            ) {
                if let screen = peer.screenShareVideoTrack {
                    if let video = screen.videoTrack {
                        ScreenShareVideo(track: video, identifier: "remote-screen-share")
                    }
                    if !screen.trackId.isEmpty {
                        ScreenShareRate(
                            client: client,
                            trackId: screen.trackId,
                            webrtcTrackId: screen.videoTrack?.trackId,
                            sent: false
                        )
                    }
                }
                if let camera = peer.cameraTrack {
                    if let video = camera.videoTrack {
                        VideoView(track: video, mirror: mirrored, objectFit: objectFit)
                            .frame(maxWidth: .infinity)
                            .frame(height: 200)
                            .background(Color.black)
                            .accessibilityIdentifier("remote-video")
                    }
                    HStack(spacing: 4) {
                        Text("Received variant:")
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .frame(minWidth: 0, alignment: .leading)
                        Text(variantLabel(camera.encoding))
                            .lineLimit(1)
                            .fixedSize(horizontal: true, vertical: false)
                            .accessibilityIdentifier("variant")
                        if !camera.trackId.isEmpty {
                            HStack(spacing: 0) {
                                ReceivedRate(client: client, trackId: camera.trackId)
                                Text(",")
                            }
                            .fixedSize(horizontal: true, vertical: false)
                        }
                        Text("Set variant:")
                            .lineLimit(1)
                            .fixedSize(horizontal: true, vertical: false)
                        ForEach([Variant.low, Variant.medium, Variant.high], id: \.self) { variant in
                            Button(variantLetter(variant)) {
                                notice = ""
                                do {
                                    try client.setReceivedQuality(trackId: camera.trackId, variant: variant)
                                } catch {
                                    notice = error.localizedDescription
                                }
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.mini)
                            .fixedSize()
                            .accessibilityIdentifier("quality-\(qualityId(variant))")
                        }
                    }
                    .font(.caption)
                }
            }
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
