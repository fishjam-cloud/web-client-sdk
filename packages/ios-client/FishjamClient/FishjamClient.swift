import Combine
import Foundation
import UIKit
import WebRTC

/// Called by the core on its own thread. Holds the client weakly so the core does not keep it alive.
private final class CoreListener: CoreEventListener, @unchecked Sendable {
    weak var client: FishjamClient?

    func onEvent(event: CoreEvent) {
        DispatchQueue.main.async { [weak self] in
            self?.client?.apply(event)
        }
    }
}

public final class FishjamClient: ObservableObject, @unchecked Sendable {
    @Published public private(set) var peerStatus = PeerStatus.idle
    @Published public private(set) var roomState = RoomState.empty
    /// Peer id to speaking. Remote peers follow the server. The local peer follows the microphone level.
    @Published public private(set) var voiceActivity: [String: Bool] = [:]
    @Published public private(set) var reconnectionStatus = ReconnectionStatus.idle
    /// `true` when both the reliable and the lossy data channel are open.
    @Published public internal(set) var dataChannelReady = false
    /// `true` while `initializeDataChannel()` is setting up the channels.
    @Published public internal(set) var dataChannelLoading = false
    /// The last data channel setup or publish error. Cleared by the next `initializeDataChannel()`.
    @Published public internal(set) var dataChannelError: Error?
    var localVadStatus = VadStatus.silence
    var localVoiceTask: Task<Void, Never>?
    public var isCameraOn: Bool { camera.isOn }
    public var currentCamera: CameraDevice? { camera.currentCamera }
    public var isMicrophoneOn: Bool { microphone.isOn }
    public var isScreenSharing: Bool { screenShare.isOn }
    public var cameraDeviceError: DeviceError? { camera.deviceError }
    public var microphoneDeviceError: DeviceError? { microphone.deviceError }
    public var screenShareError: DeviceError? { screenShare.deviceError }
    /// App Group and Broadcast Upload Extension ids. When nil, Info.plist keys
    /// `RTCAppGroupIdentifier` and `RTCScreenSharingExtension` are used.
    public var screenShareConfig: ScreenShareConfig?
    @Published public private(set) var currentAudioOutput: AudioDevice?
    @Published public private(set) var availableAudioOutputs: [AudioDevice] = []
    /// When set, the client starts a CallKit session once the peer is connected and ends it when
    /// the room ends. Reconnecting keeps the session. Set it before `joinRoom`.
    /// System UI actions arrive on `CallKit.shared.events`.
    public var callKitConfig: CallKitConfig?

    private let core: FishjamCoreClient
    private var joinContinuation: CheckedContinuation<Void, Error>?
    private var statusWaiters: [StatusWaiter] = []
    private var captureGeneration = 0
    private lazy var deviceHost: DeviceHost = ClientHost(client: self)
    private lazy var camera = CameraController(host: deviceHost)
    private lazy var microphone = MicrophoneController(host: deviceHost)
    lazy var screenShare = ScreenShareController(host: deviceHost) { [weak self] in
        self?.screenShareConfig
    }
    private var deviceChanges: [AnyCancellable] = []
    private let initializeLock = NSLock()
    private var devicesInitialized = false
    private var initializeTask: Task<InitializeDevicesResult, Never>?
    private var audioOnly = false
    private var localCamera: VideoTrack?
    private var closed = false
    private let audioOutput = AudioOutputManager()
    private var inCommunicationMode = false
    private let eventHub = EventHub<FishjamEvent>()
    private var eventMapper = FishjamEventMapper()
    private var liveLocalTracks: [String: String] = [:]
    private var startedCallKitSession = false
    private var cameraAccessObservers: [NSObjectProtocol] = []

    private lazy var session: MediaSession = MediaSession(
        core: { [weak self] in
            self?.activeCore
        },
        onMediaChanged: { [unowned self] in
            DispatchQueue.main.async {
                self.refreshMedia()
            }
        },
        onScreenCaptureEnded: { [weak self] in
            self?.screenShare.onSystemStopped()
        },
        dataChannels: dataChannels
    )

