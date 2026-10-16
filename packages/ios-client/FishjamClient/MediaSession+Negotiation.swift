import Foundation
import WebRTC

extension MediaSession {
    func createOffer() {
        guard let connection else { return }
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        connection.offer(for: constraints) { description, error in
            if let error {
                NSLog("Fishjam createOffer failed: %@", error.localizedDescription)
                return
            }
            guard let description else { return }
            self.enqueue {
                var result = Fishjam_Sdk_CreateOfferResult()
                result.sdp = description.sdp
                self.call(.createOfferResult(result))
            }
        }
    }

    func setLocal(_ description: Fishjam_Sdk_SetLocalDescription) {
        guard let connection else { return }
        let type: RTCSdpType = description.type == .answer ? .answer : .offer
        let session = RTCSessionDescription(type: type, sdp: description.sdp)
        connection.setLocalDescription(session) { error in
            if let error {
                NSLog("Fishjam setLocalDescription failed: %@", error.localizedDescription)
                return
            }
            self.enqueue { self.reportLocalMids(connection) }
        }
    }

    private func reportLocalMids(_ connection: RTCPeerConnection) {
        var mids: [String: String] = [:]
        for transceiver in connection.transceivers {
            let mid = transceiver.mid
            guard !mid.isEmpty, let webrtcId = transceiver.sender.track?.trackId else {
                continue
            }
            mediaLock.lock()
            let trackId = fishjamIdByWebrtcId[webrtcId]
            mediaLock.unlock()
            if let trackId {
                mids[mid] = trackId
            }
        }
        var result = Fishjam_Sdk_SetLocalDescriptionResult()
        result.midToTrackID = mids
        call(.setLocalDescriptionResult(result))
    }

    func setRemote(_ description: Fishjam_Sdk_SetRemoteDescription) {
        guard let connection else { return }
        midToTrackId.merge(description.midToTrackID) { _, new in new }
        for (mid, trackId) in description.midToTrackID {
            if let track = pendingRemote.removeValue(forKey: mid) {
                rememberRemote(trackId: trackId, track: track)
            }
        }
        let type: RTCSdpType = description.type == .answer ? .answer : .offer
        let session = RTCSessionDescription(type: type, sdp: description.sdp)
        connection.setRemoteDescription(session) { error in
            if let error {
                NSLog("Fishjam setRemoteDescription failed: %@", error.localizedDescription)
                return
            }
            self.enqueue {
                self.call(.setRemoteDescriptionResult(Fishjam_Sdk_SetRemoteDescriptionResult()))
            }
        }
    }

    func addRemoteCandidate(_ candidate: Fishjam_Sdk_AddIceCandidate) {
        guard let connection else { return }
        let ice = RTCIceCandidate(
            sdp: candidate.candidate,
            sdpMLineIndex: candidate.sdpMLineIndex,
            sdpMid: candidate.sdpMid
        )
        connection.add(ice) { error in
            if let error {
                NSLog("Fishjam addIceCandidate failed: %@", error.localizedDescription)
            }
            self.enqueue {
                self.call(.addIceCandidateResult(Fishjam_Sdk_AddIceCandidateResult()))
            }
        }
    }

    func closePeerConnection() {
        forgetCallMediaOnQueue()
        connection?.close()
        connection = nil
    }

    private func rememberRemote(trackId: String, track: RTCMediaStreamTrack) {
        mediaLock.lock()
        media[trackId] = track
        mediaLock.unlock()
        onMediaChanged()
        if track is RTCAudioTrack {
            enableAudio()
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}

    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        reportState(connection: peerConnection, ice: iceName(newState))
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        guard !candidate.sdp.isEmpty else { return }
        enqueue {
            var message = Fishjam_Sdk_LocalIceCandidate()
            message.candidate = candidate.sdp
            message.sdpMid = candidate.sdpMid ?? ""
            message.sdpMLineIndex = candidate.sdpMLineIndex
            self.call(.localIceCandidate(message))
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCPeerConnectionState) {
        reportState(connection: peerConnection, connectionState: connectionName(newState))
    }

    func peerConnection(
        _ peerConnection: RTCPeerConnection,
        didStartReceivingOn transceiver: RTCRtpTransceiver
    ) {
        let mid = transceiver.mid
        guard !mid.isEmpty, let track = transceiver.receiver.track else { return }
        enqueue {
            if let trackId = self.midToTrackId[mid] {
                self.rememberRemote(trackId: trackId, track: track)
            } else {
                self.pendingRemote[mid] = track
            }
            var ready = Fishjam_Sdk_RemoteTrackReady()
            ready.mid = mid
            self.call(.remoteTrackReady(ready))
        }
    }

    private func reportState(
        connection: RTCPeerConnection,
        connectionState: String? = nil,
        ice: String? = nil
    ) {
        let connectionValue = connectionState ?? connectionName(connection.connectionState)
        let iceValue = ice ?? iceName(connection.iceConnectionState)
        enqueue {
            var message = Fishjam_Sdk_PeerConnectionStateChanged()
            message.connectionState = connectionValue
            message.iceConnectionState = iceValue
            self.call(.peerConnectionStateChanged(message))
        }
    }

    private func connectionName(_ state: RTCPeerConnectionState) -> String {
        switch state {
        case .new:
            return "new"
        case .connecting:
            return "connecting"
        case .connected:
            return "connected"
        case .disconnected:
            return "disconnected"
        case .failed:
            return "failed"
        case .closed:
            return "closed"
        @unknown default:
            return ""
        }
    }

    private func iceName(_ state: RTCIceConnectionState) -> String {
        switch state {
        case .new:
            return "new"
        case .checking:
            return "checking"
        case .connected:
            return "connected"
        case .completed:
            return "completed"
        case .failed:
            return "failed"
        case .disconnected:
            return "disconnected"
        case .closed:
            return "closed"
        case .count:
            return ""
        @unknown default:
            return ""
        }
    }
}
