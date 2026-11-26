import Foundation
import WebRTC

extension MediaSession {
    func openPeerConnection(iceServers servers: [CoreIceServer]) {
        guard connection == nil else { return }
        let iceServers = servers.map { server in
            RTCIceServer(urlStrings: server.urls, username: server.username, credential: server.credential)
        }
        let config = RTCConfiguration()
        config.iceServers = iceServers
        config.bundlePolicy = .maxBundle
        config.iceTransportPolicy = .all
        config.sdpSemantics = .unifiedPlan
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        connection = ensureFactory().peerConnection(with: config, constraints: constraints, delegate: self)
    }

    func updateRecvonly(videoToAdd: Int32, audioToAdd: Int32, midsToStop: [String]) {
        guard let connection else { return }
        for mid in midsToStop {
            connection.transceivers.first { $0.mid == mid }?.stopInternal()
        }
        for _ in 0..<Int(videoToAdd) {
            addRecvonly(.video, on: connection)
        }
        for _ in 0..<Int(audioToAdd) {
            addRecvonly(.audio, on: connection)
        }
    }

    func addRecvonly(_ kind: RTCRtpMediaType, on connection: RTCPeerConnection) {
        let setup = RTCRtpTransceiverInit()
        setup.direction = .recvOnly
        connection.addTransceiver(of: kind, init: setup)
    }

    func addSendonly(trackId: String, sendEncodings: [CoreSendEncoding]) {
        guard let connection else { return }
        mediaLock.lock()
        let track = media[trackId]
        mediaLock.unlock()
        guard let track else { return }
        let setup = RTCRtpTransceiverInit()
        setup.direction = .sendOnly
        setup.streamIds = [track.trackId]
        setup.sendEncodings = sendEncodings.map(encoding(from:))
        if let transceiver = connection.addTransceiver(with: track, init: setup) {
            mediaLock.lock()
            senderByTrackId[trackId] = transceiver.sender
            mediaLock.unlock()
        }
    }

    func updateSendEncodings(trackId: String, sendEncodings: [CoreSendEncoding]) {
        guard let connection else { return }
        mediaLock.lock()
        let track = media[trackId]
        mediaLock.unlock()
        guard let track else { return }
        guard let transceiver = connection.transceivers.first(where: {
            $0.sender.track?.trackId == track.trackId
        }) else {
            return
        }
        let sender = transceiver.sender
        let parameters = sender.parameters
        if parameters.encodings.isEmpty {
            parameters.encodings = sendEncodings.map(encoding(from:))
        } else {
            for requested in sendEncodings {
                let target = parameters.encodings.first { $0.rid == requested.rid }
                    ?? (requested.rid.isEmpty ? parameters.encodings.first : nil)
                guard let target else { continue }
                target.isActive = requested.active
                if requested.scaleResolutionDownBy > 0 {
                    target.scaleResolutionDownBy = NSNumber(value: requested.scaleResolutionDownBy)
                }
                if requested.maxBitrate > 0 {
                    target.maxBitrateBps = NSNumber(value: requested.maxBitrate)
                } else {
                    target.maxBitrateBps = nil
                }
            }
        }
        sender.parameters = parameters
    }

    func encoding(from encoding: CoreSendEncoding) -> RTCRtpEncodingParameters {
        let parameters = RTCRtpEncodingParameters()
        parameters.rid = encoding.rid
        parameters.isActive = encoding.active
        if encoding.scaleResolutionDownBy > 0 {
            parameters.scaleResolutionDownBy = NSNumber(value: encoding.scaleResolutionDownBy)
        }
        if encoding.maxBitrate > 0 {
            parameters.maxBitrateBps = NSNumber(value: encoding.maxBitrate)
        }
        return parameters
    }

    /// Puts `track` on the sender of `trackId` in place of the current media. The track id does not change.
    /// When the sender does not exist yet, the new media is used when it is added.
    func replaceMedia(trackId: String, track: RTCMediaStreamTrack) {
        queue.sync {
            mediaLock.lock()
            if let previous = media[trackId] {
                fishjamIdByWebrtcId.removeValue(forKey: previous.trackId)
            }
            media[trackId] = track
            fishjamIdByWebrtcId[track.trackId] = trackId
            let sender = senderByTrackId[trackId]
            mediaLock.unlock()
            sender?.track = track
            onMediaChanged()
        }
    }

    func removeSend(_ trackId: String) {
        guard let connection else { return }
        mediaLock.lock()
        let track = media.removeValue(forKey: trackId)
        if let track {
            fishjamIdByWebrtcId.removeValue(forKey: track.trackId)
        }
        let sender = senderByTrackId.removeValue(forKey: trackId)
        mediaLock.unlock()
        // The media can already be gone, for example when the app stopped a custom track first.
        // The sender must still leave the connection, or the next offer keeps sending the track.
        if let sender {
            connection.removeTrack(sender)
        } else if let track {
            let transceiver = connection.transceivers.first { $0.sender.track?.trackId == track.trackId }
            if let transceiver {
                connection.removeTrack(transceiver.sender)
            }
        }
        onMediaChanged()
    }
}