    lazy var dataChannels = DataChannels(
        encode: { [weak self] payload in
            self?.activeCore?.encodeDataMessage(data: payload) ?? payload
        },
        decode: { decodeDataMessage(bytes: $0) },
        deliver: { block in DispatchQueue.main.async(execute: block) },
        onChange: { [weak self] state in
            DispatchQueue.main.async { self?.applyDataChannelState(state) }
        }
    )

    private lazy var networkMonitor = NetworkMonitor { [weak self] online, networkId in
        DispatchQueue.main.async {
            guard let self, !self.closed else { return }
            self.core.networkStatusChanged(online: online, networkId: networkId)
        }
    }

    public init(
        fishjamId: String,
        debug: Bool = false,
        reconnect: ReconnectConfig = ReconnectConfig(),
        bandwidthLimits: BandwidthLimits = BandwidthLimits(),
        videoConfig: VideoConfig = VideoConfig()
    ) {
        installLogger(debug: debug)
        let config = CoreClientConfig(
            fishjamId: fishjamId,
            debug: debug,
            clientType: "ios",
            reconnectConfig: reconnect.toCore(),
            bandwidthLimits: bandwidthLimits.toCore(),
            videoConfig: videoConfig.toCore()
        )
        let listener = CoreListener()
        core = FishjamCoreClient(config: config, listener: listener)
        listener.client = self
        deviceChanges = [
            camera.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() },
            microphone.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() },
            screenShare.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }
        ]
        networkMonitor.start()
        let outputs = audioOutput.snapshot()
        currentAudioOutput = outputs.current
        availableAudioOutputs = outputs.available
        audioOutput.onChange = { [weak self] current, available in
            self?.currentAudioOutput = current
            self?.availableAudioOutputs = available
        }
        audioOutput.startObserving()
        observeCameraAccess()
        startLocalVoiceActivity()
    }

    deinit {
        closed = true
        localVoiceTask?.cancel()
        eventHub.finish()
        cameraAccessObservers.forEach(NotificationCenter.default.removeObserver)
        if startedCallKitSession {
            CallKit.shared.endSession()
        }
        audioOutput.stopObserving()
        if inCommunicationMode {
            inCommunicationMode = false
            audioOutput.exitCommunicationMode()
        }
        networkMonitor.stop()
        session.close()
    }

    /// Every connection, auth, reconnection, peer, track and local-track event, in order.
    /// Each access returns a new stream that starts at the next event. It ends when the client is released.
    /// The stream keeps the newest 1024 events when the consumer is slow.
    public var events: AsyncStream<FishjamEvent> {
        eventHub.stream()
    }

    public func joinRoom(peerToken: String, peerMetadata: [String: Any] = [:]) async throws {
        let metadata = try JSONSerialization.data(withJSONObject: peerMetadata)
        let metadataJSON = String(data: metadata, encoding: .utf8) ?? "{}"
        try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.main.async {
                self.joinContinuation = continuation
                do {
                    try self.activeCore?.joinRoom(peerToken: peerToken, peerMetadataJson: metadataJSON)
                } catch let error as CoreError {
                    self.joinContinuation = nil
                    continuation.resume(throwing: joinRoomError(of: error))
                } catch {
                    self.joinContinuation = nil
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    public func leaveRoom() {
        DispatchQueue.main.async {
            let continuation = self.joinContinuation
            self.joinContinuation = nil
            continuation?.resume(throwing: CancellationError())
            self.captureGeneration += 1
            self.camera.reset()
            self.microphone.reset()
            self.screenShare.reset()
            Array(self.liveLocalTracks.keys).sorted().forEach { self.localTrackRemoved(trackId: $0) }
            let generation = self.captureGeneration
            let pending = self.statusWaiters
            self.statusWaiters = []
            pending.forEach { $0.continuation.resume() }
            self.session.releaseLocalDevices(generation: generation)
            self.stopLocalVoiceActivity()
            self.setRoom(.empty)
            self.activeCore?.leaveRoom()
        }
    }

    fileprivate func apply(_ event: CoreEvent) {
        guard !closed else { return }
        let media = session.mediaSnapshot()
        applyState(event, media: media)
        eventHub.emit(eventMapper.map(event, media: media))
    }

    private func applyState(_ event: CoreEvent, media: [String: RTCMediaStreamTrack]) {
        if let peerTrack = peerTrackEvent(of: event, media: media) {
            setRoom(applying(peerTrack, to: roomState))
            return
        }
        switch event {
        case let .authenticated(audioOnly):
            self.audioOnly = audioOnly
        case .peerStatusChanged:
            applyStatus(event)
        case .reconnectionStatusChanged:
            if let status = reconnectionStatusUpdate(event) {
                reconnectionStatus = status
            }
        case let .roomStateChanged(changed):
            setRoom(makeRoomState(changed).attaching(media))
        case .voiceActivityChanged:
            break
        default:
            session.handle(event)
        }
    }

    func setRoom(_ room: RoomState) {
        let next = withLocalCamera(room).applyingLocalMicrophoneVad(localVadStatus)
        roomState = next
        voiceActivity = voiceActivityMap(of: next)
    }

    func emit(_ event: FishjamEvent) {
        eventHub.emit(event)
    }

    private func applyStatus(_ event: CoreEvent) {
        guard let update = peerStatusUpdate(event) else { return }
        let roomChange = communicationModeChange(from: peerStatus, to: update.peerStatus)
        applyCommunicationMode(roomChange)
        applyCallKitSession(roomChange)
        peerStatus = update.peerStatus
        if update.peerStatus == .idle {
            audioOnly = false
        }
        if update.peerStatus != .connected {
            dataChannels.reset()
        }
        resumeStatusWaiters()
        guard let continuation = joinContinuation else { return }
        if update.peerStatus == .connected {
            joinContinuation = nil
            continuation.resume()
        } else if let error = joinFailure(update) {
            joinContinuation = nil
            continuation.resume(throwing: error)
        }
    }

    private func resumeStatusWaiters() {
        var stillWaiting: [StatusWaiter] = []
        for waiter in statusWaiters {
            if waiter.isStale() || waiter.matches(peerStatus) {
                waiter.continuation.resume()
            } else {
                stillWaiting.append(waiter)
            }
        }
        statusWaiters = stillWaiting
    }

    /// `nil` once the client is closed, so late WebRTC callbacks do nothing.
    var activeCore: FishjamCoreClient? {
        closed ? nil : core
    }

    /// Runs a core call that can fail, turning a core error into `MediaErrorMessage`.
    private func mediaCall(_ body: (FishjamCoreClient) throws -> Void) throws {
        guard let core = activeCore else { return }
        do {
            try body(core)
        } catch let error as CoreError {
            throw MediaErrorMessage(error.detail)
        }
    }
}

extension FishjamClient {
    /// WebRTC stats for the connection, or for one track when `trackId` is set.
    public func getStatistics(trackId: String? = nil) async -> [RtcStats] {
        await session.statistics(trackId: trackId)
    }

    /// Outgoing bandwidth estimate in bits per second. `0` when it is not available.
    public func getBandwidthEstimation() async -> Int64 {
        outgoingBitrateBps(await session.statistics(trackId: nil))
    }

    /// Local microphone level from 0.0 to 1.0.
    /// `nil` when the track is unknown, has no sender, or the stats have no audio level.
    public func getLocalTrackAudioLevel(trackId: String) async -> Double? {
        audioLevel(await session.statistics(trackId: trackId))
    }

    public func setTrackBandwidth(trackId: String, limit: BandwidthLimit) throws {
        try mediaCall {
            try $0.setTrackBandwidth(trackId: trackId, singleKbps: limit.singleKbps, layers: limit.layers)
        }
        eventHub.emit(.localTrackBandwidthSet(trackId: trackId, limit: limit))
    }

    public func setEncodingBandwidth(trackId: String, variant: Variant, kbps: Int) throws {
        try mediaCall {
            try $0.setEncodingBandwidth(trackId: trackId, variant: variant.core, kbps: nonNegativeKbps(kbps))
        }
        eventHub.emit(.localTrackEncodingBandwidthSet(trackId: trackId, variant: variant, kbps: kbps))
    }

    public func setReceivedQuality(trackId: String, variant: Variant) throws {
        try mediaCall {
            try $0.setTargetTrackVariant(trackId: trackId, variant: variant.core)
        }
    }

    public func updatePeerMetadata(_ peerMetadata: [String: Any]) throws {
        let data = try JSONSerialization.data(withJSONObject: peerMetadata)
        let metadataJSON = String(data: data, encoding: .utf8) ?? "{}"
        do {
            try activeCore?.updatePeerMetadata(peerMetadataJson: metadataJSON)
        } catch let error as CoreError {
            throw joinRoomError(of: error)
        }
        eventHub.emit(.localPeerMetadataChanged(metadata: peerMetadata))
    }

    public func cameraDevices() -> [CameraDevice] {
        camera.devices()
    }

    fileprivate func applyCommunicationMode(_ enabled: Bool?) {
        guard let enabled, inCommunicationMode != enabled else { return }
        inCommunicationMode = enabled
        if enabled {
            audioOutput.enterCommunicationMode()
        } else {
            audioOutput.exitCommunicationMode()
        }
    }

    /// `true` starts the `callKitConfig` session, `false` ends the session this client started.
    fileprivate func applyCallKitSession(_ roomConnected: Bool?) {
        switch callKitSessionStep(
            roomConnected: roomConnected,
            config: callKitConfig,
            started: startedCallKitSession
        ) {
        case .start(let config):
            do {
                try CallKit.shared.startSession(config)
                startedCallKitSession = true
            } catch {
                NSLog("FishjamClient: CallKit session not started: %@", error.localizedDescription)
            }
        case .end:
            startedCallKitSession = false
            if CallKit.shared.hasActiveSession {
                CallKit.shared.endSession()
            }
        case .none:
            break
        }
    }

    /// iOS stops the camera in the background unless the capture session allows multitasking access.
    /// The capture session may not exist when the call starts, so this runs again as the app resigns active.
    private func observeCameraAccess() {
        let apply: (Notification) -> Void = { [weak self] _ in
            guard let self, !self.closed else { return }
            self.session.setMultitaskingCameraAccess(CallKit.isVideoCallActive)
        }
        cameraAccessObservers = [
            NotificationCenter.default.addObserver(
                forName: .fishjamCallKitVideoCallChanged, object: nil, queue: .main, using: apply
            ),
            NotificationCenter.default.addObserver(
                forName: UIApplication.willResignActiveNotification, object: nil, queue: .main, using: apply
            )
        ]
    }

    /// Lets `PictureInPictureController` keep the camera capturing in the background.
    func setPictureInPictureCameraAccess(_ enabled: Bool) {
        guard !closed else { return }
        session.setPictureInPictureCameraAccess(enabled)
    }

    /// Opens the system route picker. This is how a specific Bluetooth or AirPlay device is chosen.
    public func showAudioRoutePicker() {
        audioOutput.showAudioRoutePicker()
    }

    /// Forces the built-in speaker, or clears that override with `.none`.
    public func overrideAudioOutput(_ output: AudioOutputOverride) throws {
        try audioOutput.overrideAudioOutput(output)
    }

    /// Switches to `deviceId` from `cameraDevices()`.
    /// An open camera stays the same video track, so the room and the published track stay.
    public func selectCamera(deviceId: String) async throws {
        try await camera.select(deviceId: deviceId)
    }

    /// Starts the camera and returns its video track. Returns the running track when the camera is already on.
    @discardableResult
    public func startCamera() async throws -> VideoTrack {
        try await camera.start()
    }

    public func stopCamera() async throws {
        try await camera.stop()
    }

    public func toggleCamera() async throws {
        try await camera.toggle()
    }

    /// Starts the microphone and returns its audio track. Returns the running track when the microphone is already on.
    @discardableResult
    public func startMicrophone() async throws -> AudioTrack {
        try await microphone.start()
    }

    public func stopMicrophone() async throws {
        try await microphone.stop()
    }

    public func toggleMicrophone() async throws {
        try await microphone.toggle()
    }

    /// Starts the camera and microphone in one call.
    /// Shows the permission dialog for each requested device that is not granted yet.
    /// A later call returns `alreadyInitialized`.
    public func initializeDevices(
        enableVideo: Bool = true,
        enableAudio: Bool = true
    ) async -> InitializeDevicesResult {
        let running: Task<InitializeDevicesResult, Never>?
        initializeLock.lock()
        if devicesInitialized {
            initializeLock.unlock()
            return InitializeDevicesResult(status: .alreadyInitialized, errors: nil)
        }
        running = initializeTask
        if running == nil {
            let task = Task {
                await self.runInitializeDevices(enableVideo: enableVideo, enableAudio: enableAudio)
            }
            initializeTask = task
            initializeLock.unlock()
            return await withTaskCancellationHandler {
                await task.value
            } onCancel: {
                task.cancel()
            }
        }
        initializeLock.unlock()
        _ = await running?.value
        return await initializeDevices(enableVideo: enableVideo, enableAudio: enableAudio)
    }

    private func runInitializeDevices(enableVideo: Bool, enableAudio: Bool) async -> InitializeDevicesResult {
        let generation = await MainActor.run { self.captureGeneration }
        let videoError: DeviceError?
        if enableVideo {
            do {
                videoError = try await camera.startRequested()
            } catch is TrackTypeError {
                videoError = nil
            } catch {
                finishInitializeDevices(markInitialized: false)
                return interruptedInitializeDevicesResult(videoRequested: enableVideo, audioRequested: enableAudio)
            }
        } else {
            videoError = nil
        }
        let audioError: DeviceError?
        do {
            audioError = enableAudio ? try await microphone.startRequested() : nil
        } catch {
            finishInitializeDevices(markInitialized: false)
            return interruptedInitializeDevicesResult(videoRequested: enableVideo, audioRequested: enableAudio)
        }
        let finished = await MainActor.run { !self.closed && self.captureGeneration == generation }
        finishInitializeDevices(markInitialized: finished)
        if finished {
            return initializeDevicesResult(
                videoRequested: enableVideo,
                audioRequested: enableAudio,
                videoError: videoError,
                audioError: audioError
            )
        }
        return interruptedInitializeDevicesResult(videoRequested: enableVideo, audioRequested: enableAudio)
    }

    private func finishInitializeDevices(markInitialized: Bool) {
        initializeLock.lock()
        initializeTask = nil
        if markInitialized {
            devicesInitialized = true
        }
        initializeLock.unlock()
    }

    private func removePublishedTrack(_ trackId: String) async throws {
        try await MainActor.run {
            do {
                try self.activeCore?.removeTrack(trackId: trackId)
            } catch let error as CoreError where error.detail != "Cannot find track" {
                throw MediaErrorMessage(error.detail)
            } catch is CoreError {
                return
            }
        }
    }

    private func publish(kind: CoreTrackKind, type: CoreTrackType) throws -> String {
        guard peerStatus == .connected, let core = activeCore else {
            throw MediaErrorMessage("Cannot add tracks before being accepted by the server")
        }
        let metadata = CoreTrackMetadata(trackType: type, paused: false, displayName: nil)
        do {
            return try core.addTrack(kind: kind, metadata: metadata)
        } catch let error as CoreError {
            if isTrackTypeError(error) {
                throw TrackTypeError()
            }
            throw MediaErrorMessage(error.detail)
        }
    }

    private func setLocalCamera(_ track: VideoTrack?) {
        localCamera = track
        setRoom(roomState)
    }

    private func withLocalCamera(_ current: RoomState) -> RoomState {
        guard let track = localCamera else {
            return clearingLocalCameraPreview(current)
        }
        guard current.localPeer?.cameraTrack?.videoTrack == nil else {
            return current
        }
        let existing = current.localPeer?.cameraTrack
        let camera = Track(
            trackId: existing?.trackId ?? "",
            metadata: TrackMetadata(type: "camera", paused: false, displayName: nil),
            videoTrack: track,
            audioTrack: nil,
            simulcastConfig: existing?.simulcastConfig ?? .disabled,
            encoding: existing?.encoding
        )
        let otherTracks = current.localPeer?.tracks.filter { $0.metadata?.type != "camera" } ?? []
        var local = current.localPeer ?? .empty
        local.cameraTrack = camera
        local.tracks = [camera] + otherTracks
        return RoomState(localPeer: local, remotePeers: current.remotePeers)
    }

    private func clearingLocalCameraPreview(_ current: RoomState) -> RoomState {
        guard var local = current.localPeer else { return current }
        let hasPreview = local.cameraTrack?.videoTrack != nil
            || local.tracks.contains { $0.metadata?.type == "camera" && $0.videoTrack != nil }
        guard hasPreview else { return current }
        if var camera = local.cameraTrack {
            camera.videoTrack = nil
            local.cameraTrack = camera
        }
        local.tracks = local.tracks.map { track in
            guard track.metadata?.type == "camera" else { return track }
            var copy = track
            copy.videoTrack = nil
            return copy
        }
        return RoomState(localPeer: local, remotePeers: current.remotePeers)
    }

    /// Gives the controllers access to this client. The controllers call these members on the main thread.
    private final class ClientHost: DeviceHost {
        private unowned let client: FishjamClient

        init(client: FishjamClient) {
            self.client = client
        }

        var session: MediaSession { client.session }
        var peerStatus: PeerStatus { client.peerStatus }
        var captureGeneration: Int { client.captureGeneration }
        var isClosed: Bool { client.closed }

        func resumeStatusWaiters() {
            client.resumeStatusWaiters()
        }

        func waitForPeerStatus(
            _ matches: @escaping (PeerStatus) -> Bool,
            whileCurrent isCurrent: @escaping () -> Bool
        ) async {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                DispatchQueue.main.async {
                    if !isCurrent() || matches(self.client.peerStatus) {
                        continuation.resume()
                        return
                    }
                    self.client.statusWaiters.append(
                        StatusWaiter(
                            matches: matches,
                            isStale: { !isCurrent() },
                            continuation: continuation
                        )
                    )
                }
            }
        }

        var audioOnly: Bool { client.audioOnly }

        func publish(kind: CoreTrackKind, type: CoreTrackType) throws -> String {
            try client.publish(kind: kind, type: type)
        }

        func removePublishedTrack(_ trackId: String) async throws {
            try await client.removePublishedTrack(trackId)
        }

        func setLocalCamera(_ track: VideoTrack?) {
            client.setLocalCamera(track)
        }

        func localTrackAdded(trackId: String, type: CoreTrackType) {
            client.localTrackAdded(trackId: trackId, type: trackTypeName(type))
        }

        func localTrackRemoved(trackId: String) {
            client.localTrackRemoved(trackId: trackId)
        }

        func localTracksReplaced(type: CoreTrackType) {
            client.localTracksReplaced(type: trackTypeName(type))
        }
    }

    private func localTrackAdded(trackId: String, type: String) {
        guard liveLocalTracks[trackId] == nil else { return }
        liveLocalTracks[trackId] = type
        eventHub.emit(.localTrackAdded(trackId: trackId, type: type))
    }

    /// Does nothing for an id that is not published, so a track is reported removed once.
    private func localTrackRemoved(trackId: String) {
        guard liveLocalTracks.removeValue(forKey: trackId) != nil else { return }
        eventHub.emit(.localTrackRemoved(trackId: trackId))
    }

    private func localTracksReplaced(type: String) {
        let ids = liveLocalTracks.filter { $0.value == type }.keys.sorted()
        eventHub.emit(ids.map { .localTrackReplaced(trackId: $0) })
    }

    private func refreshMedia() {
        guard !closed else { return }
        setRoom(roomState.attaching(session.mediaSnapshot()))
    }
}

private func onMain(_ body: @escaping () -> Void) {
    if Thread.isMainThread {
        body()
    } else {
        DispatchQueue.main.sync(execute: body)
    }
}

private struct StatusWaiter {
    let matches: (PeerStatus) -> Bool
    let isStale: () -> Bool
    let continuation: CheckedContinuation<Void, Never>
}

private struct MediaErrorMessage: LocalizedError {
    let message: String

    init(_ message: String) {
        self.message = message
    }

    var errorDescription: String? {
        message
    }
}
