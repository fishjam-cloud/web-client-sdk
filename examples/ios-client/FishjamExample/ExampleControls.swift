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
                    token = try await fetchPeerToken(roomName: roomName, peerName: peerName)
                } catch {
                    notice = error.localizedDescription
                }
            }
        }
    }

    var actionButtons: [AnyView] {
        [
            AnyView(joinButton),
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

    var joinButton: some View {
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

    var leaveButton: some View {
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
