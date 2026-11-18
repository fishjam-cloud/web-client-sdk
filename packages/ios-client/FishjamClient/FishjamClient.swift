import Combine
import FishjamCore
import Foundation
import WebRTC

private final class EventBox {
    weak var client: FishjamClient?
}

private func fishjamOnEvent(
    _ userData: UnsafeMutableRawPointer?,
    _ event: UnsafePointer<UInt8>?,
    _ eventLength: Int
) {
    guard let userData, let event else {
        return
    }
    let data = Data(bytes: event, count: eventLength)
    let box = Unmanaged<EventBox>.fromOpaque(userData).takeUnretainedValue()
    DispatchQueue.main.async {
        box.client?.apply(data)
    }
}

public final class FishjamClient: ObservableObject, @unchecked Sendable {
    @Published public private(set) var peerStatus = PeerStatus.idle
    @Published public private(set) var roomState = RoomState.empty
    @Published public private(set) var reconnectionStatus = ReconnectionStatus.idle
    public var isCameraOn: Bool { camera.isOn }
    public var currentCamera: CameraDevice? { camera.currentCamera }
    public var isMicrophoneOn: Bool { microphone.isOn }
    public var cameraDeviceError: DeviceError? { camera.deviceError }
    public var microphoneDeviceError: DeviceError? { microphone.deviceError }
    @Published public private(set) var currentAudioOutput: AudioDevice?
    @Published public private(set) var availableAudioOutputs: [AudioDevice] = []

    private let handle: OpaquePointer
    private let eventBoxPointer: UnsafeMutableRawPointer
    private var joinContinuation: CheckedContinuation<Void, Error>?
    private var statusWaiters: [StatusWaiter] = []
    private var captureGeneration = 0
    private lazy var deviceHost: DeviceHost = ClientHost(client: self)
    private lazy var camera = CameraController(host: deviceHost)
    private lazy var microphone = MicrophoneController(host: deviceHost)
    private var deviceChanges: [AnyCancellable] = []
    private let initializeLock = NSLock()
    private var devicesInitialized = false
    private var initializeTask: Task<InitializeDevicesResult, Never>?
    private var localCamera: VideoTrack?
    private var closed = false
    private let audioOutput = AudioOutputManager()
    private var inCommunicationMode = false
    private var roomEventHandlers: [UUID: (RoomEvent) -> Void] = [:]

    private lazy var session: MediaSession = MediaSession(
        call: { [unowned self] content in
            _ = self.call(content)
        },
        onMediaChanged: { [unowned self] in
            DispatchQueue.main.async {
                self.refreshMedia()
            }
        }
    )

    private lazy var networkMonitor = NetworkMonitor { [weak self] online, networkId in
        DispatchQueue.main.async {
            guard let self, !self.closed else { return }
            _ = self.call(.networkStatusChanged(Fishjam_Sdk_NetworkStatusChanged.with {
                $0.online = online
                $0.networkID = networkId
            }))
        }
    }

