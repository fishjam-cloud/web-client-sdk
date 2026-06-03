//
//  LivestreamSampleHandler.swift
//  Livestream Broadcast Extension
//
//  Unlike the in-call screen-share extension (which only forwards raw frames to the
//  host app over a unix socket for app-side encoding), this extension owns the entire
//  WebRTC pipeline in-process: capture -> H264 encode (VideoToolbox) -> WHIP publish.
//  Because the broadcast extension is the only process iOS keeps alive during a
//  broadcast, the VideoToolbox encoder stays available even when the host app is
//  backgrounded, so the livestream keeps running.
//

import ReplayKit
import WebRTC
import os.log

// Logs go to the unified logging system (visible in Console.app / Xcode, filter by
// subsystem "io.fishjam.livestream") and to NSLog for easy visibility while debugging.
private let llog = OSLog(subsystem: "io.fishjam.livestream", category: "extension")
func LSLog(_ message: String) {
    os_log("%{public}@", log: llog, type: .default, message)
    NSLog("[FishjamLivestream] %@", message)
}

private enum Constants {
    // Replaced by the config plugin with the app's App Group id. The host app writes
    // the WHIP credentials into UserDefaults(suiteName:) using the same id.
    static let appGroupIdentifier = "{{GROUP_IDENTIFIER}}"

    // Keys written by the app side (writeLivestreamCredentials).
    static let whipUrlKey = "livestreamWhipUrl"
    static let tokenKey = "livestreamToken"

    // Status channel back to the host app (read by WebRTCModule on the Darwin signal below).
    static let statusKey = "livestreamStatus"
    static let errorKey = "livestreamErrorMessage"
    static let statusDarwinNotification = "iOS_LivestreamStatusChanged"

    static let videoTrackId = "screen0"

    // Safety fallback: if ICE gathering never reports `.complete` (some networks stall),
    // publish whatever candidates we have after this delay so the stream still starts.
    static let iceGatheringFallbackSeconds = 3.0
}

// Status values shared with the host app (must match the `LivestreamStatus` TS union).
private enum LivestreamStatus: String {
    case starting
    case connecting
    case streaming
    case failed
    case stopped
}

class LivestreamSampleHandler: RPBroadcastSampleHandler {

    private var peerConnectionFactory: RTCPeerConnectionFactory?
    private var peerConnection: RTCPeerConnection?
    private var videoSource: RTCVideoSource?
    private var videoCapturer: RTCVideoCapturer?
    private var whipClient: WhipClient?

    private var didSendOffer = false
    private var frameCount = 0

    // MARK: - RPBroadcastSampleHandler

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        LSLog("broadcastStarted (appGroup=\(Constants.appGroupIdentifier))")
        publishStatus(.starting)

        guard let credentials = readCredentials() else {
            LSLog("ERROR: credentials missing in App Group UserDefaults — aborting")
            failBroadcast(code: 10101, message: "Livestream credentials missing")
            return
        }
        LSLog("credentials read: whipUrl=\(credentials.whipUrl), tokenLength=\(credentials.token.count)")

        guard let whipUrl = URL(string: credentials.whipUrl) else {
            LSLog("ERROR: invalid WHIP URL: \(credentials.whipUrl)")
            failBroadcast(code: 10102, message: "Invalid WHIP URL")
            return
        }

        setupPeerConnection()
        whipClient = WhipClient(url: whipUrl, token: credentials.token)

