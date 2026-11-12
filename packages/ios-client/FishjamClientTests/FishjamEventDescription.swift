@testable import FishjamClient

/// A short text for an event, so tests can compare event lists as plain strings.
func describeEvent(_ event: FishjamEvent) -> String {
    describeConnection(event)
        ?? describeReconnection(event)
        ?? describeRemote(event)
        ?? describeLocal(event)
        ?? ""
}

private func describeConnection(_ event: FishjamEvent) -> String? {
    switch event {
    case .connectionStarted: return "connectionStarted"
    case let .authSuccess(audioOnly): return "authSuccess audioOnly=\(audioOnly)"
    case let .authError(reason): return "authError \(reason)"
    case let .joined(peerId, peers): return "joined \(peerId) peers=\(peers.map(\.id).joined(separator: ","))"
    case let .joinError(reason): return "joinError \(reason)"
    case let .connectionError(message): return "connectionError \(message)"
    case .disconnected: return "disconnected"
    default: return nil
    }
}

private func describeReconnection(_ event: FishjamEvent) -> String? {
    switch event {
    case .reconnectionStarted: return "reconnectionStarted"
    case .reconnected: return "reconnected"
    case .reconnectionRetriesLimitReached: return "reconnectionRetriesLimitReached"
    default: return nil
    }
}

private func describeRemote(_ event: FishjamEvent) -> String? {
    switch event {
    case let .peerJoined(peer): return "peerJoined \(peer.id) tracks=\(peer.tracks.count)"
    case let .peerLeft(peer): return "peerLeft \(peer.id)"
    case let .peerUpdated(peer): return "peerUpdated \(peer.id) tracks=\(peer.tracks.count)"
    case let .trackAdded(peerId, track): return "trackAdded \(peerId) \(track.trackId)"
    case let .trackReady(peerId, track): return "trackReady \(peerId) \(track.trackId)"
    case let .trackRemoved(peerId, track): return "trackRemoved \(peerId) \(track.trackId)"
    case let .trackUpdated(peerId, track): return "trackUpdated \(peerId) \(track.trackId)"
    default: return nil
    }
}

private func describeLocal(_ event: FishjamEvent) -> String? {
    switch event {
    case let .localTrackAdded(trackId, type): return "localTrackAdded \(trackId) \(type)"
    case let .localTrackRemoved(trackId): return "localTrackRemoved \(trackId)"
    case let .localTrackReplaced(trackId): return "localTrackReplaced \(trackId)"
    case let .localTrackBandwidthSet(trackId, _): return "localTrackBandwidthSet \(trackId)"
    case let .localTrackEncodingBandwidthSet(trackId, _, kbps):
        return "localTrackEncodingBandwidthSet \(trackId) \(kbps)"
    case .localPeerMetadataChanged: return "localPeerMetadataChanged"
    default: return nil
    }
}