    public init(fishjamId: String, debug: Bool = false, reconnect: ReconnectConfig = ReconnectConfig()) {
        fishjam_install_logger(debug)
        var config = Fishjam_Sdk_ClientConfig()
        config.fishjamID = fishjamId
        config.debug = debug
        config.clientType = "ios"
        config.reconnectConfig = reconnect.toProto()
        let bytes = (try? config.serializedData()) ?? Data()
        let box = EventBox()
        let userData = Unmanaged.passRetained(box).toOpaque()
        guard let created = bytes.withUnsafeBytes({ raw in
            fishjam_client_new(
                raw.bindMemory(to: UInt8.self).baseAddress,
                bytes.count,
                fishjamOnEvent,
                userData
            )
        }) else {
            fatalError("fishjam_client_new returned null")
        }
        handle = created
        eventBoxPointer = userData
        box.client = self
        deviceChanges = [
            camera.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() },
            microphone.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }
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
    }

    deinit {
        closed = true
        audioOutput.stopObserving()
        if inCommunicationMode {
            inCommunicationMode = false
            audioOutput.exitCommunicationMode()
        }
        networkMonitor.stop()
        session.close()
        fishjam_client_free(handle)
        Unmanaged<EventBox>.fromOpaque(eventBoxPointer).release()
    }

    @discardableResult
    public func addRoomEventHandler(_ handler: @escaping (RoomEvent) -> Void) -> UUID {
        let id = UUID()
        onMain { self.roomEventHandlers[id] = handler }
        return id
    }

    public func removeRoomEventHandler(_ id: UUID) {
        onMain { self.roomEventHandlers.removeValue(forKey: id) }
    }

    public func joinRoom(peerToken: String, peerMetadata: [String: Any] = [:]) async throws {
        let metadata = try JSONSerialization.data(withJSONObject: peerMetadata)
        let metadataJSON = String(data: metadata, encoding: .utf8) ?? "{}"
        try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.main.async {
                self.joinContinuation = continuation
                let (code, response) = self.call(.joinRoom(Fishjam_Sdk_JoinRoom.with {
                    $0.peerToken = peerToken
                    $0.peerMetadataJson = metadataJSON
                }))
                guard code == 0 else {
                    self.joinContinuation = nil
                    continuation.resume(throwing: joinRoomError(of: response.error))
                    return
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
            let generation = self.captureGeneration
            let pending = self.statusWaiters
            self.statusWaiters = []
            pending.forEach { $0.continuation.resume() }
            self.session.releaseLocalDevices(generation: generation)
            self.roomState = .empty
            _ = self.call(.leaveRoom(Fishjam_Sdk_LeaveRoom()))
        }
    }

    fileprivate func apply(_ data: Data) {
        guard !closed, let event = try? Fishjam_Sdk_SdkEvent(serializedBytes: data) else {
            return
        }
        if let roomEvent = roomEvent(of: event, media: session.mediaSnapshot()) {
            roomState = withLocalCamera(applying(roomEvent, to: roomState))
            let handlers = Array(roomEventHandlers.values)
            handlers.forEach { $0(roomEvent) }
            return
        }
        guard let content = event.content else { return }
        switch content {
        case .peerStatusChanged:
            applyStatus(event)
        case .reconnectionStatusChanged:
            if let status = reconnectionStatusUpdate(event) {
                reconnectionStatus = status
            }
        case .roomStateChanged(let changed):
            roomState = withLocalCamera(makeRoomState(changed.roomState).attaching(session.mediaSnapshot()))
        default:
            session.handle(event)
        }
    }

    private func applyStatus(_ event: Fishjam_Sdk_SdkEvent) {
        guard let update = peerStatusUpdate(event) else { return }
        applyCommunicationMode(communicationModeChange(from: peerStatus, to: update.peerStatus))
        peerStatus = update.peerStatus
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

    private func call(
        _ content: Fishjam_Sdk_SdkRequest.OneOf_Content
    ) -> (Int32, Fishjam_Sdk_SdkResponse) {
        if closed {
            return (0, Fishjam_Sdk_SdkResponse())
        }
        let request = Fishjam_Sdk_SdkRequest.with { $0.content = content }
        let bytes = (try? request.serializedData()) ?? Data()
        var out = FishjamBuf()
        let code = bytes.withUnsafeBytes { raw in
            fishjam_client_call(
                handle,
                raw.bindMemory(to: UInt8.self).baseAddress,
                bytes.count,
                &out
            )
        }
        let payload = out.data.map { Data(bytes: $0, count: out.len) } ?? Data()
        fishjam_buf_free(out)
        let response = (try? Fishjam_Sdk_SdkResponse(serializedBytes: payload)) ?? Fishjam_Sdk_SdkResponse()
        return (code, response)
    }
}

extension FishjamClient {
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

    public func startCamera() async throws {
        try await camera.start()
    }

    public func stopCamera() async throws {
        try await camera.stop()
    }

    public func toggleCamera() async throws {
        try await camera.toggle()
    }

    public func startMicrophone() async throws {
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
        let audioError: DeviceError?
        do {
            videoError = enableVideo ? try await camera.startRequested() : nil
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
            var remove = Fishjam_Sdk_RemoveTrack()
            remove.trackID = trackId
            let (code, response) = self.call(.removeTrack(remove))
            if code != 0 && response.error.message != "Cannot find track" {
                throw MediaErrorMessage(response.error.message)
            }
        }
    }

    private func publish(kind: Fishjam_Sdk_TrackKind, type: Fishjam_Sdk_TrackType) throws -> String {
        guard peerStatus == .connected else {
            throw MediaErrorMessage("Cannot add tracks before being accepted by the server")
        }
        var metadata = Fishjam_Sdk_TrackMetadata()
        metadata.type = type
        metadata.paused = false
        var add = Fishjam_Sdk_AddTrack()
        add.kind = kind
        add.metadata = metadata
        let (code, response) = call(.addTrack(add))
        guard code == 0 else {
            throw MediaErrorMessage(response.error.message)
        }
        return response.addTrack.trackID
    }

    private func setLocalCamera(_ track: VideoTrack?) {
        localCamera = track
        roomState = withLocalCamera(roomState)
    }

    private func withLocalCamera(_ current: RoomState) -> RoomState {
        guard let track = localCamera else {
            return clearingLocalCameraPreview(current)
        }
        guard current.localPeer?.cameraTrack?.videoTrack == nil else {
            return current
        }
        let camera = Track(
            trackId: current.localPeer?.cameraTrack?.trackId ?? "",
            metadata: TrackMetadata(type: "camera", paused: false, displayName: nil),
            videoTrack: track,
            audioTrack: nil
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

        func publish(kind: Fishjam_Sdk_TrackKind, type: Fishjam_Sdk_TrackType) throws -> String {
            try client.publish(kind: kind, type: type)
        }

        func removePublishedTrack(_ trackId: String) async throws {
            try await client.removePublishedTrack(trackId)
        }

        func setLocalCamera(_ track: VideoTrack?) {
            client.setLocalCamera(track)
        }
    }

    private func refreshMedia() {
        guard !closed else { return }
        roomState = withLocalCamera(roomState.attaching(session.mediaSnapshot()))
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
