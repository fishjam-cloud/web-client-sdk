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

    private let handle: OpaquePointer
    private let eventBoxPointer: UnsafeMutableRawPointer
    private var joinContinuation: CheckedContinuation<Void, Error>?
    private var statusWaiters: [StatusWaiter] = []
    private var cameraPublishStarted = false
    private var microphonePublishStarted = false
    private var localCamera: VideoTrack?
    private var closed = false

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

    public init(fishjamId: String, debug: Bool = false) {
        var config = Fishjam_Sdk_ClientConfig()
        config.fishjamID = fishjamId
        config.debug = debug
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
    }

    deinit {
        closed = true
        session.close()
        fishjam_client_free(handle)
        Unmanaged<EventBox>.fromOpaque(eventBoxPointer).release()
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
                    continuation.resume(throwing: JoinRoomError(
                        message: response.error.message,
                        authReason: response.error.authReason,
                        joinReason: response.error.joinReason
                    ))
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
            _ = self.call(.leaveRoom(Fishjam_Sdk_LeaveRoom()))
        }
    }

    public func startCamera() async throws {
        let track = try await session.startCamera()
        await MainActor.run {
            showLocalCamera(track)
            guard !cameraPublishStarted else { return }
            cameraPublishStarted = true
            publishWhileConnected(track: track, kind: .video, type: .camera)
        }
    }

    public func startMicrophone() async throws {
        let track = try await session.startMicrophone()
        await MainActor.run {
            guard !microphonePublishStarted else { return }
            microphonePublishStarted = true
            publishWhileConnected(track: track, kind: .audio, type: .microphone)
        }
    }

    fileprivate func apply(_ data: Data) {
        guard !closed, let event = try? Fishjam_Sdk_SdkEvent(serializedBytes: data) else {
            return
        }
        guard let content = event.content else { return }
        switch content {
        case .peerStatusChanged:
            applyStatus(event)
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

    private func publishWhileConnected(
        track: RTCMediaStreamTrack,
        kind: Fishjam_Sdk_TrackKind,
        type: Fishjam_Sdk_TrackType
    ) {
        Task {
            while !closed {
                await waitUntil { $0 == .connected }
                if closed { return }
                do {
                    let trackId = try publish(kind: kind, type: type)
                    session.bind(trackId: trackId, track: track)
                } catch {
                    return
                }
                await waitUntil { $0 != .connected }
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
        guard let track = localCamera, current.localPeer?.cameraTrack?.videoTrack == nil else {
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

    private func refreshMedia() {
        guard !closed else { return }
        roomState = withLocalCamera(roomState.attaching(session.mediaSnapshot()))
    }

    private func waitUntil(_ matches: @escaping (PeerStatus) -> Bool) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            DispatchQueue.main.async {
                if self.closed || matches(self.peerStatus) {
                    continuation.resume()
                    return
                }
                self.statusWaiters.append(StatusWaiter(matches: matches, continuation: continuation))
            }
        }
    }

    private func resumeStatusWaiters() {
        var stillWaiting: [StatusWaiter] = []
        for waiter in statusWaiters {
            if waiter.matches(peerStatus) {
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

private struct StatusWaiter {
    let matches: (PeerStatus) -> Bool
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
