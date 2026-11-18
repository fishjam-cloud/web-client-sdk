import AVFoundation
import Combine
import Foundation
import WebRTC

/// Why a livestream could not be played.
public enum LivestreamError: Error, Equatable {
    /// The viewer token was rejected (HTTP 401).
    case unauthorized
    /// There is no such stream (HTTP 404).
    case streamNotFound
    /// Any other failure, including network errors and timeouts.
    case unknownError
}

/// What to play: a private stream by viewer token, or a public stream by its id.
public enum ConnectViewerConfig: Equatable {
    case token(String)
    case streamId(String)
}

private let iceGatheringTimeout: TimeInterval = 3
private let firstTrackTimeout: TimeInterval = 10

/// Plays a WHEP livestream, independent of any room connection.
///
/// Call `connect(_:url:)` with a viewer token (private stream) or a stream id (public stream), then show
/// `videoTrack` with `VideoView`. Audio plays on its own. If the connection drops after it was established, the viewer
/// disconnects. Call `disconnect()` when the screen goes away.
///
/// On a device the viewer uses the same call audio session as a room, with the speaker on. WebRTC's audio unit
/// does not play through a media-only session.
@MainActor
public final class LivestreamViewer: ObservableObject {
    /// The received video, once the first track has arrived. `nil` when not connected.
    @Published public private(set) var videoTrack: VideoTrack?
    /// `true` while the peer connection is connected.
    @Published public private(set) var isConnected = false
    /// The error of the last `connect`, or `nil`. Cleared when the next `connect` starts.
    @Published public private(set) var error: LivestreamError?

    private let baseUrl: String
    private let debug: Bool
    private let signaling = WhepSignaling()
    private var factory: RTCPeerConnectionFactory?
    private var session: Session?

    nonisolated public init(fishjamId: String, debug: Bool = false) {
        do {
            baseUrl = try livestreamWhepBaseUrl(fishjamId)
        } catch {
            preconditionFailure("fishjamId is required to build a livestream WHEP URL.")
        }
        self.debug = debug
    }

    /// Starts playing and returns once the first remote track has arrived. Any stream played before is
    /// disconnected first. `url` replaces the WHEP endpoint that `config` would give.
    ///
    /// Throws `LivestreamError` and also publishes it in `error`. A `disconnect()` or another `connect` during
    /// connecting cancels the call with a `CancellationError`.
    public func connect(_ config: ConnectViewerConfig, url: String? = nil) async throws {
        stopCurrent()
        error = nil
        let target: Session
        do {
            target = try openSession(token: token(of: config))
        } catch {
            self.error = .unknownError
            throw LivestreamError.unknownError
        }
        do {
            try await negotiate(target, url: whepUrl(config, baseUrl: baseUrl, override: url))
        } catch is CancellationError {
            stop(target)
            throw CancellationError()
        } catch {
            throw failure(target, error)
        }
    }

    /// Stops the stream. Does nothing when nothing is playing.
    public func disconnect() {
        stopCurrent()
    }

    /// WebRTC stats of the connection. Empty when not connected.
    public func getStatistics() async -> [RtcStats] {
        guard let connection = session?.connection else { return [] }
        return await withCheckedContinuation { continuation in
            connection.statistics { report in
                continuation.resume(returning: rtcStats(from: report))
            }
        }
    }

    private func token(of config: ConnectViewerConfig) -> String? {
        if case .token(let token) = config { return token }
        return nil
    }

    private func log(_ message: String) {
        if debug { NSLog("[FISHJAM] livestream: %@", message) }
    }

