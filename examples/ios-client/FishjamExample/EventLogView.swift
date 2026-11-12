import FishjamClient
import SwiftUI

private let maxLogLines = 30
private let shortIdLength = 8

/// Shows the newest 30 events of `client.events`, newest first.
struct EventLogView: View {
    let client: FishjamClient
    @State private var lines: [String] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Events (\(lines.count))")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Button("Clear") { lines.removeAll() }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("clear-events")
            }
            VStack(alignment: .leading, spacing: 2) {
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                    Text(line)
                        .font(.caption)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("event-log")
        }
        .padding(12)
        .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color.secondary))
        .task {
            for await event in client.events {
                lines.insert(describeEvent(event), at: 0)
                if lines.count > maxLogLines {
                    lines.removeLast(lines.count - maxLogLines)
                }
            }
        }
    }
}

private func shortId(_ id: String) -> String {
    String(id.prefix(shortIdLength))
}

private func trackLabel(_ track: Track) -> String {
    "\(track.metadata?.type ?? "") \(shortId(track.trackId))"
}

/// One line per event: its name plus the ids that matter.
func describeEvent(_ event: FishjamEvent) -> String {
    describeConnectionEvent(event)
        ?? describeReconnectionEvent(event)
        ?? describeRemoteEvent(event)
        ?? describeLocalEvent(event)
        ?? ""
}

private func describeConnectionEvent(_ event: FishjamEvent) -> String? {
    switch event {
    case .connectionStarted: return "connectionStarted"
    case let .authSuccess(audioOnly): return "authSuccess audioOnly=\(audioOnly)"
    case let .authError(reason): return "authError \(reason)"
    case let .joined(peerId, peers): return "joined peer=\(shortId(peerId)) peers=\(peers.count)"
    case let .joinError(reason): return "joinError \(reason)"
    case let .connectionError(message): return "connectionError \(message)"
    case .disconnected: return "disconnected"
    default: return nil
    }
}

private func describeReconnectionEvent(_ event: FishjamEvent) -> String? {
    switch event {
    case .reconnectionStarted: return "reconnectionStarted"
    case .reconnected: return "reconnected"
    case .reconnectionRetriesLimitReached: return "reconnectionRetriesLimitReached"
    default: return nil
    }
}

private func describeRemoteEvent(_ event: FishjamEvent) -> String? {
    switch event {
    case let .peerJoined(peer): return "peerJoined remote=\(shortId(peer.id)) tracks=\(peer.tracks.count)"
    case let .peerLeft(peer): return "peerLeft remote=\(shortId(peer.id))"
    case let .peerUpdated(peer): return "peerUpdated remote=\(shortId(peer.id))"
    case let .trackAdded(peerId, track): return "trackAdded remote=\(shortId(peerId)) \(trackLabel(track))"
    case let .trackReady(peerId, track): return "trackReady remote=\(shortId(peerId)) \(trackLabel(track))"
    case let .trackRemoved(peerId, track): return "trackRemoved remote=\(shortId(peerId)) \(trackLabel(track))"
    case let .trackUpdated(peerId, track): return "trackUpdated remote=\(shortId(peerId)) \(trackLabel(track))"
    default: return nil
    }
}

private func describeLocalEvent(_ event: FishjamEvent) -> String? {
    switch event {
    case let .localTrackAdded(trackId, type): return "localTrackAdded \(type) \(shortId(trackId))"
    case let .localTrackRemoved(trackId): return "localTrackRemoved \(shortId(trackId))"
    case let .localTrackReplaced(trackId): return "localTrackReplaced \(shortId(trackId))"
    case let .localTrackBandwidthSet(trackId, _): return "localTrackBandwidthSet \(shortId(trackId))"
    case let .localTrackEncodingBandwidthSet(trackId, variant, kbps):
        return "localTrackEncodingBandwidthSet \(shortId(trackId)) \(variant) \(kbps)kbps"
    case .localPeerMetadataChanged: return "localPeerMetadataChanged"
    default: return nil
    }
}
