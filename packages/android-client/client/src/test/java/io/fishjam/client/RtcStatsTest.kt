package io.fishjam.client

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RtcStatsTest {
    @Test
    fun outgoingBitrateUsesTheNominatedPair() {
        val stats =
            listOf(
                pair("idle", nominated = false, bitrate = 10.0),
                pair("chosen", nominated = true, bitrate = 250_000.0)
            )

        assertEquals(250_000L, outgoingBitrateBps(stats))
    }

    @Test
    fun outgoingBitrateUsesAPairThatHasTheFieldWhenNoneIsNominated() {
        val stats = listOf(pair("only", nominated = false, bitrate = 80_000.0))

        assertEquals(80_000L, outgoingBitrateBps(stats))
    }

    @Test
    fun outgoingBitrateIsZeroWhenTheReportHasNone() {
        assertEquals(0L, outgoingBitrateBps(emptyList()))
        assertEquals(0L, outgoingBitrateBps(listOf(stat("candidate-pair", "pair"))))
    }

    @Test
    fun audioLevelIsTheFirstAudioMediaSource() {
        val stats =
            listOf(
                stat(
                    "media-source",
                    "video-source",
                    "kind" to RtcStatMember.Text("video"),
                    "audioLevel" to RtcStatMember.Number(0.9)
                ),
                stat(
                    "media-source",
                    "mic",
                    "kind" to RtcStatMember.Text("audio"),
                    "audioLevel" to RtcStatMember.Number(0.42)
                )
            )

        assertEquals(0.42, audioLevel(stats)!!, 0.0)
        assertNull(audioLevel(listOf(stat("inbound-rtp", "in", "kind" to RtcStatMember.Text("audio")))))
    }

    @Test
    fun inboundVideoBytesReceivedReadsTheVideoReport() {
        val stats =
            listOf(
                stat(
                    "inbound-rtp",
                    "audio-in",
                    "kind" to RtcStatMember.Text("audio"),
                    "bytesReceived" to RtcStatMember.Number(10.0)
                ),
                stat(
                    "inbound-rtp",
                    "video-in",
                    "kind" to RtcStatMember.Text("video"),
                    "bytesReceived" to RtcStatMember.Number(2048.0)
                )
            )

        assertEquals(2048.0, inboundVideoBytesReceived(stats)!!, 0.0)
        assertNull(inboundVideoBytesReceived(emptyList()))
    }

    @Test
    fun receivedKilobitsPerSecondUses1024BitUnits() {
        assertEquals(8L, receivedKilobitsPerSecond(0.0, 1024.0, 1.0))
        assertNull(receivedKilobitsPerSecond(0.0, 1024.0, 0.0))
        assertNull(receivedKilobitsPerSecond(100.0, 50.0, 1.0))
    }

    private fun pair(id: String, nominated: Boolean, bitrate: Double): RtcStats = stat(
        "candidate-pair",
        id,
        "nominated" to RtcStatMember.Bool(nominated),
        "availableOutgoingBitrate" to RtcStatMember.Number(bitrate)
    )

    private fun stat(type: String, id: String, vararg members: Pair<String, RtcStatMember>): RtcStats =
        RtcStats(id = id, type = type, timestampUs = 0L, members = members.toMap())
}