    private func openSession(token: String?) throws -> Session {
        let factory = self.factory ?? makeFactory()
        self.factory = factory
        let config = RTCConfiguration()
        config.bundlePolicy = .maxBundle
        config.sdpSemantics = .unifiedPlan
        let target = Session(token: token)
        guard let connection = factory.peerConnection(
            with: config,
            constraints: RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil),
            delegate: target
        ) else {
            disablePlaybackAudio()
            throw LivestreamError.unknownError
        }
        target.connection = connection
        enablePlaybackAudio()
        target.onAudioTrack = { [weak self] target in
            Task { @MainActor in
                guard let self, self.session === target, !target.isStopped else { return }
                self.enablePlaybackAudio()
            }
        }
        target.onVideoTrack = { [weak self] target, track in
            Task { @MainActor in
                guard let self, self.session === target, !target.isStopped else { return }
                self.videoTrack = track
            }
        }
        target.onConnectionChange = { [weak self] target, connected, dropped in
            Task { @MainActor in
                guard let self else { return }
                if dropped {
                    self.stop(target)
                } else if self.session === target, !target.isStopped {
                    self.isConnected = connected
                }
            }
        }
        session = target
        return target
    }

    private func makeFactory() -> RTCPeerConnectionFactory {
        // Audio stays off until enablePlaybackAudio. Turning it off here, after that call, left the stream silent.
        RTCAudioSession.sharedInstance().useManualAudio = true
        RTCPeerConnectionFactory.initialize()
        return RTCPeerConnectionFactory(
            encoderFactory: RTCDefaultVideoEncoderFactory(),
            decoderFactory: RTCDefaultVideoDecoderFactory()
        )
    }

    private func negotiate(_ target: Session, url: String) async throws {
        guard let connection = target.connection else { throw LivestreamError.unknownError }
        let receiveOnly = RTCRtpTransceiverInit()
        receiveOnly.direction = .recvOnly
        connection.addTransceiver(of: .video, init: receiveOnly)
        connection.addTransceiver(of: .audio, init: receiveOnly)

        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        let offer = try await connection.offer(for: constraints)
        try await connection.setLocalDescription(offer)
        if connection.iceGatheringState == .complete { target.gathered.fire() }
        if try await !target.gathered.wait(timeout: iceGatheringTimeout) {
            log("ICE gathering did not finish in time; sending the candidates found so far")
        }
        guard let local = connection.localDescription?.sdp else { throw LivestreamError.unknownError }

        let answer = try await signaling.postOffer(url: url, token: target.token, offerSdp: local)
        target.resource = answer.resource
        try await connection.setRemoteDescription(RTCSessionDescription(type: .answer, sdp: answer.sdp))
        guard try await target.firstTrack.wait(timeout: firstTrackTimeout) else {
            throw LivestreamError.unknownError
        }
    }

    /// A `disconnect()` while connecting is not an error: it cancels the call instead.
    private func failure(_ target: Session, _ cause: Error) -> Error {
        let stoppedByCaller = target.isStopped
        stop(target)
        if stoppedByCaller { return CancellationError() }
        let livestreamError = cause as? LivestreamError ?? .unknownError
        error = livestreamError
        return livestreamError
    }

    private func stopCurrent() {
        guard let target = session else { return }
        stop(target)
    }

    private func stop(_ target: Session) {
        guard target.markStopped() else { return }
        if session === target {
            session = nil
            videoTrack = nil
            isConnected = false
        }
        target.firstTrack.fire(.failure(LivestreamError.unknownError))
        target.gathered.fire()
        target.connection?.close()
        disablePlaybackAudio()
        if let resource = target.resource {
            let signaling = self.signaling
            let token = target.token
            Task.detached { await signaling.delete(resource: resource, token: token) }
        }
    }

    private func enablePlaybackAudio() {
        #if targetEnvironment(simulator)
        // The simulator voice-processing audio unit aborts inside AudioUnitInitialize.
        #else
        let audioSession = RTCAudioSession.sharedInstance()
        audioSession.useManualAudio = true
        audioSession.lockForConfiguration()
        do {
            try audioSession.setCategory(
                AVAudioSession.Category.playAndRecord,
                mode: .voiceChat,
                options: [.defaultToSpeaker, .allowBluetoothHFP]
            )
            try audioSession.setActive(true)
        } catch {
            NSLog("Fishjam livestream audio session failed: %@", error.localizedDescription)
        }
        audioSession.unlockForConfiguration()
        audioSession.isAudioEnabled = true
        #endif
    }

    private func disablePlaybackAudio() {
        #if targetEnvironment(simulator)
        #else
        guard session == nil else { return }
        let audioSession = RTCAudioSession.sharedInstance()
        audioSession.lockForConfiguration()
        audioSession.isAudioEnabled = false
        do {
            try audioSession.setActive(false)
        } catch {
            log("audio session failed: \(error.localizedDescription)")
        }
        audioSession.unlockForConfiguration()
        #endif
    }
}

private final class Session: NSObject, RTCPeerConnectionDelegate, @unchecked Sendable {
    let token: String?
    let firstTrack = Signal()
    let gathered = Signal()
    var connection: RTCPeerConnection?
    var resource: URL?
    var onAudioTrack: ((Session) -> Void)?
    var onVideoTrack: ((Session, VideoTrack) -> Void)?
    var onConnectionChange: ((Session, Bool, Bool) -> Void)?

    private let lock = NSLock()
    private var stopped = false
    private var wasConnected = false

    init(token: String?) {
        self.token = token
        super.init()
    }

    var isStopped: Bool {
        lock.lock()
        defer { lock.unlock() }
        return stopped
    }

    /// `false` when the session was already stopped.
    func markStopped() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if stopped { return false }
        stopped = true
        return true
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}

    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        if newState == .complete { gathered.fire() }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCPeerConnectionState) {
        guard !isStopped else { return }
        let connected = isLivestreamConnected(newState)
        let dropped = wasConnected && !connected
        wasConnected = connected
        onConnectionChange?(self, connected, dropped)
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didStartReceivingOn transceiver: RTCRtpTransceiver) {
        guard !isStopped else { return }
        if let audio = transceiver.receiver.track as? RTCAudioTrack {
            audio.isEnabled = true
            onAudioTrack?(self)
        }
        if let video = transceiver.receiver.track as? VideoTrack {
            onVideoTrack?(self, video)
        }
        firstTrack.fire()
    }
}
