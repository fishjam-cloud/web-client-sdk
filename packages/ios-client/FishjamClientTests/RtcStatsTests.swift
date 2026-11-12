@testable import FishjamClient
import XCTest

final class RtcStatsTests: XCTestCase {
    func testOutgoingBitrateUsesTheNominatedPair() {
        let stats = [
            pair("idle", nominated: false, bitrate: 10),
            pair("chosen", nominated: true, bitrate: 250_000),
        ]

        XCTAssertEqual(outgoingBitrateBps(stats), 250_000)
    }

    func testOutgoingBitrateUsesAPairThatHasTheFieldWhenNoneIsNominated() {
        XCTAssertEqual(outgoingBitrateBps([pair("only", nominated: false, bitrate: 80_000)]), 80_000)
    }

    func testOutgoingBitrateIsZeroWhenTheReportHasNone() {
        XCTAssertEqual(outgoingBitrateBps([]), 0)
        XCTAssertEqual(outgoingBitrateBps([stat("candidate-pair", "pair")]), 0)
    }

    func testAudioLevelIsTheFirstAudioMediaSource() {
        let stats = [
            stat("media-source", "video-source", ["kind": .text("video"), "audioLevel": .number(0.9)]),
            stat("media-source", "mic", ["kind": .text("audio"), "audioLevel": .number(0.42)]),
        ]

        XCTAssertEqual(audioLevel(stats), 0.42)
        XCTAssertNil(audioLevel([stat("inbound-rtp", "in", ["kind": .text("audio")])]))
    }

    func testInboundVideoBytesReceivedReadsTheVideoReport() {
        let stats = [
            stat("inbound-rtp", "audio-in", ["kind": .text("audio"), "bytesReceived": .number(10)]),
            stat("inbound-rtp", "video-in", ["kind": .text("video"), "bytesReceived": .number(2048)]),
        ]

        XCTAssertEqual(inboundVideoBytesReceived(stats), 2048)
        XCTAssertNil(inboundVideoBytesReceived([]))
    }

    func testReceivedKilobitsPerSecondUses1024BitUnits() {
        XCTAssertEqual(receivedKilobitsPerSecond(previousBytes: 0, bytes: 1024, elapsedSeconds: 1), 8)
        XCTAssertNil(receivedKilobitsPerSecond(previousBytes: 0, bytes: 1024, elapsedSeconds: 0))
        XCTAssertNil(receivedKilobitsPerSecond(previousBytes: 100, bytes: 50, elapsedSeconds: 1))
    }

    private func pair(_ id: String, nominated: Bool, bitrate: Double) -> RtcStats {
        stat(
            "candidate-pair",
            id,
            ["nominated": .bool(nominated), "availableOutgoingBitrate": .number(bitrate)]
        )
    }

    private func stat(_ type: String, _ id: String, _ members: [String: RtcStatMember] = [:]) -> RtcStats {
        RtcStats(id: id, type: type, timestampUs: 0, members: members)
    }
}
