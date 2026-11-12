import Foundation
import WebRTC

/// Everything that happens to a `FishjamClient`, delivered in order through `FishjamClient.events`.
///
/// This is the same set as the web and React Native `FishjamClient.on(...)` events, except for events
/// that the native SDKs have no source for: `socketOpen`, `socketClose`, `socketError`, components,
/// `tracksPriorityChanged`, `bandwidthEstimationChanged`, data channels, `localTrackMuted`,
/// `localTrackUnmuted`, `localTrackEncodingEnabled` and `localTrackEncodingDisabled`.
public enum FishjamEvent {
    // MARK: Connection and auth

    /// `joinRoom` started connecting.
    case connectionStarted
    /// The server accepted the peer token. `audioOnly` is true for an audio-only room.
    case authSuccess(audioOnly: Bool)
    /// The server rejected the peer token. `disconnected` follows.
    case authError(AuthErrorReason)
    /// The peer is in the room. Sent again after every successful reconnection.
    case joined(peerId: String, peers: [PeerWithTracks])
    /// The server refused the join. `disconnected` follows.
    case joinError(JoinErrorReason)
    /// The connection failed for a reason that is not an auth or join error. `disconnected` follows.
    case connectionError(message: String)
    /// The client left the room or lost the connection for good. Never sent while reconnecting.
    case disconnected

    // MARK: Reconnection

    case reconnectionStarted
    /// Sent after `joined` once a reconnection succeeded.
    case reconnected
    /// Every reconnection attempt failed. `disconnected` follows.
    case reconnectionRetriesLimitReached

    // MARK: Remote peers and tracks

    case peerJoined(PeerWithTracks)
    case peerLeft(PeerWithTracks)
    case peerUpdated(PeerWithTracks)
    case trackAdded(peerId: String, track: Track)
    case trackReady(peerId: String, track: Track)
    case trackRemoved(peerId: String, track: Track)
    case trackUpdated(peerId: String, track: Track)

    // MARK: Local peer and tracks

    /// A local track was published. `type` is `camera` or `microphone`.
    case localTrackAdded(trackId: String, type: String)
    case localTrackRemoved(trackId: String)
    /// The camera was switched to another device. The track id stays.
    case localTrackReplaced(trackId: String)
    case localTrackBandwidthSet(trackId: String, limit: BandwidthLimit)
    case localTrackEncodingBandwidthSet(trackId: String, variant: Variant, kbps: Int)
    case localPeerMetadataChanged(metadata: [String: Any])
}

extension FishjamEvent: @unchecked Sendable {}

/// Turns each core event into zero or more `FishjamEvent`s.
/// It remembers the last status, the room, and whether a reconnection is running.
/// Call it on the main thread, in the order the core sent the events.
struct FishjamEventMapper {
    private var peerStatus = PeerStatus.idle
    private var reconnecting = false
    private var retriesExhausted = false
    private var room = RoomState.empty

    mutating func map(
        _ event: Fishjam_Sdk_SdkEvent,
        media: [String: RTCMediaStreamTrack]
    ) -> [FishjamEvent] {
        if let remote = peerTrackEvent(of: event, media: media) {
            room = applying(remote, to: room)
            return [remote]
        }
        switch event.content {
        case let .authenticated(authenticated)?:
            return [.authSuccess(audioOnly: authenticated.audioOnly)]
        case .peerStatusChanged?:
            guard let update = peerStatusUpdate(event) else { return [] }
            return mapStatus(update.peerStatus)
        case .reconnectionStatusChanged?:
            guard let status = reconnectionStatusUpdate(event) else { return [] }
            return mapReconnection(status)
        case let .roomStateChanged(changed)?:
            return mapRoom(makeRoomState(changed.roomState).attaching(media))
        default:
            return []
        }
    }

    private mutating func mapStatus(_ status: PeerStatus) -> [FishjamEvent] {
        let previous = peerStatus
        peerStatus = status
        let wasActive = previous == .connecting || previous == .connected
        switch status {
        case .connecting:
            reconnecting = false
            retriesExhausted = false
            return [.connectionStarted]
        case .connected:
            reconnecting = false
            return [.joined(peerId: room.localPeer?.id ?? "", peers: room.remotePeers)]
        case let .error(failure):
            reconnecting = false
            let skipError = retriesExhausted
            retriesExhausted = false
            var events: [FishjamEvent] = []
            if !skipError {
                events.append(failureEvent(failure))
            }
            if wasActive {
                events.append(.disconnected)
            }
            return events
        case .idle:
            reconnecting = false
            retriesExhausted = false
            return wasActive ? [.disconnected] : []
        }
    }

    private func failureEvent(_ failure: ConnectionFailure) -> FishjamEvent {
        if let reason = failure.authReason {
            return .authError(reason)
        }
        if let reason = failure.joinReason {
            return .joinError(reason)
        }
        return .connectionError(message: failure.message)
    }

    private mutating func mapReconnection(_ status: ReconnectionStatus) -> [FishjamEvent] {
        switch status {
        case .reconnecting:
            guard !reconnecting else { return [] }
            reconnecting = true
            return [.reconnectionStarted]
        case .error:
            reconnecting = false
            retriesExhausted = true
            return [.reconnectionRetriesLimitReached]
        case .idle:
            guard reconnecting else { return [] }
            reconnecting = false
            guard let localPeer = room.localPeer else { return [] }
            return [
                .joined(peerId: localPeer.id, peers: room.remotePeers),
                .reconnected
            ]
        }
    }

    /// The core clears the remote peers on a connection loss without sending `peerLeft`.
    /// Report the peers that are gone from the new room, so the events match the room state.
    private mutating func mapRoom(_ next: RoomState) -> [FishjamEvent] {
        let remaining = Set(next.remotePeers.map(\.id))
        var events: [FishjamEvent] = []
        for peer in room.remotePeers where !remaining.contains(peer.id) {
            for track in peer.tracks {
                events.append(.trackRemoved(peerId: peer.id, track: track))
            }
            events.append(.peerLeft(peer))
        }
        room = RoomState(localPeer: next.localPeer, remotePeers: next.remotePeers)
        return events
    }
}

/// Fans events out to every stream made by `FishjamClient.events`. Safe to use from any thread.
final class EventHub: @unchecked Sendable {
    private let lock = NSLock()
    private var continuations: [UUID: AsyncStream<FishjamEvent>.Continuation] = [:]

    func stream() -> AsyncStream<FishjamEvent> {
        AsyncStream(bufferingPolicy: .bufferingNewest(1024)) { continuation in
            let id = UUID()
            lock.lock()
            continuations[id] = continuation
            lock.unlock()
            continuation.onTermination = { [weak self] _ in
                self?.remove(id)
            }
        }
    }

    func emit(_ events: [FishjamEvent]) {
        guard !events.isEmpty else { return }
        lock.lock()
        let targets = Array(continuations.values)
        lock.unlock()
        for event in events {
            targets.forEach { $0.yield(event) }
        }
    }

    func emit(_ event: FishjamEvent) {
        emit([event])
    }

    func finish() {
        lock.lock()
        let targets = Array(continuations.values)
        continuations.removeAll()
        lock.unlock()
        targets.forEach { $0.finish() }
    }

    private func remove(_ id: UUID) {
        lock.lock()
        continuations.removeValue(forKey: id)
        lock.unlock()
    }
}
