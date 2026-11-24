import Foundation
import Intents
import PushKit
import UIKit
import os.log

/// Lifecycle state of the current VoIP call.
///
/// - `available` — no call in progress
/// - `incoming` — a call is ringing, awaiting the user's answer
/// - `connecting` — the call was started/answered; join the room now
/// - `active` — the app reported the media connected and the call is in progress
public enum VoIPCallStatus: String, Equatable, Sendable {
    case available
    case incoming
    case connecting
    case active
}

/// Details of the call currently being handled.
public struct VoIPCurrentCall: Equatable, Sendable {
    /// Fishjam room the call takes place in.
    public var roomName: String
    /// Name shown in the CallKit UI (the remote party).
    public var displayName: String
    /// Stable id of the remote party — use a durable user id, not a display name.
    public var handle: String
    public var isVideo: Bool
    /// Optional URL of the caller's avatar from the push payload.
    public var avatarUrl: String?
    /// Timestamp when the call became `active`, or `nil` if not yet connected.
    public var startedAt: Date?
    /// `true` when this device initiated the call.
    public var isOutgoing: Bool
}

/// A redial requested from the iOS Recents list.
public struct VoIPCallIntent: Equatable, Sendable {
    /// Stable id of the party to call back.
    public var handle: String
    /// Label iOS showed for the entry.
    public var displayName: String
    public var isVideo: Bool
}

/// Payload of an incoming VoIP push, or a waiting call that was declined.
public struct VoIPIncomingPayload: Equatable, Sendable {
    public var roomName: String
    public var displayName: String
    public var handle: String
    public var isVideo: Bool
    public var avatarUrl: String?
}

/// Things that happen once, delivered through `VoIP.shared.events`. Read `callStatus` and the
/// other state properties for values that stay true over time.
///
/// Events are not replayed. Listen to `events` while your app is running.
public enum VoIPEvent: Equatable, Sendable {
    /// A new incoming call is ringing.
    case incoming(VoIPIncomingPayload)
    /// The user answered an incoming call. Join the room now, then call `reportConnected()`.
    case answered(VoIPCurrentCall)
    /// The current call ended. The same value is in `lastEndedReason`.
    case ended(CallEndedReason)
    /// The call was put on hold or resumed, from the system UI or a phone call.
    case heldChanged(Bool)
    /// The microphone was muted or unmuted from the system UI.
    case muteChanged(Bool)
    /// The user tapped a call in Recents. The same value is in `pendingCallIntent`.
    case callIntent(VoIPCallIntent)
    /// A second incoming call was declined while another call was active.
    case waitingCallDeclined(VoIPIncomingPayload)
    /// The push token was issued or changed. Send it to your server.
    case tokenUpdated(String)
}

