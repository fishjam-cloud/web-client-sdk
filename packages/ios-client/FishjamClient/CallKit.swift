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

/// Where an incoming call landed relative to whatever call already exists.
public enum IncomingCallSlot: Equatable {
    /// There was no call yet; this is the one the app tracks.
    case current
    /// Another call is already answered; this one rings as a waiting call.
    case waiting
    /// No slot left — a transient CallKit report for PushKit, then ended.
    case rejected
}

/// Why a CallKit call ended.
public enum CallEndedReason: String, Equatable, CaseIterable, Sendable {
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
    /// The user answered an incoming call. Fulfill with `fulfillIncomingCallConnected`
    /// once media is live, within the answer deadline (10 s by default).
    case answered(requestId: String)
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

/// A provider reset only needs cleanup when a call exists. Without one, cleanup would
/// overwrite the `RTCAudioSession` settings the app may use for its own WebRTC audio.
func providerResetNeedsCleanup(hasCurrentCall: Bool, hasWaitingCall: Bool) -> Bool {
    hasCurrentCall || hasWaitingCall
}

private func incomingCallUpdate(
    displayName: String,
    handle: String,
    isVideo: Bool,
    supportsHolding: Bool
) -> CXCallUpdate {
    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: handle)
    update.localizedCallerName = displayName
    update.hasVideo = isVideo
    update.supportsHolding = supportsHolding
    update.supportsGrouping = false
    update.supportsUngrouping = false
    update.supportsDTMF = false
    return update
}

func timeoutFromInfoPlist(_ key: String, fallback: TimeInterval) -> TimeInterval {
    let value = Bundle.main.object(forInfoDictionaryKey: key)
    let seconds = (value as? NSNumber)?.doubleValue ?? (value as? String).flatMap(Double.init)
    guard let seconds, seconds > 0 else { return fallback }
    return seconds
}

extension Notification.Name {
    static let fishjamCallKitVideoCallChanged = Notification.Name("FishjamCallKitVideoCallChanged")
}

