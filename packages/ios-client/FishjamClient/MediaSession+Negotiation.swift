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
                self.core()?.createOfferResult(sdp: description.sdp)
            }
        }
    }

    func setLocal(type: CoreSdpType, sdp: String) {
        guard let connection else { return }
        let session = RTCSessionDescription(type: type == .answer ? .answer : .offer, sdp: sdp)
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
        core()?.setLocalDescriptionResult(midToTrackId: mids)
    }

    func setRemote(type: CoreSdpType, sdp: String, midToTrackId mids: [String: String]) {
        guard let connection else { return }
        midToTrackId.merge(mids) { _, new in new }
        for (mid, trackId) in mids {
            if let track = pendingRemote.removeValue(forKey: mid) {
                rememberRemote(
                    trackId: trackId,
                    track: track,
                    receiver: pendingReceiver.removeValue(forKey: mid)
                )
            }
        }
        let session = RTCSessionDescription(type: type == .answer ? .answer : .offer, sdp: sdp)
        connection.setRemoteDescription(session) { error in
            if let error {
                NSLog("Fishjam setRemoteDescription failed: %@", error.localizedDescription)
                return
            }
            self.enqueue {
                self.attachRemoteReceivers(connection)
                self.core()?.setRemoteDescriptionResult()
            }
        }
    }

    func addRemoteCandidate(_ candidate: String, sdpMid: String, sdpMLineIndex: Int32) {
        guard let connection else { return }
        let ice = RTCIceCandidate(sdp: candidate, sdpMLineIndex: sdpMLineIndex, sdpMid: sdpMid)
        connection.add(ice) { error in
            if let error {
                NSLog("Fishjam addIceCandidate failed: %@", error.localizedDescription)
            }
            self.enqueue {
                self.core()?.addIceCandidateResult()
            }
        }
    }

    func closePeerConnection() {
        dropRemoteMediaOnQueue()
        connection?.close()
        connection = nil
    }

    /// The same receive transceiver is reused when a peer leaves and comes
    /// back, and `didStartReceivingOn` does not run again. The receiver's
    /// track is still the one carrying the new camera, so attach it here.
    private func attachRemoteReceivers(_ connection: RTCPeerConnection) {
        for transceiver in connection.transceivers {
            switch transceiver.direction {
            case .recvOnly, .sendRecv:
                break
            default:
                continue
            }
            let mid = transceiver.mid
            guard !mid.isEmpty, let trackId = midToTrackId[mid], let track = transceiver.receiver.track else {
                continue
            }
            mediaLock.lock()
            let local = fishjamIdByWebrtcId.values.contains(trackId)
            mediaLock.unlock()
            if local { continue }
            rememberRemote(trackId: trackId, track: track, receiver: transceiver.receiver)
        }
    }

    private func rememberRemote(
        trackId: String,
        track: RTCMediaStreamTrack,
        receiver: RTCRtpReceiver? = nil
    ) {
        mediaLock.lock()
        media[trackId] = track
        if let receiver {
            receiverByTrackId[trackId] = receiver
        }
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
            self.core()?.localIceCandidate(
                candidate: candidate.sdp,
                sdpMid: candidate.sdpMid ?? "",
                sdpMLineIndex: candidate.sdpMLineIndex,
                usernameFragment: ""
            )
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
        let receiver = transceiver.receiver
        guard !mid.isEmpty, let track = receiver.track else { return }
        enqueue {
            if let trackId = self.midToTrackId[mid] {
                self.rememberRemote(trackId: trackId, track: track, receiver: receiver)
            } else {
                self.pendingRemote[mid] = track
                self.pendingReceiver[mid] = receiver
            }
            self.core()?.remoteTrackReady(mid: mid)
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
            self.core()?.peerConnectionStateChanged(
                connectionState: connectionValue,
                iceConnectionState: iceValue
            )
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
