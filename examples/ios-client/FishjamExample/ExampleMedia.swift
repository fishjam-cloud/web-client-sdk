import FishjamClient
import SwiftUI
import UIKit

struct TrackBox<Content: View>: View {
    let name: String
    let nameIdentifier: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .overlay {
            RoundedRectangle(cornerRadius: 4)
                .stroke(Color.secondary, lineWidth: 1)
        }
        .overlay(alignment: .topLeading) {
            Text(name)
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 4)
                .background(Color(uiColor: .systemBackground))
                .offset(x: 12, y: -8)
                .accessibilityIdentifier(nameIdentifier)
        }
        .padding(.top, 8)
    }
}

struct RoomCodec: View {
    let client: FishjamClient
    @State private var label = "Room codec: checking"

    var body: some View {
        Text(label)
            .accessibilityIdentifier("room-codec")
            .task {
                while !Task.isCancelled {
                    if let name = negotiatedVideoCodec(await client.getStatistics()) {
                        label = "Room codec: \(name)"
                        return
                    }
                    label = "Room codec: checking"
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                }
            }
    }
}

/// Video codec in use on this connection. The SDP lists every offered codec, so this follows the stream's codec id.
func negotiatedVideoCodec(_ stats: [RtcStats]) -> String? {
    let stream = stats.first { stat in
        (stat.type == "outbound-rtp" || stat.type == "inbound-rtp")
            && stat.memberText("kind") == "video"
            && stat.memberText("codecId") != nil
    }
    guard let codecId = stream?.memberText("codecId"),
          let mime = stats.first(where: { $0.id == codecId })?.memberText("mimeType")
    else { return nil }
    return mime.hasPrefix("video/") ? String(mime.dropFirst("video/".count)) : mime
}

extension RtcStats {
    func memberText(_ key: String) -> String? {
        if case let .text(value) = members[key] { return value }
        return nil
    }
}

struct ReceivedRate: View {
    let client: FishjamClient
    let trackId: String
    @State private var label = "Measuring..."

    var body: some View {
        Text(label)
            .font(.caption)
            .accessibilityIdentifier("received-kbps")
            .task(id: trackId) {
                var previousBytes: Double?
                var previousAt = Date()
                while !Task.isCancelled {
                    let stats = await client.getStatistics(trackId: trackId)
                    let now = Date()
                    if stats.isEmpty {
                        label = "No stats yet"
                    } else if let bytes = inboundVideoBytesReceived(stats) {
                        if let previous = previousBytes,
                           let rate = receivedKilobitsPerSecond(
                               previousBytes: previous,
                               bytes: bytes,
                               elapsedSeconds: now.timeIntervalSince(previousAt)
                           ) {
                            label = "\(rate) kb/s"
                        } else {
                            label = "Measuring..."
                        }
                        previousBytes = bytes
                        previousAt = now
                    } else {
                        label = "No video stats"
                    }
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                }
            }
    }
}

func peerDisplayName(_ peer: PeerWithTracks) -> String {
    if let object = peer.metadata?.peer as? [String: Any],
       let name = object["name"] as? String,
       !name.isEmpty {
        return name
    }
    return peer.id
}

func variantLetter(_ variant: Variant) -> String {
    switch variant {
    case .low: return "L"
    case .medium: return "M"
    case .high: return "H"
    }
}

func variantLabel(_ variant: Variant?) -> String {
    switch variant {
    case .low: return "Low"
    case .medium: return "Medium"
    case .high: return "High"
    case nil: return "Auto"
    }
}

func qualityId(_ variant: Variant) -> String {
    switch variant {
    case .low: return "low"
    case .medium: return "medium"
    case .high: return "high"
    }
}