/// Parsed fields from a VoIP push dictionary. `roomName` is required.
func parseVoIPIncomingPayload(_ raw: [AnyHashable: Any]) -> VoIPIncomingPayload? {
    guard let roomName = raw["roomName"] as? String, !roomName.trimmingCharacters(in: .whitespaces).isEmpty else {
        return nil
    }
    var displayName = (raw["displayName"] as? String)?.trimmingCharacters(in: .whitespaces) ?? ""
    if displayName.isEmpty {
        displayName = "Incoming call"
    }
    var handle = (raw["handle"] as? String)?.trimmingCharacters(in: .whitespaces) ?? ""
    if handle.isEmpty {
        handle = displayName
    }
    let isVideo: Bool
    if let number = raw["isVideo"] as? NSNumber {
        isVideo = number.boolValue
    } else if let string = raw["isVideo"] as? String {
        isVideo = (string as NSString).boolValue
    } else {
        isVideo = false
    }
    let avatarUrl = (raw["avatarUrl"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    return VoIPIncomingPayload(
        roomName: roomName,
        displayName: displayName,
        handle: handle,
        isVideo: isVideo,
        avatarUrl: avatarUrl
    )
}

/// Extracts a Recents / Siri call intent. Handles `INStartCallIntent` and the two older types.
func parseVoIPCallIntent(from userActivity: NSUserActivity) -> VoIPCallIntent? {
    guard let interaction = userActivity.interaction else {
        return nil
    }
    let intent = interaction.intent
    let person: INPerson?
    let isVideo: Bool
    if let start = intent as? INStartCallIntent {
        person = start.contacts?.first
        isVideo = start.callCapability == .videoCall
    } else if let audio = intent as? INStartAudioCallIntent {
        person = audio.contacts?.first
        isVideo = false
    } else if let video = intent as? INStartVideoCallIntent {
        person = video.contacts?.first
        isVideo = true
    } else {
        return nil
    }
    guard let handle = person?.personHandle?.value, !handle.isEmpty else {
        return nil
    }
    let rawName = person?.displayName ?? ""
    let displayName = rawName.isEmpty ? handle : rawName
    return VoIPCallIntent(handle: handle, displayName: displayName, isVideo: isVideo)
}

/// iOS VoIP push calls: PushKit + CallKit.
///
/// Call `registerForVoIPPushes()` from `application(_:didFinishLaunchingWithOptions:)` so
/// cold-start pushes can report an incoming call before the rest of the app is ready.
/// Forward Recents redials with `handleContinueUserActivity(_:)`.
///
/// The SDK never joins rooms. React to `callStatus` becoming `.connecting`, join, then call
/// `reportConnected()` within the answer deadline (10 s by default).
///
/// Requires `audio` and `voip` in `UIBackgroundModes`, the `aps-environment` entitlement, and
/// a real device (VoIP pushes never reach the Simulator).
public final class VoIP: NSObject, @unchecked Sendable {
    public static let shared = VoIP()

    private let stateLock = NSLock()
    private let eventHub = EventHub<VoIPEvent>()
    private var registry: PKPushRegistry?
    private var registryQueue: DispatchQueue?
    private var voipToken: String?
    private var callStatusValue: VoIPCallStatus = .available
    private var currentCallValue: VoIPCurrentCall?
    private var lastEndedReasonValue: CallEndedReason?
    private var isOnHoldValue = false
    private var isMutedValue = false
    private var pendingCallIntentValue: VoIPCallIntent?
    private var pendingIncomingCall: VoIPIncomingPayload?
    private var pendingSecondIncomingCall: VoIPIncomingPayload?
    private var pendingAnswerRequestId: String?
    private var pendingWaitingAnswer: String?
    private var activationInFlight = false
    private var callTransition = PromiseQueue()
    private var listeningToCallKit = false

    override private init() {
        super.init()
    }

    /// Things that happen once: incoming, answered, ended, hold and mute changes, token changes.
    /// Each access returns a new stream. Events are not replayed to streams created later.
    public var events: AsyncStream<VoIPEvent> {
        eventHub.stream()
    }

    public var token: String? {
        stateLock.lock()
        defer { stateLock.unlock() }
        return voipToken
    }

    public var callStatus: VoIPCallStatus {
        stateLock.lock()
        defer { stateLock.unlock() }
        return callStatusValue
    }

    public var currentCall: VoIPCurrentCall? {
        stateLock.lock()
        defer { stateLock.unlock() }
        return currentCallValue
    }

    public var lastEndedReason: CallEndedReason? {
        stateLock.lock()
        defer { stateLock.unlock() }
        return lastEndedReasonValue
    }

    public var isOnHold: Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return isOnHoldValue
    }

    public var isMuted: Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return isMutedValue
    }

    public var pendingCallIntent: VoIPCallIntent? {
        stateLock.lock()
        defer { stateLock.unlock() }
        return pendingCallIntentValue
    }

    /// Starts the PushKit registry. Safe to call more than once. Also turns on CallKit Recents.
    public static func registerForVoIPPushes() {
        shared.registerForVoIPPushes()
    }

    /// Routes a Recents / Siri call intent into `pendingCallIntent`.
    @discardableResult
    public static func handleContinueUserActivity(_ userActivity: NSUserActivity) -> Bool {
        shared.handleContinueUserActivity(userActivity)
    }

    public func clearCallIntent() {
        stateLock.lock()
        pendingCallIntentValue = nil
        stateLock.unlock()
    }

    /// Reports an outgoing call and moves to `connecting`. Does not join the room.
    public func startCall(to peer: String, roomName: String, isVideo: Bool = false) async throws {
        ensureCallKitListening()
        let call = VoIPCurrentCall(
            roomName: roomName,
            displayName: peer,
            handle: peer,
            isVideo: isVideo,
            avatarUrl: nil,
            startedAt: nil,
            isOutgoing: true
        )
        stateLock.lock()
        currentCallValue = call
        callStatusValue = .connecting
        lastEndedReasonValue = nil
        stateLock.unlock()

        do {
            try CallKit.shared.startSession(
                CallKitConfig(displayName: peer, handle: peer, isVideo: isVideo, isDialing: true)
            )
        } catch {
            await endCall(reason: .failed)
            throw error
        }
    }

    /// Report that the room join succeeded and media is flowing.
    public func reportConnected() async {
        ensureCallKitListening()
        stateLock.lock()
        guard var call = currentCallValue, call.startedAt == nil, !activationInFlight else {
            stateLock.unlock()
            return
        }
        activationInFlight = true
        let requestId = pendingAnswerRequestId
        let isOutgoing = call.isOutgoing
        let roomName = call.roomName
        stateLock.unlock()

        defer {
            stateLock.lock()
            activationInFlight = false
            stateLock.unlock()
        }

        if let requestId {
            stateLock.lock()
            pendingAnswerRequestId = nil
            stateLock.unlock()
            let connected = CallKit.shared.fulfillIncomingCallConnected(requestId)
            if !connected {
                stateLock.lock()
                let stillSame = currentCallValue?.roomName == roomName
                stateLock.unlock()
                if stillSame {
                    await endCall(reason: .failed)
                }
                return
            }
        } else if isOutgoing {
            CallKit.shared.reportOutgoingCallConnected()
        }

        stateLock.lock()
        guard var active = currentCallValue, active.roomName == roomName else {
            stateLock.unlock()
            return
        }
        active.startedAt = Date()
        currentCallValue = active
        callStatusValue = .active
        stateLock.unlock()
    }

    /// Tell the SDK the room join failed. Ends the call with reason `failed`.
    public func reportConnectFailed() async {
        stateLock.lock()
        let call = currentCallValue
        let requestId = pendingAnswerRequestId
        pendingAnswerRequestId = nil
        stateLock.unlock()
        guard let call else { return }

        if let requestId {
            CallKit.shared.failIncomingCallConnected(requestId)
            resetCallState(reason: .failed, endedRoomName: call.roomName)
            return
        }
        await endCall(reason: .failed)
    }

    /// Ends or rejects the current call.
    public func endCall(reason: CallEndedReason = .local, fromNative: Bool = false) async {
        stateLock.lock()
        let ended = currentCallValue
        stateLock.unlock()
        guard let ended else { return }

        resetCallState(reason: reason, endedRoomName: ended.roomName)
        if !fromNative {
            CallKit.shared.endSession(reason: reason)
        }
    }

    /// Requests that the CallKit session be held or resumed.
    public func setCallHeld(_ onHold: Bool) {
        guard currentCall != nil else { return }
        CallKit.shared.setHeld(onHold)
    }

    /// Updates the mute button in the system UI.
    public func setMuted(_ muted: Bool) {
        guard currentCall != nil else { return }
        CallKit.shared.setMuted(muted)
    }

    // MARK: - PushKit / Recents

    private func registerForVoIPPushes() {
        ensureCallKitListening()
        CallKit.shared.enableCallsInRecents()
        CallKit.shared.onWaitingCallPromoted = { [weak self] in
            self?.revealPendingSecondIncomingCall()
        }
        CallKit.shared.onWaitingCallDiscarded = { [weak self] in
            self?.discardPendingSecondIncomingCall()
        }
        CallKit.shared.onCurrentCallCleared = { [weak self] in
            self?.clearPendingIncomingCall()
        }

        if registry != nil { return }
        let queue = DispatchQueue(label: "io.fishjam.voippush")
        registryQueue = queue
        let created = PKPushRegistry(queue: queue)
        created.delegate = self
        created.desiredPushTypes = [.voIP]
        registry = created
    }

    @discardableResult
    private func handleContinueUserActivity(_ userActivity: NSUserActivity) -> Bool {
        guard let intent = parseVoIPCallIntent(from: userActivity) else { return false }
        stateLock.lock()
        if currentCallValue != nil {
            stateLock.unlock()
            os_log("[VoIP] Ignoring call intent while another call is active")
            return true
        }
        pendingCallIntentValue = intent
        stateLock.unlock()
        eventHub.emit(.callIntent(intent))
        return true
    }

    // MARK: - Incoming push handling

    private func handleIncomingPush(_ payload: VoIPIncomingPayload, slot: IncomingCallSlot) {
        switch slot {
        case .rejected:
            eventHub.emit(.waitingCallDeclined(payload))
        case .current:
            pendingIncomingCall = payload
            applyIncoming(payload)
        case .waiting:
            pendingSecondIncomingCall = payload
        }
    }

    private func applyIncoming(_ payload: VoIPIncomingPayload) {
        callTransition.enqueue { [weak self] in
            guard let self else { return }
            let call = VoIPCurrentCall(
                roomName: payload.roomName,
                displayName: payload.displayName,
                handle: payload.handle,
                isVideo: payload.isVideo,
                avatarUrl: payload.avatarUrl,
                startedAt: nil,
                isOutgoing: false
            )
            self.stateLock.lock()
            self.currentCallValue = call
            self.pendingAnswerRequestId = nil
            self.isOnHoldValue = false
            self.isMutedValue = false
            self.callStatusValue = .incoming
            self.lastEndedReasonValue = nil
            let pendingAnswer = self.pendingWaitingAnswer
            if let pendingAnswer {
                self.pendingWaitingAnswer = nil
                self.pendingAnswerRequestId = pendingAnswer
                self.callStatusValue = .connecting
            }
            self.stateLock.unlock()

            self.eventHub.emit(.incoming(payload))
            if pendingAnswer != nil {
                self.eventHub.emit(.answered(call))
            }
        }
    }

    private func revealPendingSecondIncomingCall() {
        guard let payload = pendingSecondIncomingCall else { return }
        pendingSecondIncomingCall = nil
        pendingIncomingCall = payload
        applyIncoming(payload)
    }

    private func discardPendingSecondIncomingCall() {
        guard let payload = pendingSecondIncomingCall else { return }
        pendingSecondIncomingCall = nil
        eventHub.emit(.waitingCallDeclined(payload))
    }

    private func clearPendingIncomingCall() {
        pendingIncomingCall = nil
    }

    // MARK: - CallKit event listening

    private func ensureCallKitListening() {
        guard !listeningToCallKit else { return }
        listeningToCallKit = true
        Task { [weak self] in
            guard let self else { return }
            for await event in CallKit.shared.events {
                self.handleCallKitEvent(event)
            }
        }
    }

    private func handleCallKitEvent(_ event: CallKitEvent) {
        switch event {
        case .started:
            break
        case .answered(let requestId):
            callTransition.enqueue { [weak self] in
                guard let self else { return }
                self.stateLock.lock()
                if self.pendingAnswerRequestId != nil {
                    self.stateLock.unlock()
                    return
                }
                let call = self.currentCallValue
                if call == nil || call?.startedAt != nil {
                    self.pendingWaitingAnswer = requestId
                    self.stateLock.unlock()
                    return
                }
                self.pendingAnswerRequestId = requestId
                self.callStatusValue = .connecting
                self.stateLock.unlock()
                if let call {
                    self.eventHub.emit(.answered(call))
                }
            }
        case .ended(let reason):
            callTransition.enqueue { [weak self] in
                guard let self else { return }
                await self.endCall(reason: reason, fromNative: true)
            }
        case .failed:
            callTransition.enqueue { [weak self] in
                guard let self else { return }
                await self.endCall(reason: .failed, fromNative: true)
            }
        case .held(let onHold):
            applyHeldChange(onHold)
        case .muted(let muted):
            applyMuteChange(muted)
        }
    }

    private func applyHeldChange(_ onHold: Bool) {
        stateLock.lock()
        guard currentCallValue?.startedAt != nil, isOnHoldValue != onHold else {
            stateLock.unlock()
            return
        }
        isOnHoldValue = onHold
        stateLock.unlock()
        eventHub.emit(.heldChanged(onHold))
    }

    private func applyMuteChange(_ muted: Bool) {
        stateLock.lock()
        guard currentCallValue?.startedAt != nil, isMutedValue != muted else {
            stateLock.unlock()
            return
        }
        isMutedValue = muted
        stateLock.unlock()
        eventHub.emit(.muteChanged(muted))
    }

    private func resetCallState(reason: CallEndedReason, endedRoomName: String?) {
        stateLock.lock()
        let roomName = endedRoomName ?? currentCallValue?.roomName
        guard let roomName, currentCallValue?.roomName == roomName else {
            stateLock.unlock()
            return
        }
        currentCallValue = nil
        pendingAnswerRequestId = nil
        pendingWaitingAnswer = nil
        isOnHoldValue = false
        isMutedValue = false
        callStatusValue = .available
        lastEndedReasonValue = reason
        stateLock.unlock()
        eventHub.emit(.ended(reason))
    }
}