        DarwinNotificationCenter.shared.postNotification(.broadcastStarted)
        negotiate()
    }

    override func broadcastPaused() {
        LSLog("broadcastPaused")
    }

    override func broadcastResumed() {
        LSLog("broadcastResumed")
    }

    override func broadcastFinished() {
        LSLog("broadcastFinished (framesReceived=\(frameCount))")
        publishStatus(.stopped)
        DarwinNotificationCenter.shared.postNotification(.broadcastStopped)
        whipClient?.stop { error in
            if let error = error {
                LSLog("WHIP DELETE error: \(error.localizedDescription)")
            } else {
                LSLog("WHIP resource deleted")
            }
        }
        peerConnection?.close()
        peerConnection = nil
        peerConnectionFactory = nil
        videoSource = nil
        videoCapturer = nil
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        guard sampleBufferType == .video else { return }
        guard let videoSource = videoSource, let videoCapturer = videoCapturer else {
            LSLog("dropping frame: video source/capturer not ready")
            return
        }
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        let rtcPixelBuffer = RTCCVPixelBuffer(pixelBuffer: pixelBuffer)
        let timeStampNs = Int64(CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer)) * Double(NSEC_PER_SEC))
        let frame = RTCVideoFrame(buffer: rtcPixelBuffer, rotation: rotation(of: sampleBuffer), timeStampNs: timeStampNs)

        // Feed every frame; the in-process encoder + BWE handle pacing/bitrate.
        videoSource.capturer(videoCapturer, didCapture: frame)

        frameCount += 1
        if frameCount == 1 {
            let width = CVPixelBufferGetWidth(pixelBuffer)
            let height = CVPixelBufferGetHeight(pixelBuffer)
            LSLog("first video frame fed to source (\(width)x\(height))")
        } else if frameCount % 120 == 0 {
            LSLog("fed \(frameCount) frames so far")
        }
    }

    // MARK: - WebRTC setup

    private func setupPeerConnection() {
        let encoderFactory = RTCDefaultVideoEncoderFactory()
        let decoderFactory = RTCDefaultVideoDecoderFactory()
        let factory = RTCPeerConnectionFactory(encoderFactory: encoderFactory, decoderFactory: decoderFactory)
        peerConnectionFactory = factory

        let config = RTCConfiguration()
        config.sdpSemantics = .unifiedPlan
        config.iceServers = [RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"])]

        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        peerConnection = factory.peerConnection(with: config, constraints: constraints, delegate: self)

        let source = factory.videoSource()
        videoSource = source
        videoCapturer = RTCVideoCapturer(delegate: source)

        let videoTrack = factory.videoTrack(with: source, trackId: Constants.videoTrackId)
        let transceiverInit = RTCRtpTransceiverInit()
        transceiverInit.direction = .sendOnly
        peerConnection?.addTransceiver(with: videoTrack, init: transceiverInit)
        LSLog("peer connection configured (sendonly video transceiver added)")
    }

    private func negotiate() {
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        LSLog("creating offer")
        peerConnection?.offer(for: constraints) { [weak self] sdp, error in
            guard let self = self else { return }
            guard let sdp = sdp else {
                LSLog("ERROR: failed to create offer: \(error?.localizedDescription ?? "unknown")")
                self.failBroadcast(code: 10103, message: "Failed to create offer")
                return
            }
            LSLog("offer created, setting local description")
            self.peerConnection?.setLocalDescription(sdp) { error in
                if let error = error {
                    LSLog("ERROR: setLocalDescription failed: \(error.localizedDescription)")
                    self.failBroadcast(code: 10104, message: "setLocalDescription failed: \(error.localizedDescription)")
                    return
                }
                LSLog("local description set; waiting for ICE gathering to complete")
                // Fallback in case `.complete` never fires (non-trickle WHIP still needs an offer).
                DispatchQueue.main.asyncAfter(deadline: .now() + Constants.iceGatheringFallbackSeconds) { [weak self] in
                    guard let self = self, !self.didSendOffer else { return }
                    LSLog("ICE gathering fallback fired after \(Constants.iceGatheringFallbackSeconds)s")
                    self.sendOfferIfReady()
                }
            }
        }
    }

    private func sendOfferIfReady() {
        guard !didSendOffer else { return }
        guard let localSdp = peerConnection?.localDescription?.sdp else {
            LSLog("sendOfferIfReady: local description not ready yet")
            return
        }
        didSendOffer = true
        LSLog("POSTing WHIP offer (\(localSdp.count) bytes)")
        publishStatus(.connecting)

        whipClient?.publish(sdpOffer: localSdp) { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let answerSdp):
                LSLog("WHIP 2xx, answer received (\(answerSdp.count) bytes), setting remote description")
                let answer = RTCSessionDescription(type: .answer, sdp: answerSdp)
                self.peerConnection?.setRemoteDescription(answer) { error in
                    if let error = error {
                        LSLog("ERROR: setRemoteDescription failed: \(error.localizedDescription)")
                        self.failBroadcast(code: 10105, message: "setRemoteDescription failed: \(error.localizedDescription)")
                    } else {
                        LSLog("remote description set; negotiation complete")
                    }
                }
            case .failure(let error):
                LSLog("ERROR: WHIP publish failed: \(error.localizedDescription)")
                self.failBroadcast(code: 10106, message: "WHIP publish failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Helpers

    private func readCredentials() -> (whipUrl: String, token: String)? {
        guard let defaults = UserDefaults(suiteName: Constants.appGroupIdentifier) else {
            LSLog("ERROR: could not open UserDefaults for suite \(Constants.appGroupIdentifier)")
            return nil
        }
        let whipUrl = defaults.string(forKey: Constants.whipUrlKey)
        let token = defaults.string(forKey: Constants.tokenKey)
        LSLog("readCredentials: whipUrl=\(whipUrl == nil ? "nil" : "present"), token=\(token == nil ? "nil" : "present")")
        guard let whipUrl = whipUrl, let token = token, !whipUrl.isEmpty, !token.isEmpty else {
            return nil
        }
        return (whipUrl, token)
    }

    private func rotation(of sampleBuffer: CMSampleBuffer) -> RTCVideoRotation {
        guard let orientationAttachment = CMGetAttachment(sampleBuffer, key: RPVideoSampleOrientationKey as CFString, attachmentModeOut: nil) as? NSNumber,
              let orientation = CGImagePropertyOrientation(rawValue: orientationAttachment.uint32Value) else {
            return ._0
        }
        switch orientation {
        case .up, .upMirrored, .down, .downMirrored:
            return ._0
        case .left, .leftMirrored:
            return ._90
        case .right, .rightMirrored:
            return ._270
        default:
            return ._0
        }
    }

    private func makeError(code: Int, message: String) -> NSError {
        return NSError(domain: RPRecordingErrorDomain, code: code, userInfo: [NSLocalizedDescriptionKey: message])
    }

    // MARK: - Status channel to the host app

    /// Writes the status (and optional error) into the shared App Group UserDefaults and
    /// posts a Darwin notification so the host app (WebRTCModule) can read it and emit a
    /// JS event. A backgrounded app receives the notification on resume; the host also
    /// re-reads the stored value when it returns to the foreground.
    private func publishStatus(_ status: LivestreamStatus, error: String? = nil) {
        if let defaults = UserDefaults(suiteName: Constants.appGroupIdentifier) {
            defaults.set(status.rawValue, forKey: Constants.statusKey)
            if let error = error {
                defaults.set(error, forKey: Constants.errorKey)
            } else {
                defaults.removeObject(forKey: Constants.errorKey)
            }
            defaults.synchronize()
        }
        let center = CFNotificationCenterGetDarwinNotifyCenter()
        CFNotificationCenterPostNotification(
            center,
            CFNotificationName(Constants.statusDarwinNotification as CFString),
            nil,
            nil,
            true
        )
        LSLog("status -> \(status.rawValue)\(error.map { " (\($0))" } ?? "")")
    }

    /// Publishes a `failed` status with the reason, then ends the broadcast.
    private func failBroadcast(code: Int, message: String) {
        publishStatus(.failed, error: message)
        finishBroadcastWithError(makeError(code: code, message: message))
    }
}

// MARK: - RTCPeerConnectionDelegate

extension LivestreamSampleHandler: RTCPeerConnectionDelegate {
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        LSLog("ICE gathering state: \(newState.rawValue) (\(Self.describe(newState)))")
        // Non-trickle WHIP: wait until all candidates are in the local SDP, then POST the offer.
        if newState == .complete {
            sendOfferIfReady()
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        LSLog("ICE connection state: \(newState.rawValue)")
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCPeerConnectionState) {
        LSLog("peer connection state: \(newState.rawValue)")
        switch newState {
        case .connected:
            publishStatus(.streaming)
        case .failed:
            failBroadcast(code: 10107, message: "Peer connection failed")
        default:
            break
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        LSLog("ICE candidate gathered: \(candidate.sdp)")
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}

    private static func describe(_ state: RTCIceGatheringState) -> String {
        switch state {
        case .new: return "new"
        case .gathering: return "gathering"
        case .complete: return "complete"
        @unknown default: return "unknown"
        }
    }
}
