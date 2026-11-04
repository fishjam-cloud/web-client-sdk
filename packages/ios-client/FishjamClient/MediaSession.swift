import AVFoundation
import Foundation
import WebRTC

enum MediaError: LocalizedError, Equatable {
    case cameraPermission
    case microphonePermission
    case noCamera
    case cameraFailed(String)

    var errorDescription: String? {
        switch self {
        case .cameraPermission:
            return "CAMERA permission is required"
        case .microphonePermission:
            return "RECORD_AUDIO permission is required"
        case .noCamera:
            return "No camera found"
        case .cameraFailed(let message):
            return message
        }
    }
}

struct OpenedCamera {
    let track: VideoTrack
    let device: CameraDevice
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
    private var currentDeviceId: String?
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

    func startCamera(
        generation: Int,
        deviceId: String?,
        isCurrent: @escaping () -> Bool
    ) async throws -> OpenedCamera? {
        guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
            throw MediaError.cameraPermission
        }
        return try await withCheckedThrowingContinuation { continuation in
            queue.async {
                guard !self.stopped, generation == self.readGeneration(), isCurrent() else {
                    continuation.resume(returning: nil)
                    return
                }
                do {
                    continuation.resume(returning: try self.startCameraOnQueue(deviceId: deviceId))
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    /// Changes the open camera. The same video track stays on the sender.
    /// A finished capture generation is ignored, including a switch error.
    func switchCamera(generation: Int, deviceId: String) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            queue.async {
                guard !self.stopped, generation == self.readGeneration() else {
                    continuation.resume()
                    return
                }
                do {
                    try self.switchCameraOnQueue(generation: generation, deviceId: deviceId)
                    continuation.resume()
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    func startMicrophone(generation: Int, isCurrent: @escaping () -> Bool) async throws -> AudioTrack? {
        guard AVAudioSession.sharedInstance().recordPermission == .granted else {
            throw MediaError.microphonePermission
        }
        return try await withCheckedThrowingContinuation { continuation in
            queue.async {
                guard !self.stopped, generation == self.readGeneration(), isCurrent() else {
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

    func stopCamera(generation: Int) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            queue.async {
                if !self.stopped, generation == self.readGeneration() {
                    self.stopCameraOnQueue()
                }
                continuation.resume()
            }
        }
    }

    func stopMicrophone(generation: Int) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            queue.async {
                if !self.stopped, generation == self.readGeneration() {
                    self.releaseMicrophoneTrackOnQueue()
                }
                continuation.resume()
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
        queue.sync {
            guard !stopped, generation == readGeneration() else { return }
            guard track === localVideo || track === localAudio else { return }
            mediaLock.lock()
            media[trackId] = track
            fishjamIdByWebrtcId[track.trackId] = trackId
            mediaLock.unlock()
            onMediaChanged()
        }
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
        if let track = localVideo {
            stopSender(track)
            track.isEnabled = false
            removeLocalTrack(track)
        }
        localVideo = nil
        currentDeviceId = nil
    }

    private func stopMicrophoneOnQueue() {
        releaseMicrophoneTrackOnQueue()
        disableAudio()
    }

    private func releaseMicrophoneTrackOnQueue() {
        if let track = localAudio {
            stopSender(track)
            track.isEnabled = false
            removeLocalTrack(track)
        }
        localAudio = nil
    }

    private func stopSender(_ track: RTCMediaStreamTrack) {
        guard let connection else { return }
        for transceiver in connection.transceivers where transceiver.sender.track?.trackId == track.trackId {
            connection.removeTrack(transceiver.sender)
        }
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

    private func startCameraOnQueue(deviceId: String?) throws -> OpenedCamera {
        if let localVideo {
            guard let device = currentCameraDevice() else {
                throw MediaError.noCamera
            }
            return OpenedCamera(track: localVideo, device: device)
        }
        let device = try resolveCamera(deviceId: deviceId)
        let source = ensureFactory().videoSource()
        let created = RTCCameraVideoCapturer(delegate: source)
        try beginCapture(on: created, device: device)
        let track = ensureFactory().videoTrack(with: source, trackId: UUID().uuidString)
        track.isEnabled = true
        capturer = created
        localVideo = track
        currentDeviceId = device.uniqueID
        return OpenedCamera(track: track, device: try requireListedCamera(cameraDevices(), deviceId: device.uniqueID))
    }

    private func switchCameraOnQueue(generation: Int, deviceId: String) throws {
        let device = try requireListedCamera(cameraDevices(), deviceId: deviceId)
        guard let capturer else {
            throw MediaError.noCamera
        }
        if currentDeviceId == device.deviceId {
            return
        }
        guard let captureDevice = captureDeviceList().first(where: { $0.uniqueID == device.deviceId }) else {
            throw MediaError.noCamera
        }
        do {
            try beginCapture(on: capturer, device: captureDevice)
        } catch {
            if generation != readGeneration() || stopped {
                return
            }
            throw error
        }
        guard generation == readGeneration(), !stopped else {
            return
        }
        currentDeviceId = device.deviceId
    }

    private func currentCameraDevice() -> CameraDevice? {
        guard let currentDeviceId else {
            return nil
        }
        return cameraDevices().first { $0.deviceId == currentDeviceId }
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