extension VoIP: PKPushRegistryDelegate {
    public func pushRegistry(
        _ registry: PKPushRegistry,
        didUpdate pushCredentials: PKPushCredentials,
        for type: PKPushType
    ) {
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        stateLock.lock()
        if token == voipToken {
            stateLock.unlock()
            return
        }
        voipToken = token
        stateLock.unlock()
        eventHub.emit(.tokenUpdated(token))
    }

    public func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        stateLock.lock()
        voipToken = nil
        stateLock.unlock()
    }

    public func pushRegistry(
        _ registry: PKPushRegistry,
        didReceiveIncomingPushWith payload: PKPushPayload,
        for type: PKPushType,
        completion: @escaping () -> Void
    ) {
        defer { completion() }
        guard let parsed = parseVoIPIncomingPayload(payload.dictionaryPayload) else {
            os_log("[VoIP] Incoming push missing roomName")
            // Still report a transient call so PushKit is satisfied.
            DispatchQueue.main.sync {
                _ = CallKit.shared.reportIncomingCall(
                    displayName: "Incoming call",
                    handle: "unknown",
                    isVideo: false
                )
            }
            return
        }

        var slot: IncomingCallSlot = .rejected
        DispatchQueue.main.sync {
            slot = CallKit.shared.reportIncomingCall(
                displayName: parsed.displayName,
                handle: parsed.handle,
                isVideo: parsed.isVideo
            )
        }
        handleIncomingPush(parsed, slot: slot)
    }
}

/// Serializes async work so End & Accept cannot interleave state transitions.
private final class PromiseQueue: @unchecked Sendable {
    private let lock = NSLock()
    private var tail: Task<Void, Never> = Task {}

    func enqueue(_ work: @escaping @Sendable () async -> Void) {
        lock.lock()
        let previous = tail
        tail = Task {
            await previous.value
            await work()
        }
        lock.unlock()
    }
}
