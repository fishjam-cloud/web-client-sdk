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
    @Published public private(set) var isCameraOn = false
    @Published public private(set) var isMicrophoneOn = false

    private let handle: OpaquePointer
    private let eventBoxPointer: UnsafeMutableRawPointer
    private var joinContinuation: CheckedContinuation<Void, Error>?
    private var statusWaiters: [StatusWaiter] = []
    private var captureGeneration = 0
    private let deviceEpochLock = NSLock()
    private var cameraEpoch = 0
    private var microphoneEpoch = 0
    private var cameraPublishTask: Task<Void, Never>?
    private var microphonePublishTask: Task<Void, Never>?
    private var cameraTrackIds: [String] = []
    private var microphoneTrackIds: [String] = []
    private var localCamera: VideoTrack?
    private var closed = false
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
        networkMonitor.start()
    }

    deinit {
        closed = true
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
            self.bumpCameraEpoch()
            self.bumpMicrophoneEpoch()
            let generation = self.captureGeneration
            self.cameraPublishTask?.cancel()
            self.microphonePublishTask?.cancel()
            self.cameraPublishTask = nil
            self.microphonePublishTask = nil
            self.cameraTrackIds.removeAll()
            self.microphoneTrackIds.removeAll()
            let pending = self.statusWaiters
            self.statusWaiters = []
            pending.forEach { $0.continuation.resume() }
            self.localCamera = nil
            self.isCameraOn = false
            self.isMicrophoneOn = false
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

    private func waitUntil(
        generation: Int,
        epoch: Int,
        camera: Bool,
        _ matches: @escaping (PeerStatus) -> Bool
    ) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            DispatchQueue.main.async {
                let stale = !self.deviceCaptureCurrent(generation: generation, epoch: epoch, camera: camera)
                if stale || matches(self.peerStatus) {
                    continuation.resume()
                    return
                }
                self.statusWaiters.append(
                    StatusWaiter(
                        matches: matches,
                        isStale: { [weak self] in
                            guard let self else { return true }
                            return !self.deviceCaptureCurrent(generation: generation, epoch: epoch, camera: camera)
                        },
                        continuation: continuation
                    )
                )
            }
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
    public func startCamera() async throws {
        if await MainActor.run(body: { isCameraOn }) { return }
        let (generation, epoch) = await MainActor.run { (captureGeneration, bumpCameraEpoch()) }
        guard let track = try await session.startCamera(generation: generation, isCurrent: {
            self.cameraEpochValue() == epoch
        }) else { return }
        await MainActor.run {
            guard self.deviceCaptureCurrent(generation: generation, epoch: epoch, camera: true) else {
                return
            }
            self.isCameraOn = true
            self.showLocalCamera(track)
            self.cameraPublishTask?.cancel()
            self.cameraPublishTask = Task {
                await self.publishWhileConnected(
                    track: track,
                    kind: .video,
                    type: .camera,
                    generation: generation,
                    epoch: epoch,
                    camera: true
                )
            }
        }
    }

    public func stopCamera() async throws {
        let (generation, epoch, trackIds) = await MainActor.run { () -> (Int, Int, [String]) in
            let epoch = self.bumpCameraEpoch()
            self.cameraPublishTask?.cancel()
            self.cameraPublishTask = nil
            let ids = self.cameraTrackIds
            self.cameraTrackIds.removeAll()
            self.resumeStatusWaiters()
            return (self.captureGeneration, epoch, ids)
        }
        await session.stopCamera(generation: generation)
        for trackId in trackIds {
            try await removePublishedTrack(trackId)
        }
        await MainActor.run {
            guard self.cameraEpochValue() == epoch else { return }
            self.localCamera = nil
            self.isCameraOn = false
            self.roomState = self.withLocalCamera(self.roomState)
        }
    }

    public func toggleCamera() async throws {
        if await MainActor.run(body: { isCameraOn }) {
            try await stopCamera()
        } else {
            try await startCamera()
        }
    }

    public func startMicrophone() async throws {
        if await MainActor.run(body: { isMicrophoneOn }) { return }
        let (generation, epoch) = await MainActor.run { (captureGeneration, bumpMicrophoneEpoch()) }
        guard let track = try await session.startMicrophone(generation: generation, isCurrent: {
            self.microphoneEpochValue() == epoch
        }) else { return }
        await MainActor.run {
            guard self.deviceCaptureCurrent(generation: generation, epoch: epoch, camera: false) else {
                return
            }
            self.isMicrophoneOn = true
            self.microphonePublishTask?.cancel()
            self.microphonePublishTask = Task {
                await self.publishWhileConnected(
                    track: track,
                    kind: .audio,
                    type: .microphone,
                    generation: generation,
                    epoch: epoch,
                    camera: false
                )
            }
        }
    }

    public func stopMicrophone() async throws {
        let (generation, epoch, trackIds) = await MainActor.run { () -> (Int, Int, [String]) in
            let epoch = self.bumpMicrophoneEpoch()
            self.microphonePublishTask?.cancel()
            self.microphonePublishTask = nil
            let ids = self.microphoneTrackIds
            self.microphoneTrackIds.removeAll()
            self.resumeStatusWaiters()
            return (self.captureGeneration, epoch, ids)
        }
        await session.stopMicrophone(generation: generation)
        for trackId in trackIds {
            try await removePublishedTrack(trackId)
        }
        await MainActor.run {
            guard self.microphoneEpochValue() == epoch else { return }
            self.isMicrophoneOn = false
        }
    }

    public func toggleMicrophone() async throws {
        if await MainActor.run(body: { isMicrophoneOn }) {
            try await stopMicrophone()
        } else {
            try await startMicrophone()
        }
    }

    private func publishWhileConnected(
        track: RTCMediaStreamTrack,
        kind: Fishjam_Sdk_TrackKind,
        type: Fishjam_Sdk_TrackType,
        generation: Int,
        epoch: Int,
        camera: Bool
    ) async {
        while await isCurrentDevice(generation, epoch, camera: camera) {
            await waitUntil(generation: generation, epoch: epoch, camera: camera) { $0 == .connected }
            guard await isCurrentDevice(generation, epoch, camera: camera) else { return }
            let trackId: String
            do {
                trackId = try publish(kind: kind, type: type)
            } catch {
                return
            }
            let kept = await MainActor.run { () -> Bool in
                guard self.deviceCaptureCurrent(generation: generation, epoch: epoch, camera: camera) else {
                    return false
                }
                if camera {
                    self.cameraTrackIds.append(trackId)
                } else {
                    self.microphoneTrackIds.append(trackId)
                }
                return true
            }
            if !kept {
                try? await removePublishedTrack(trackId)
                return
            }
            guard await isCurrentDevice(generation, epoch, camera: camera) else {
                await MainActor.run {
                    if camera {
                        self.cameraTrackIds.removeAll { $0 == trackId }
                    } else {
                        self.microphoneTrackIds.removeAll { $0 == trackId }
                    }
                }
                try? await removePublishedTrack(trackId)
                return
            }
            session.bind(trackId: trackId, track: track, generation: generation)
            await waitUntil(generation: generation, epoch: epoch, camera: camera) { $0 != .connected }
        }
    }

    private func isCurrentDevice(_ generation: Int, _ epoch: Int, camera: Bool) async -> Bool {
        if Task.isCancelled {
            return false
        }
        return await MainActor.run {
            deviceCaptureCurrent(generation: generation, epoch: epoch, camera: camera)
        }
    }

    private func deviceCaptureCurrent(generation: Int, epoch: Int, camera: Bool) -> Bool {
        if closed || captureGeneration != generation {
            return false
        }
        let current = camera ? cameraEpochValue() : microphoneEpochValue()
        return current == epoch
    }

    private func cameraEpochValue() -> Int {
        deviceEpochLock.lock()
        defer { deviceEpochLock.unlock() }
        return cameraEpoch
    }

    private func microphoneEpochValue() -> Int {
        deviceEpochLock.lock()
        defer { deviceEpochLock.unlock() }
        return microphoneEpoch
    }

    @discardableResult
    private func bumpCameraEpoch() -> Int {
        deviceEpochLock.lock()
        cameraEpoch += 1
        let value = cameraEpoch
        deviceEpochLock.unlock()
        return value
    }

    @discardableResult
    private func bumpMicrophoneEpoch() -> Int {
        deviceEpochLock.lock()
        microphoneEpoch += 1
        let value = microphoneEpoch
        deviceEpochLock.unlock()
        return value
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

    private func showLocalCamera(_ track: VideoTrack) {
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
