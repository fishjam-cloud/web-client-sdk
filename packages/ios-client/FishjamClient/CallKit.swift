import AVFoundation
import CallKit
import Foundation
import os.log
import WebRTC

/// The call shown in the iOS system call UI.
public struct CallKitConfig: Equatable {
    /// Label shown in the system call UI. Must not be empty.
    public var displayName: String
    /// Stable identifier of the other party (e.g. a user id). Defaults to `displayName`.
    public var handle: String?
    public var isVideo: Bool
    /// The call is ringing the other side. Call `CallKit.reportOutgoingCallConnected()` once it joins.
    /// Otherwise the call is reported as connected right away.
    public var isDialing: Bool

    public init(displayName: String, handle: String? = nil, isVideo: Bool, isDialing: Bool = false) {
        self.displayName = displayName
        self.handle = handle
        self.isVideo = isVideo
        self.isDialing = isDialing
    }
}

/// Why a CallKit call ended.
public enum CallEndedReason: String, Equatable, CaseIterable {
    case local
    case rejected
    case missed
    case remote
    case answeredElsewhere
    case failed
}

/// A change reported by CallKit, often made by the user in the system call UI.
public enum CallKitEvent: Equatable {
    /// CallKit accepted the call.
    case started
    /// The call ended. `.local` when the user tapped the end button in the system UI.
    case ended(CallEndedReason)
    /// CallKit refused to start the call.
    case failed(message: String)
    /// The microphone was muted or unmuted in the system UI. Apply it to the microphone.
    case muted(Bool)
    /// The call was put on hold or resumed, e.g. by a phone call.
    case held(Bool)
}

public enum CallKitError: LocalizedError, Equatable {
    case emptyDisplayName

    public var errorDescription: String? {
        switch self {
        case .emptyDisplayName:
            return "displayName is required"
        }
    }
}

func validateCallKitConfig(_ config: CallKitConfig) throws {
    guard !config.displayName.isEmpty else {
        throw CallKitError.emptyDisplayName
    }
}

/// `nil` for the reasons that end the call with a `CXEndCallAction` instead, since CallKit has no
/// ended reason for them.
func cxEndedReason(_ reason: CallEndedReason) -> CXCallEndedReason? {
    switch reason {
    case .local, .rejected: return nil
    case .missed: return .unanswered
    case .remote: return .remoteEnded
    case .answeredElsewhere: return .answeredElsewhere
    case .failed: return .failed
    }
}

enum CallKitSessionStep: Equatable {
    case start(CallKitConfig)
    case end
    case none
}

/// What `FishjamClient.callKitConfig` does when the room changes. `roomConnected` comes from
/// `communicationModeChange(from:to:)`: `true` on the first connected status, `false` when the room ends.
func callKitSessionStep(roomConnected: Bool?, config: CallKitConfig?, started: Bool) -> CallKitSessionStep {
    switch roomConnected {
    case true?:
        guard let config, !started else { return .none }
        return .start(config)
    case false?:
        return started ? .end : .none
    case nil:
        return .none
    }
}

extension Notification.Name {
    static let fishjamCallKitVideoCallChanged = Notification.Name("FishjamCallKitVideoCallChanged")
}

/// iOS CallKit session: shows the call in the system call UI and keeps its audio running in the
/// background. Outgoing calls only; incoming calls and VoIP push are not supported.
///
/// Start a session after joining a room and end it after leaving, or set `FishjamClient.callKitConfig`
/// to have the client do both. Listen to `events` to apply mute, hold and end from the system UI.
///
/// The app's `Info.plist` must add `audio` and `voip` to `UIBackgroundModes`. A video call keeps the
/// camera running in the background on iOS 16 and newer. On iOS 16 and 17 this also needs the
/// `com.apple.developer.avfoundation.multitasking-camera-access` entitlement.
///
/// The CallKit audio session never activates on the simulator.
public final class CallKit: NSObject, @unchecked Sendable {
    public static let shared = CallKit()

    /// Whether a video call is active. Read from the media queue, so it does not touch `shared`.
    static var isVideoCallActive: Bool {
        videoLock.lock()
        defer { videoLock.unlock() }
        return videoCallActive
    }

    private static let videoLock = NSLock()
    private static var videoCallActive = false

    private let eventHub = EventHub<CallKitEvent>()
    private let stateLock = NSLock()
    private var currentCallUUID: UUID?
    private var isDialing = false
    private var isCallOnHold = false
    private var audioEnabledBeforeHold: Bool?
    private lazy var provider: CXProvider = {
        let configuration = CXProviderConfiguration()
        configuration.supportsVideo = true
        configuration.supportedHandleTypes = [.generic]
        configuration.maximumCallsPerCallGroup = 1
        configuration.maximumCallGroups = 1
        configuration.includesCallsInRecents = false
        let created = CXProvider(configuration: configuration)
        created.setDelegate(self, queue: nil)
        return created
    }()
    private lazy var callController = CXCallController()

    override private init() {
        super.init()
    }

    /// Every CallKit change, in order. Each access returns a new stream that starts at the next event.
    public var events: AsyncStream<CallKitEvent> {
        eventHub.stream()
    }