/// iOS CallKit session: shows the call in the system call UI and keeps its audio running in the
/// background. Supports outgoing calls and incoming VoIP pushes (via `reportIncomingCall`).
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

    private static let defaultIncomingCallTimeout: TimeInterval = 45
    private static let defaultOutgoingCallTimeout: TimeInterval = 60
    private static let defaultFulfillAnswerTimeout: TimeInterval = 10

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
    private let audioGate = CallAudioGate()
    private var currentCallUUID: UUID?
    private var waitingCallUUID: UUID?
    private var isDialing = false
    private var isCallAnswered = false
    private var isCallOnHold = false
    private var pendingAnswerRequestId: String?
    private var ringTimeoutBlock: DispatchWorkItem?
    private var waitingRingTimeoutBlock: DispatchWorkItem?
    private var includesCallsInRecents = false
    private lazy var incomingCallTimeout = timeoutFromInfoPlist(
        "VoIPIncomingCallTimeout",
        fallback: Self.defaultIncomingCallTimeout
    )
    private lazy var outgoingCallTimeout = timeoutFromInfoPlist(
        "VoIPOutgoingCallTimeout",
        fallback: Self.defaultOutgoingCallTimeout
    )
    private lazy var fulfillAnswerTimeout = timeoutFromInfoPlist(
        "VoIPFulfillAnswerTimeout",
        fallback: Self.defaultFulfillAnswerTimeout
    )
    private lazy var provider: CXProvider = {
        let configuration = CXProviderConfiguration()
        configuration.supportsVideo = true
        configuration.supportedHandleTypes = [.generic]
        configuration.maximumCallsPerCallGroup = 1
        configuration.maximumCallGroups = 2
        configuration.includesCallsInRecents = includesCallsInRecents
        let created = CXProvider(configuration: configuration)
        created.setDelegate(self, queue: nil)
        return created
    }()
    private lazy var callController = CXCallController()

    /// Called when a waiting call is promoted so VoIP can reveal its buffered payload.
    var onWaitingCallPromoted: (() -> Void)?
    /// Called when a waiting call is declined or times out.
    var onWaitingCallDiscarded: (() -> Void)?
    /// Called when the current call is cleaned up, so VoIP can clear a buffered push.
    var onCurrentCallCleared: (() -> Void)?

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

    /// True after CallKit has activated the call audio session.
    var isCallAudioActive: Bool {
        audioGate.isActive
    }

    /// Waits until CallKit activates call audio. Returns false on timeout.
    func waitUntilCallAudioActive(timeout: TimeInterval) async -> Bool {
        await audioGate.waitUntilActive(timeout: timeout)
    }

    public var isAnswered: Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return isCallAnswered
    }

    public var isHeld: Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return isCallOnHold
    }

    public var pendingAnswerId: String? {
        stateLock.lock()
        defer { stateLock.unlock() }
        return pendingAnswerRequestId
    }

    /// Turns on Recents entries for CallKit calls. Call once when registering for VoIP pushes.
    public func enableCallsInRecents() {
        includesCallsInRecents = true
        // Touch the provider so a later reconfiguration is not needed if it was already created.
        _ = provider
        let configuration = CXProviderConfiguration()
        configuration.supportsVideo = true
        configuration.supportedHandleTypes = [.generic]
        configuration.maximumCallsPerCallGroup = 1
        configuration.maximumCallGroups = 2
        configuration.includesCallsInRecents = true
        provider.configuration = configuration
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

    /// Reports an incoming call from a VoIP push. Must be called on every push (PushKit rule).
    @discardableResult
    public func reportIncomingCall(displayName: String, handle: String, isVideo: Bool) -> IncomingCallSlot {
        if !Thread.isMainThread {
            var slot: IncomingCallSlot = .rejected
            DispatchQueue.main.sync {
                slot = self.reportIncomingCall(displayName: displayName, handle: handle, isVideo: isVideo)
            }
            return slot
        }

        if waitingCallUUID != nil || (currentCallUUID != nil && !isCallAnswered) {
            reportTransientIncomingCallAndEnd(displayName: displayName, handle: handle, isVideo: isVideo)
            return .rejected
        }

        let becomesWaiting = currentCallUUID != nil
        let uuid = UUID()

        if becomesWaiting {
            waitingCallUUID = uuid
            if isCallAnswered {
                reportCallCapabilities(for: currentCallUUID, supportsHolding: false)
            }
        } else {
            currentCallUUID = uuid
            isCallAnswered = false
            isDialing = false
            setVideoCallActive(isVideo)
        }

        let update = incomingCallUpdate(
            displayName: displayName,
            handle: handle,
            isVideo: isVideo,
            supportsHolding: !becomesWaiting
        )
        provider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            guard let self else { return }
            if let error {
                os_log("[CallKit] Failed to report incoming call: %{public}@", error.localizedDescription)
                if becomesWaiting {
                    self.cleanupWaitingCall()
                } else {
                    self.eventHub.emit(.failed(message: error.localizedDescription))
                    self.cleanupCurrentCall()
                }
                return
            }
            if becomesWaiting {
                self.startWaitingRingTimeout(for: uuid, timeout: self.incomingCallTimeout)
            } else {
                self.startRingTimeout(for: uuid, timeout: self.incomingCallTimeout)
            }
        }

        return becomesWaiting ? .waiting : .current
    }

    /// Reports a dialing call (`CallKitConfig.isDialing`) as connected.
    public func reportOutgoingCallConnected() {
        DispatchQueue.main.async {
            guard let uuid = self.currentCallUUID, self.isDialing else {
                os_log("[CallKit] No dialing call to report as connected")
                return
            }
            self.cancelRingTimeout()
            Dialtone.shared.stop()
            self.isDialing = false
            self.isCallAnswered = true
            self.provider.reportOutgoingCall(with: uuid, connectedAt: Date())
        }
    }

    /// Resolves a parked answer action once incoming-call media is live.
    @discardableResult
    public func fulfillIncomingCallConnected(_ requestId: String) -> Bool {
        FulfillRequestManager.shared.fulfill(requestId)
    }

    /// Aborts a parked answer action.
    public func failIncomingCallConnected(_ requestId: String) {
        FulfillRequestManager.shared.cancel(requestId)
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
        guard currentCallUUID == nil, waitingCallUUID == nil else {
            os_log("[CallKit] Call already in progress")
            return
        }
        let uuid = UUID()
        currentCallUUID = uuid
        isDialing = config.isDialing
        isCallAnswered = !config.isDialing
        setVideoCallActive(config.isVideo)

        let handle = config.handle.flatMap { $0.isEmpty ? nil : $0 } ?? config.displayName
        let action = CXStartCallAction(call: uuid, handle: CXHandle(type: .generic, value: handle))
        action.isVideo = config.isVideo
        action.contactIdentifier = config.displayName

        callController.request(CXTransaction(action: action)) { [weak self] error in
            DispatchQueue.main.async {
                guard let self, self.currentCallUUID == uuid else { return }
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
        guard let uuid = currentCallUUID else {
            os_log("[CallKit] No active call to end")
            return
        }
        guard let ended = cxEndedReason(reason) else {
            request(CXEndCallAction(call: uuid))
            return
        }
        provider.reportCall(with: uuid, endedAt: Date(), reason: ended)
        eventHub.emit(.ended(reason))
        cleanupCurrentCall()
    }

    /// PushKit requires every VoIP push to post an incoming call. When no slot is left,
    /// report a throwaway call and end it immediately.
    private func reportTransientIncomingCallAndEnd(displayName: String, handle: String, isVideo: Bool) {
        let uuid = UUID()
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: handle)
        update.localizedCallerName = displayName
        update.hasVideo = isVideo
        update.supportsHolding = false
        update.supportsGrouping = false
        update.supportsUngrouping = false
        update.supportsDTMF = false

        provider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            if let error {
                os_log("[CallKit] Failed to report transient incoming call: %{public}@", error.localizedDescription)
            }
            self?.provider.reportCall(with: uuid, endedAt: Date(), reason: .failed)
        }
    }

    private func reportCallCapabilities(for uuid: UUID?, supportsHolding: Bool) {
        guard let uuid else { return }
        let update = CXCallUpdate()
        update.supportsHolding = supportsHolding
        update.supportsGrouping = false
        update.supportsUngrouping = false
        update.supportsDTMF = false
        provider.reportCall(with: uuid, updated: update)
    }

    private func activeCall() -> UUID? {
        if currentCallUUID == nil {
            os_log("[CallKit] No active call")
        }
        return currentCallUUID
    }

    private func request(_ action: CXCallAction) {
        callController.request(CXTransaction(action: action)) { error in
            if let error {
                os_log("[CallKit] Call action failed: %{public}@", error.localizedDescription)
            }
        }
    }

    private func startRingTimeout(for uuid: UUID, timeout: TimeInterval) {
        cancelRingTimeout()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.ringTimeoutBlock = nil
            guard self.currentCallUUID == uuid, !self.isCallAnswered else { return }
            self.endCall(reason: .missed)
        }
        ringTimeoutBlock = work
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout, execute: work)
    }

    private func cancelRingTimeout() {
        ringTimeoutBlock?.cancel()
        ringTimeoutBlock = nil
    }

    private func startWaitingRingTimeout(for uuid: UUID, timeout: TimeInterval) {
        cancelWaitingRingTimeout()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.waitingRingTimeoutBlock = nil
            guard self.waitingCallUUID == uuid else { return }
            self.provider.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
            self.cleanupWaitingCall()
        }
        waitingRingTimeoutBlock = work
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout, execute: work)
    }

    private func cancelWaitingRingTimeout() {
        waitingRingTimeoutBlock?.cancel()
        waitingRingTimeoutBlock = nil
    }

    private func cleanupCurrentCall() {
        cancelRingTimeout()
        Dialtone.shared.stop()
        currentCallUUID = nil
        isCallAnswered = false
        isDialing = false
        isCallOnHold = false
        pendingAnswerRequestId = nil
        FulfillRequestManager.shared.cancelAll()
        setWebRTCAudioEnabled(true)
        setVideoCallActive(false)
        onCurrentCallCleared?()
    }

    private func cleanupWaitingCall() {
        cancelWaitingRingTimeout()
        waitingCallUUID = nil
        if currentCallUUID != nil {
            reportCallCapabilities(for: currentCallUUID, supportsHolding: true)
        }
        onWaitingCallDiscarded?()
    }

    /// Answering the waiting call ends the current one and takes its place.
    private func promoteWaitingCallToCurrent() {
        let promoted = waitingCallUUID
        cancelWaitingRingTimeout()
        waitingCallUUID = nil

        if currentCallUUID != nil {
            eventHub.emit(.ended(.local))
            cleanupCurrentCall()
        }

        currentCallUUID = promoted
        isCallAnswered = false
        isDialing = false
        isCallOnHold = false
        reportCallCapabilities(for: promoted, supportsHolding: true)
        onWaitingCallPromoted?()
    }

    private func reportAnswerFailure(for uuid: UUID) {
        guard uuid == currentCallUUID else { return }
        provider.reportCall(with: uuid, endedAt: Date(), reason: .failed)
        eventHub.emit(.ended(.failed))
        cleanupCurrentCall()
    }

    /// Matches the RN CallKitManager hold fix: both setters make libwebrtc recompute
    /// canPlayOrRecord and start or stop the audio unit only if it differs from a cache.
    private func setWebRTCAudioEnabled(_ enabled: Bool) {
        #if !targetEnvironment(simulator)
        let session = RTCAudioSession.sharedInstance()
        if !session.useManualAudio {
            session.isAudioEnabled = true
        }
        session.useManualAudio = !enabled
        session.isAudioEnabled = enabled
        #endif
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
}

