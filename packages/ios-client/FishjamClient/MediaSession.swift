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
    private let generationLock = NSLock()
    private var acceptedGeneration = 0
    var audioActive = false
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

    func startCamera(generation: Int) async throws -> VideoTrack? {
        guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
            throw MediaError.cameraPermission
        }
        return try await withCheckedThrowingContinuation { continuation in
            queue.async {
                guard !self.stopped, generation == self.readGeneration() else {
                    continuation.resume(returning: nil)
                    return
                }
                do {
                    continuation.resume(returning: try self.startCameraOnQueue())
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    func startMicrophone(generation: Int) async throws -> AudioTrack? {
        guard AVAudioSession.sharedInstance().recordPermission == .granted else {
            throw MediaError.microphonePermission
        }
        return try await withCheckedThrowingContinuation { continuation in
            queue.async {
                guard !self.stopped, generation == self.readGeneration() else {
                    continuation.resume(returning: nil)
                    return
                }
                do {
                    continuation.resume(returning: try self.startMicrophoneOnQueue())
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    func releaseLocalDevices(generation: Int) {
        queue.async {
            guard !self.stopped else { return }
            self.writeGeneration(generation)
            self.closePeerConnection()
            self.stopCameraOnQueue()
            self.stopMicrophoneOnQueue()
        }
    }

    func bind(trackId: String, track: RTCMediaStreamTrack, generation: Int) {
        guard generation == readGeneration() else { return }
        mediaLock.lock()
        media[trackId] = track
        fishjamIdByWebrtcId[track.trackId] = trackId
        mediaLock.unlock()
        onMediaChanged()
    }

    func close() {
        queue.sync {
            stopped = true
            writeGeneration(-1)
            stopCameraOnQueue()
            stopMicrophoneOnQueue()
            connection?.close()
            connection = nil
            mediaLock.lock()
            media.removeAll()
            fishjamIdByWebrtcId.removeAll()
            mediaLock.unlock()
            midToTrackId.removeAll()
            pendingRemote.removeAll()
        }
    }

    private func stopCameraOnQueue() {
        let current = capturer
        capturer = nil
        if let current {
            let done = DispatchSemaphore(value: 0)
            current.stopCapture {
                done.signal()
            }
            _ = done.wait(timeout: .now() + 2)
        }
        localVideo?.isEnabled = false
        if let track = localVideo {
            removeLocalTrack(track)
        }
        localVideo = nil
    }

    private func stopMicrophoneOnQueue() {
        localAudio?.isEnabled = false
        if let track = localAudio {
            removeLocalTrack(track)
        }
        localAudio = nil
        disableAudio()
    }

    private func readGeneration() -> Int {
        generationLock.lock()
        defer { generationLock.unlock() }
        return acceptedGeneration
    }

    private func writeGeneration(_ generation: Int) {
        generationLock.lock()
        acceptedGeneration = generation
        generationLock.unlock()
    }

    private func removeLocalTrack(_ track: RTCMediaStreamTrack) {
        mediaLock.lock()
        let ids = media.compactMap { key, value in value === track ? key : nil }
        for id in ids {
            media.removeValue(forKey: id)
        }
        fishjamIdByWebrtcId.removeValue(forKey: track.trackId)
        mediaLock.unlock()
    }

    /// Drops received tracks. Local tracks stay: a reconnect closes this
    /// connection and opens another, and the new one still sends those tracks.
    func dropRemoteMediaOnQueue() {
        mediaLock.lock()
        let localIds = Set(fishjamIdByWebrtcId.values)
        media = media.filter { localIds.contains($0.key) }
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

    func ensureFactory() -> RTCPeerConnectionFactory {
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
}
