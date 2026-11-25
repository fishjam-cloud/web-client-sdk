import Combine
import Foundation
import WebRTC

/// Publishes a WHIP livestream from tracks created by `client`, independent of any room connection.
///
/// Start the camera or microphone on `client`, then call `connect` with those tracks and a streamer token.
/// At least one of `video` or `audio` is required. Calling `connect` again replaces the stream that is already
/// running. If the connection drops after it was established, the streamer disconnects. `disconnect()` does not
/// stop the camera or microphone: `client` owns those tracks.
@MainActor
public final class LivestreamStreamer: ObservableObject {
    /// `true` while the peer connection is connected.
    @Published public private(set) var isConnected = false
    /// The error of the last `connect`, or `nil`. Cleared when the next `connect` starts.
    @Published public private(set) var error: LivestreamError?

    private let client: FishjamClient
    private let whipUrl: String
    private let debug: Bool
    private let signaling = WebRtcHttpSignaling(errorForStatus: livestreamPublishError(forStatus:))
    private var session: Session?

    public init(client: FishjamClient, debug: Bool = false) {
        self.client = client
        do {
            whipUrl = try livestreamWhipUrl(client.fishjamId)
        } catch {
            preconditionFailure("fishjamId is required to build a livestream URL.")
        }
        self.debug = debug
    }

    /// Starts publishing and returns once the server has accepted the offer. Any stream published before is
    /// disconnected first. `url` replaces the WHIP endpoint of `client`.
    ///
    /// Crashes when both `video` and `audio` are nil: a WHIP publish needs at least one track.
    /// Throws `LivestreamError` and also publishes it in `error`. A `disconnect()` or another `connect` during
    /// connecting cancels the call with a `CancellationError`.
    public func connect(
        video: VideoTrack? = nil,
        audio: AudioTrack? = nil,
        token: String,
        url: String? = nil
    ) async throws {
        precondition(
            video != nil || audio != nil,
            "To publish a livestream with WHIP, you need to supply at least one video or audio track."
        )
        stopCurrent()
        error = nil
        let target: Session
        do {
            target = try await openSession(token: token)
        } catch {
            self.error = .unknownError
            throw LivestreamError.unknownError
        }
        do {
            try await negotiate(target, url: url ?? whipUrl, video: video, audio: audio)
        } catch is CancellationError {
            stop(target)
            throw CancellationError()
        } catch {
            throw failure(target, error)
        }
    }

    /// Stops publishing. Does nothing when nothing is publishing. The tracks keep running.
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

    private func log(_ message: String) {
        if debug { NSLog("[FISHJAM] livestream: %@", message) }
    }

    private func openSession(token: String) async throws -> Session {
        let factory = await client.peerConnectionFactory()
        let config = RTCConfiguration()
        config.bundlePolicy = .maxBundle
        config.sdpSemantics = .unifiedPlan
        let target = Session(token: token)
        guard let connection = factory.peerConnection(
            with: config,
            constraints: RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil),
            delegate: target
        ) else {
            throw LivestreamError.unknownError
        }
        target.connection = connection
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

    private func negotiate(_ target: Session, url: String, video: VideoTrack?, audio: AudioTrack?) async throws {
        guard let connection = target.connection else { throw LivestreamError.unknownError }
        let sendOnly = RTCRtpTransceiverInit()
        sendOnly.direction = .sendOnly
        if let video { connection.addTransceiver(with: video, init: sendOnly) }
        if let audio { connection.addTransceiver(with: audio, init: sendOnly) }

        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        let offer = try await connection.offer(for: constraints)
        try await connection.setLocalDescription(offer)
        if connection.iceGatheringState == .complete { target.gathered.fire() }
        if try await !target.gathered.wait(timeout: 3) {
            log("ICE gathering did not finish in time; sending the candidates found so far")
        }
        guard let local = connection.localDescription?.sdp else { throw LivestreamError.unknownError }

        let answer = try await signaling.postOffer(url: url, token: target.token, offerSdp: local)
        target.resource = answer.resource
        try await connection.setRemoteDescription(RTCSessionDescription(type: .answer, sdp: answer.sdp))
        if target.isStopped { throw LivestreamError.unknownError }
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
            isConnected = false
        }
        target.gathered.fire()
        target.connection?.close()
        if let resource = target.resource {
            let signaling = self.signaling
            let token = target.token
            Task.detached { await signaling.delete(resource: resource, token: token) }
        }
    }
}

private final class Session: NSObject, RTCPeerConnectionDelegate, @unchecked Sendable {
    let token: String
    let gathered = Signal()
    var connection: RTCPeerConnection?
    var resource: URL?
    var onConnectionChange: ((Session, Bool, Bool) -> Void)?

    private let lock = NSLock()
    private var stopped = false
    private var wasConnected = false

    init(token: String) {
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

    func peerConnection(
        _ peerConnection: RTCPeerConnection,
        didStartReceivingOn transceiver: RTCRtpTransceiver
    ) {}
}