    public var hasActiveSession: Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return currentCallUUID != nil
    }

    public var isHeld: Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return isCallOnHold
    }

    /// Reports a new call to CallKit. Ignored while a call is active. A refusal arrives as `.failed`.
    public func startSession(_ config: CallKitConfig) throws {
        try validateCallKitConfig(config)
        DispatchQueue.main.async {
            self.startCall(config)
        }
    }

    public func endSession(reason: CallEndedReason = .local) {
        DispatchQueue.main.async {
            self.endCall(reason: reason)
        }
    }

    /// Reports a dialing call (`CallKitConfig.isDialing`) as connected.
    public func reportOutgoingCallConnected() {
        DispatchQueue.main.async {
            guard let uuid = self.currentCall(), self.isDialing else {
                os_log("[CallKit] No dialing call to report as connected")
                return
            }
            self.isDialing = false
            self.provider.reportOutgoingCall(with: uuid, connectedAt: Date())
        }
    }

    /// The result arrives as `.held`.
    public func setHeld(_ onHold: Bool) {
        DispatchQueue.main.async {
            guard let uuid = self.activeCall() else { return }
            self.request(CXSetHeldCallAction(call: uuid, onHold: onHold))
        }
    }

    /// Updates the mute button in the system UI. The result arrives as `.muted`.
    public func setMuted(_ muted: Bool) {
        DispatchQueue.main.async {
            guard let uuid = self.activeCall() else { return }
            self.request(CXSetMutedCallAction(call: uuid, muted: muted))
        }
    }

    private func startCall(_ config: CallKitConfig) {
        guard currentCall() == nil else {
            os_log("[CallKit] Call already in progress")
            return
        }
        let uuid = UUID()
        setCurrentCall(uuid)
        isDialing = config.isDialing
        setVideoCallActive(config.isVideo)

        let handle = config.handle.flatMap { $0.isEmpty ? nil : $0 } ?? config.displayName
        let action = CXStartCallAction(call: uuid, handle: CXHandle(type: .generic, value: handle))
        action.isVideo = config.isVideo
        action.contactIdentifier = config.displayName

        callController.request(CXTransaction(action: action)) { [weak self] error in
            DispatchQueue.main.async {
                guard let self, self.currentCall() == uuid else { return }
                if let error {
                    os_log("[CallKit] Failed to start call: %{public}@", error.localizedDescription)
                    self.cleanupCurrentCall()
                    self.eventHub.emit(.failed(message: error.localizedDescription))
                    return
                }
                self.eventHub.emit(.started)
                let update = CXCallUpdate()
                update.localizedCallerName = config.displayName
                update.supportsHolding = true
                update.supportsGrouping = false
                update.supportsUngrouping = false
                update.supportsDTMF = false
                update.hasVideo = config.isVideo
                self.provider.reportCall(with: uuid, updated: update)
            }
        }
    }

    private func endCall(reason: CallEndedReason) {
        guard let uuid = activeCall() else { return }
        guard let ended = cxEndedReason(reason) else {
            // performEndCallAction emits `.ended` once the transaction is fulfilled.
            request(CXEndCallAction(call: uuid))
            return
        }
        provider.reportCall(with: uuid, endedAt: Date(), reason: ended)
        cleanupCurrentCall()
        eventHub.emit(.ended(reason))
    }

    private func currentCall() -> UUID? {
        stateLock.lock()
        defer { stateLock.unlock() }
        return currentCallUUID
    }

    private func setCurrentCall(_ uuid: UUID?) {
        stateLock.lock()
        currentCallUUID = uuid
        stateLock.unlock()
    }

    private func setOnHold(_ onHold: Bool) {
        stateLock.lock()
        isCallOnHold = onHold
        stateLock.unlock()
    }

    private func activeCall() -> UUID? {
        let uuid = currentCall()
        if uuid == nil {
            os_log("[CallKit] No active call")
        }
        return uuid
    }

    private func request(_ action: CXCallAction) {
        callController.request(CXTransaction(action: action)) { error in
            if let error {
                os_log("[CallKit] Call action failed: %{public}@", error.localizedDescription)
            }
        }
    }

    private func cleanupCurrentCall() {
        setCurrentCall(nil)
        isDialing = false
        if isHeld {
            setOnHold(false)
            restoreAudioAfterHold()
        }
        setVideoCallActive(false)
    }

    private func setVideoCallActive(_ active: Bool) {
        Self.videoLock.lock()
        let changed = Self.videoCallActive != active
        Self.videoCallActive = active
        Self.videoLock.unlock()
        if changed {
            NotificationCenter.default.post(name: .fishjamCallKitVideoCallChanged, object: nil)
        }
    }

    /// Stops the WebRTC audio unit while another call holds the audio session.
    private func pauseAudioForHold() {
        #if !targetEnvironment(simulator)
        let session = RTCAudioSession.sharedInstance()
        if audioEnabledBeforeHold == nil {
            audioEnabledBeforeHold = session.isAudioEnabled
        }
        session.isAudioEnabled = false
        #endif
    }

    private func restoreAudioAfterHold() {
        #if !targetEnvironment(simulator)
        guard let enabled = audioEnabledBeforeHold else { return }
        audioEnabledBeforeHold = nil
        RTCAudioSession.sharedInstance().isAudioEnabled = enabled
        #endif
    }
}

extension CallKit: CXProviderDelegate {
    public func providerDidReset(_ provider: CXProvider) {
        cleanupCurrentCall()
    }

    public func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        let now = Date()
        provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: now)
        if !isDialing {
            provider.reportOutgoingCall(with: action.callUUID, connectedAt: now)
        }
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        guard action.callUUID == currentCall() else {
            action.fulfill()
            return
        }
        action.fulfill()
        cleanupCurrentCall()
        eventHub.emit(.ended(.local))
    }

    public func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
        setOnHold(action.isOnHold)
        if action.isOnHold {
            pauseAudioForHold()
        } else {
            restoreAudioAfterHold()
        }
        eventHub.emit(.held(action.isOnHold))
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        eventHub.emit(.muted(action.isMuted))
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, perform action: CXSetGroupCallAction) {
        action.fail()
    }

    public func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        RTCAudioSession.sharedInstance().audioSessionDidActivate(audioSession)
    }

    public func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        RTCAudioSession.sharedInstance().audioSessionDidDeactivate(audioSession)
    }
}
