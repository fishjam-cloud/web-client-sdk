import AVFoundation
import Foundation
import WebRTC

enum MediaError: LocalizedError {
    case cameraPermission
    case microphonePermission
    case noCamera

    var errorDescription: String? {
        switch self {
        case .cameraPermission:
            return "CAMERA permission is required"
        case .microphonePermission:
            return "RECORD_AUDIO permission is required"
        case .noCamera:
            return "No camera found"
        }
    }
}

final class MediaSession: NSObject, RTCPeerConnectionDelegate {
    private let queue = DispatchQueue(label: "fishjam-pc")
    let mediaLock = NSLock()
    let call: (Fishjam_Sdk_SdkRequest.OneOf_Content) -> Void
    let onMediaChanged: () -> Void

    var media: [String: RTCMediaStreamTrack] = [:]
    var fishjamIdByWebrtcId: [String: String] = [:]
    var midToTrackId: [String: String] = [:]
    var pendingRemote: [String: RTCMediaStreamTrack] = [:]
    private var factory: RTCPeerConnectionFactory?
    var connection: RTCPeerConnection?
    private var capturer: RTCCameraVideoCapturer?
    private var localVideo: RTCVideoTrack?
    private var localAudio: RTCAudioTrack?
    private var stopped = false

    init(
        call: @escaping (Fishjam_Sdk_SdkRequest.OneOf_Content) -> Void,
        onMediaChanged: @escaping () -> Void
    ) {
        self.call = call
        self.onMediaChanged = onMediaChanged
        super.init()
    }

    func mediaSnapshot() -> [String: RTCMediaStreamTrack] {
        mediaLock.lock()
        defer { mediaLock.unlock() }
        return media
    }

    func handle(_ event: Fishjam_Sdk_SdkEvent) {
        enqueue { self.handleOnQueue(event) }
    }

    func startCamera() async throws -> VideoTrack {
        guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
            throw MediaError.cameraPermission
        }
        return try await withCheckedThrowingContinuation { continuation in
            self.enqueue {
                do {
                    continuation.resume(returning: try self.startCameraOnQueue())
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    func startMicrophone() async throws -> AudioTrack {
        guard AVAudioSession.sharedInstance().recordPermission == .granted else {
            throw MediaError.microphonePermission
        }
        return try await withCheckedThrowingContinuation { continuation in
            self.enqueue {
                do {
                    continuation.resume(returning: try self.startMicrophoneOnQueue())
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    func bind(trackId: String, track: RTCMediaStreamTrack) {
        mediaLock.lock()
        media[trackId] = track
        fishjamIdByWebrtcId[track.trackId] = trackId
        mediaLock.unlock()
        onMediaChanged()
    }

    func close() {
        queue.sync {
            stopped = true
            capturer?.stopCapture()
            connection?.close()
            connection = nil
            localVideo = nil
            localAudio = nil
        }
    }

    func forgetCallMediaOnQueue() {
        mediaLock.lock()
        media.removeAll()
        fishjamIdByWebrtcId.removeAll()
        mediaLock.unlock()
        midToTrackId.removeAll()
        pendingRemote.removeAll()
        onMediaChanged()
    }

    func enqueue(_ work: @escaping () -> Void) {
        queue.async {
            guard !self.stopped else { return }
            work()
        }
    }

    private func handleOnQueue(_ event: Fishjam_Sdk_SdkEvent) {
        switch event.content {
        case .createPeerConnection(let request):
            openPeerConnection(request)
        case .updateRecvonlyTransceivers(let update):
            updateRecvonly(update)
        case .addSendonlyTransceiver(let request):
            addSendonly(request)
        case .removeSendTrack(let request):
            removeSend(request.trackID)
        case .createOffer:
            createOffer()
        case .setLocalDescription(let description):
            setLocal(description)
        case .setRemoteDescription(let description):
            setRemote(description)
        case .addIceCandidate(let candidate):
            addRemoteCandidate(candidate)
        case .closePeerConnection:
            closePeerConnection()
        default:
            return
        }
    }

    private func ensureFactory() -> RTCPeerConnectionFactory {
        if let factory {
            return factory
        }
        let audioSession = RTCAudioSession.sharedInstance()
        audioSession.useManualAudio = true
        audioSession.isAudioEnabled = false
        RTCPeerConnectionFactory.initialize()
        let encoder = RTCDefaultVideoEncoderFactory()
        let decoder = RTCDefaultVideoDecoderFactory()
        let created = RTCPeerConnectionFactory(encoderFactory: encoder, decoderFactory: decoder)
        factory = created
        return created
    }

    private func startCameraOnQueue() throws -> VideoTrack {
        if let localVideo {
            return localVideo
        }
        guard let device = cameraDevice() else {
            throw MediaError.noCamera
        }
        let formats = RTCCameraVideoCapturer.supportedFormats(for: device)
        guard let format = cameraFormat(from: formats) else {
            throw MediaError.noCamera
        }
        let source = ensureFactory().videoSource()
        let created = RTCCameraVideoCapturer(delegate: source)
        let track = ensureFactory().videoTrack(with: source, trackId: UUID().uuidString)
        track.isEnabled = true
        created.startCapture(with: device, format: format.format, fps: format.fps)
        capturer = created
        localVideo = track
        return track
    }

    private func startMicrophoneOnQueue() throws -> AudioTrack {
        if let localAudio {
            return localAudio
        }
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        let source = ensureFactory().audioSource(with: constraints)
        let track = ensureFactory().audioTrack(with: source, trackId: UUID().uuidString)
        track.isEnabled = true
        localAudio = track
        enableAudio()
        return track
    }

    private func openPeerConnection(_ request: Fishjam_Sdk_CreatePeerConnection) {
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

    private func updateRecvonly(_ update: Fishjam_Sdk_UpdateRecvonlyTransceivers) {
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

    private func addRecvonly(_ kind: RTCRtpMediaType, on connection: RTCPeerConnection) {
        let setup = RTCRtpTransceiverInit()
        setup.direction = .recvOnly
        connection.addTransceiver(of: kind, init: setup)
    }

    private func addSendonly(_ request: Fishjam_Sdk_AddSendonlyTransceiver) {
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

    private func encoding(from encoding: Fishjam_Sdk_SendEncoding) -> RTCRtpEncodingParameters {
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

    private func removeSend(_ trackId: String) {
        guard let connection else { return }
        mediaLock.lock()
        let track = media.removeValue(forKey: trackId)
        if let track {
            fishjamIdByWebrtcId.removeValue(forKey: track.trackId)
        }
        mediaLock.unlock()
        guard let track else { return }
        connection.transceivers.first { $0.sender.track?.trackId == track.trackId }?.stopInternal()
        onMediaChanged()
    }
}
