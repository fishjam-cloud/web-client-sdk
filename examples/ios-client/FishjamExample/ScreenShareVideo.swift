import FishjamClient
import SwiftUI

struct ScreenShareVideo: View {
    let track: VideoTrack
    let identifier: String

    var body: some View {
        VideoView(track: track, mirror: false, objectFit: .contain)
            .frame(maxWidth: .infinity)
            .frame(height: 200)
            .background(Color.black)
            .accessibilityIdentifier(identifier)
    }
}

struct ScreenShareRate: View {
    let client: FishjamClient
    let trackId: String
    let webrtcTrackId: String?
    let sent: Bool
    @State private var label = "Measuring..."

    var body: some View {
        Text(label)
            .font(.caption)
            .accessibilityIdentifier(sent ? "sent-kbps" : "received-kbps")
            .task(id: trackId) {
                var previousBytes: Double?
                var previousAt = Date()
                while !Task.isCancelled {
                    let scoped = await client.getStatistics(trackId: trackId)
                    var bytes = screenShareBytes(scoped, webrtcTrackId: webrtcTrackId, sent: sent)
                    let all: [RtcStats]
                    if bytes == nil {
                        all = await client.getStatistics()
                        bytes = screenShareBytes(all, webrtcTrackId: webrtcTrackId, sent: sent)
                    } else {
                        all = []
                    }
                    let now = Date()
                    let prefix = sent ? "Sent: " : "Received: "
                    if scoped.isEmpty, all.isEmpty {
                        label = prefix + "No stats yet"
                    } else if let bytes {
                        if let previous = previousBytes,
                           let rate = receivedKilobitsPerSecond(
                               previousBytes: previous,
                               bytes: bytes,
                               elapsedSeconds: now.timeIntervalSince(previousAt)
                           ) {
                            label = "\(prefix)\(rate) kb/s"
                        } else {
                            label = prefix + "Measuring..."
                        }
                        previousBytes = bytes
                        previousAt = now
                    } else {
                        label = prefix + "No video stats"
                    }
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                }
            }
    }
}

private func screenShareBytes(_ stats: [RtcStats], webrtcTrackId: String?, sent: Bool) -> Double? {
    let type = sent ? "outbound-rtp" : "inbound-rtp"
    let counter = sent ? "bytesSent" : "bytesReceived"
    let streams = stats.filter { stat in
        stat.type == type && stat.number(counter) != nil && stat.text("kind") != "audio"
    }
    if let webrtcTrackId, !webrtcTrackId.isEmpty {
        if let match = streams.first(where: { $0.text("trackIdentifier") == webrtcTrackId }) {
            return match.number(counter)
        }
        if let match = streams.first(where: { $0.text("trackId") == webrtcTrackId }) {
            return match.number(counter)
        }
        let sourceIds = Set(
            stats.filter { $0.type == "media-source" && $0.text("trackIdentifier") == webrtcTrackId }.map(\.id)
        )
        if let match = streams.first(where: { sourceIds.contains($0.text("mediaSourceId") ?? "") }) {
            return match.number(counter)
        }
        let trackStatIds = Set(
            stats.filter { $0.type == "track" && $0.text("trackIdentifier") == webrtcTrackId }.map(\.id)
        )
        if let match = streams.first(where: { trackStatIds.contains($0.text("trackId") ?? "") }) {
            return match.number(counter)
        }
    }
    guard streams.count == 1, let only = streams.first else { return nil }
    let kind = only.text("kind")
    guard kind == nil || kind == "video" else { return nil }
    return only.number(counter)
}

private extension RtcStats {
    func number(_ key: String) -> Double? {
        if case let .number(value) = members[key] { return value }
        return nil
    }

    func text(_ key: String) -> String? {
        if case let .text(value) = members[key] { return value }
        return nil
    }
}
