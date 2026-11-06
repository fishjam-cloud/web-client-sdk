package io.fishjam.client

data class RtcStats(
    val id: String,
    val type: String,
    val timestampUs: Long,
    val members: Map<String, RtcStatMember>
)

sealed class RtcStatMember {
    data class Bool(val value: Boolean) : RtcStatMember()

    data class Number(val value: Double) : RtcStatMember()

    data class Text(val value: String) : RtcStatMember()
}

/** Outgoing bandwidth estimate in bits per second. `0` when the report has none. */
fun outgoingBitrateBps(stats: List<RtcStats>): Long {
    val pairs = stats.filter { stat -> stat.type == "candidate-pair" }
    val nominated =
        pairs.firstOrNull { stat ->
            stat.bool("nominated") == true && stat.number("availableOutgoingBitrate") != null
        }
    val chosen = nominated ?: pairs.firstOrNull { stat -> stat.number("availableOutgoingBitrate") != null }
    return chosen?.number("availableOutgoingBitrate")?.toLong() ?: 0L
}

/** `audioLevel` of the first audio `media-source` report, from 0.0 to 1.0. */
fun audioLevel(stats: List<RtcStats>): Double? = stats.firstOrNull { stat ->
    stat.type == "media-source" && stat.text("kind") == "audio" && stat.number("audioLevel") != null
}?.number("audioLevel")

/** `bytesReceived` of the video `inbound-rtp` report. */
fun inboundVideoBytesReceived(stats: List<RtcStats>): Double? = stats.firstOrNull { stat ->
    stat.type == "inbound-rtp" && stat.text("kind") == "video" && stat.number("bytesReceived") != null
}?.number("bytesReceived")

/** Kilobits per second, where one kilobit is 1024 bits. `null` when the interval is empty or the counter went backwards. */
fun receivedKilobitsPerSecond(previousBytes: Double, bytes: Double, elapsedSeconds: Double): Long? {
    if (elapsedSeconds <= 0.0 || bytes < previousBytes) return null
    return ((bytes - previousBytes) * 8.0 / elapsedSeconds / 1024.0).toLong()
}

private fun RtcStats.number(key: String): Double? = (members[key] as? RtcStatMember.Number)?.value

private fun RtcStats.text(key: String): String? = (members[key] as? RtcStatMember.Text)?.value

private fun RtcStats.bool(key: String): Boolean? = (members[key] as? RtcStatMember.Bool)?.value