extension CallKit: CXProviderDelegate {
    public func providerDidReset(_ provider: CXProvider) {
        guard providerResetNeedsCleanup(
            hasCurrentCall: currentCallUUID != nil,
            hasWaitingCall: waitingCallUUID != nil
        ) else { return }
        cleanupCurrentCall()
        cleanupWaitingCall()
    }

    public func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        let now = Date()
        provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: now)
        if isDialing {
            startRingTimeout(for: action.callUUID, timeout: outgoingCallTimeout)
        } else {
            provider.reportOutgoingCall(with: action.callUUID, connectedAt: now)
        }
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        let uuid = action.callUUID

        if uuid == waitingCallUUID {
            cleanupWaitingCall()
            action.fulfill()
            return
        }

        guard uuid == currentCallUUID else {
            action.fulfill()
            return
        }

        eventHub.emit(.ended(.local))
        action.fulfill()
        cleanupCurrentCall()
    }

    public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        let uuid = action.callUUID

        if uuid == waitingCallUUID {
            promoteWaitingCallToCurrent()
        }

        guard uuid == currentCallUUID else {
            action.fail()
            return
        }

        cancelRingTimeout()
        isCallAnswered = true

        var requestId: String!
        requestId = FulfillRequestManager.shared.createRequest(timeout: fulfillAnswerTimeout) { [weak self] result in
            guard let self else {
                action.fail()
                return
            }
            if self.pendingAnswerRequestId == requestId {
                self.pendingAnswerRequestId = nil
            }
            if result == .fulfilled {
                action.fulfill()
            } else {
                action.fail()
                self.reportAnswerFailure(for: action.callUUID)
            }
        }

        pendingAnswerRequestId = requestId
        eventHub.emit(.answered(requestId: requestId))
    }

    public func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) {
        guard let answer = action as? CXAnswerCallAction else { return }
        if let requestId = pendingAnswerRequestId, FulfillRequestManager.shared.cancel(requestId) {
            return
        }
        answer.fail()
        reportAnswerFailure(for: answer.callUUID)
    }

    public func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
        if waitingCallUUID != nil, action.callUUID == currentCallUUID, action.isOnHold {
            action.fail()
            return
        }

        isCallOnHold = action.isOnHold
        if action.isOnHold, action.callUUID == currentCallUUID {
            setWebRTCAudioEnabled(false)
        } else if !action.isOnHold {
            setWebRTCAudioEnabled(true)
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
        let rtcSession = RTCAudioSession.sharedInstance()
        rtcSession.audioSessionDidActivate(audioSession)
        // At this point the session is SoloAmbient, which has no microphone input.
        // The audio unit must not start until the category allows recording.
        rtcSession.lockForConfiguration()
        do {
            try rtcSession.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [.defaultToSpeaker, .allowBluetoothHFP]
            )
        } catch {
            NSLog("Fishjam call audio category failed: %@", error.localizedDescription)
        }
        rtcSession.unlockForConfiguration()
        // isAudioEnabled only starts the recorder while useManualAudio stays true.
        // The microphone track is created after this, so the recorder starts with it.
        rtcSession.useManualAudio = true
        rtcSession.isAudioEnabled = false
        rtcSession.isAudioEnabled = true
        audioGate.setActive(true)
        // CallKit puts an audio call on the earpiece. The conference path uses the
        // loudspeaker, so a call is silent while the phone lies on a table. Use the
        // loudspeaker when the route is still the earpiece.
        rtcSession.lockForConfiguration()
        let earpiece = rtcSession.currentRoute.outputs.allSatisfy { $0.portType == .builtInReceiver }
        if earpiece {
            try? rtcSession.overrideOutputAudioPort(.speaker)
        }
        rtcSession.unlockForConfiguration()
        if currentCallUUID != nil, isDialing {
            Dialtone.shared.play()
        }
    }

    public func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        Dialtone.shared.stop()
        audioGate.setActive(false)
        RTCAudioSession.sharedInstance().audioSessionDidDeactivate(audioSession)
    }
}
