import FishjamClient
import SwiftUI
import UIKit

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
