import Foundation
import WebRTC

extension MediaSession {
    func openPeerConnection(_ request: Fishjam_Sdk_CreatePeerConnection) {
        guard connection == nil else { return }
        let iceServers = request.iceServers.map { server in
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

    func updateRecvonly(_ update: Fishjam_Sdk_UpdateRecvonlyTransceivers) {
        guard let connection else { return }
        for mid in update.midsToStop {
            connection.transceivers.first { $0.mid == mid }?.stopInternal()
        }
        for _ in 0..<Int(update.videoToAdd) {
            addRecvonly(.video, on: connection)
        }
        for _ in 0..<Int(update.audioToAdd) {
            addRecvonly(.audio, on: connection)
        }
    }

    func addRecvonly(_ kind: RTCRtpMediaType, on connection: RTCPeerConnection) {
        let setup = RTCRtpTransceiverInit()
        setup.direction = .recvOnly
        connection.addTransceiver(of: kind, init: setup)
    }

    func addSendonly(_ request: Fishjam_Sdk_AddSendonlyTransceiver) {
        guard let connection else { return }
        mediaLock.lock()
        let track = media[request.trackID]
        mediaLock.unlock()
        guard let track else { return }
        let setup = RTCRtpTransceiverInit()
        setup.direction = .sendOnly
        setup.streamIds = [track.trackId]
        setup.sendEncodings = request.sendEncodings.map(encoding(from:))
        connection.addTransceiver(with: track, init: setup)
    }

    func encoding(from encoding: Fishjam_Sdk_SendEncoding) -> RTCRtpEncodingParameters {
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

    func removeSend(_ trackId: String) {
        guard let connection else { return }
        mediaLock.lock()
        let track = media.removeValue(forKey: trackId)
        if let track {
            fishjamIdByWebrtcId.removeValue(forKey: track.trackId)
        }
        mediaLock.unlock()
        guard let track else { return }
        if let transceiver = connection.transceivers.first(where: { $0.sender.track?.trackId == track.trackId }) {
            connection.removeTrack(transceiver.sender)
        }
        onMediaChanged()
    }
}
