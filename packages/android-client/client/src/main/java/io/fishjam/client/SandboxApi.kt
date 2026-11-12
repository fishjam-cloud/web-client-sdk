package io.fishjam.client

import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.net.URLDecoder
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject

/** Room type sent to the Sandbox API. */
enum class SandboxRoomType(internal val wire: String) {
    Conference("conference"),
    Livestream("livestream"),
    AudioOnly("audio_only")
}

/** Video codec sent to the Sandbox API. Leave it unset and the server chooses. */
enum class SandboxVideoCodec(internal val wire: String) {
    Vp8("vp8"),
    H264("h264")
}

/** Streamer token and room returned for a Sandbox livestream. */
data class SandboxLivestream(
    val streamerToken: String,
    val roomId: String,
    val roomName: String
)

/** A Sandbox API request failed. [message] is the text to show. */
class SandboxException(message: String) : Exception(message)

private const val SANDBOX_MISSING_URL =
    "useSandbox requires a sandboxApiUrl, you can get it at: https://fishjam.io/app/sandbox"

/**
 * Not for production. The Sandbox API is an unauthenticated test backend:
 * anyone who knows its URL can create rooms and peers. In production, your
 * own backend creates the peer and gives the app its token.
 *
 * Get a URL at https://fishjam.io/app/sandbox.
 */
class SandboxApi(private val sandboxApiUrl: String) {
    /** Creates or reuses a room and returns a peer token for [peerName]. */
    suspend fun getSandboxPeerToken(
        roomName: String,
        peerName: String,
        roomType: SandboxRoomType = SandboxRoomType.Conference,
        videoCodec: SandboxVideoCodec? = null
    ): String {
        val url =
            sandboxPeerTokenUrl(
                sandboxApiUrl = sandboxApiUrl,
                roomName = roomName,
                peerName = peerName,
                roomType = roomType,
                videoCodec = videoCodec
            )
        val (status, body) = sandboxHttpGet(url)
        return sandboxPeerToken(status, body, roomName, peerName, roomType)
    }

    /**
     * Creates or reuses a livestream room and returns its streamer token.
     * [isPublic] is sent as the `public` query parameter.
     */
    suspend fun getSandboxLivestream(
        roomName: String,
        isPublic: Boolean = false,
        videoCodec: SandboxVideoCodec? = null
    ): SandboxLivestream {
        val url =
            sandboxLivestreamUrl(
                sandboxApiUrl = sandboxApiUrl,
                roomName = roomName,
                isPublic = isPublic,
                videoCodec = videoCodec
            )
        val (status, body) = sandboxHttpGet(url)
        return sandboxLivestream(status, body, roomName)
    }

    /** Returns a viewer token for an existing livestream room. */
    suspend fun getSandboxViewerToken(roomName: String): String {
        val url = sandboxViewerTokenUrl(sandboxApiUrl, roomName)
        val (status, body) = sandboxHttpGet(url)
        return sandboxViewerToken(status, body, roomName)
    }
}

internal fun sandboxPeerTokenUrl(
    sandboxApiUrl: String,
    roomName: String,
    peerName: String,
    roomType: SandboxRoomType = SandboxRoomType.Conference,
    videoCodec: SandboxVideoCodec? = null
): String {
    val query =
        linkedMapOf(
            "roomName" to roomName,
            "peerName" to peerName,
            "roomType" to roomType.wire
        )
    if (videoCodec != null) query["videoCodec"] = videoCodec.wire
    return sandboxUrl(sandboxApiUrl, emptyList(), query)
}

internal fun sandboxLivestreamUrl(
    sandboxApiUrl: String,
    roomName: String,
    isPublic: Boolean = false,
    videoCodec: SandboxVideoCodec? = null
): String {
    val query =
        linkedMapOf(
            "roomName" to roomName,
            "public" to isPublic.toString()
        )
    if (videoCodec != null) query["videoCodec"] = videoCodec.wire
    return sandboxUrl(sandboxApiUrl, listOf("livestream"), query)
}

internal fun sandboxViewerTokenUrl(sandboxApiUrl: String, roomName: String): String =
    sandboxUrl(sandboxApiUrl, listOf(roomName, "livestream-viewer-token"), emptyMap())

internal fun sandboxPeerToken(
    status: Int,
    body: String,
    roomName: String,
    peerName: String,
    roomType: SandboxRoomType
): String {
    if (status == 409) throw SandboxException(sandboxRoomConflictMessage(roomName))
    if (status !in 200..299) {
        throw SandboxException(sandboxPeerTokenFailure(peerName, roomType, roomName))
    }
    return sandboxJsonObject(body)?.text("peerToken")
        ?: throw SandboxException("Sandbox API response has no peer token")
}

internal fun sandboxLivestream(status: Int, body: String, roomName: String): SandboxLivestream {
    if (status == 409) throw SandboxException(sandboxRoomConflictMessage(roomName))
    if (status !in 200..299) {
        throw SandboxException("Failed to retrieve streamer token for '$roomName' livestream room.")
    }
    val json = sandboxJsonObject(body)
    val streamerToken = json?.text("streamerToken")
    val room = json?.get("room")?.let { runCatching { it.jsonObject }.getOrNull() }
    val roomId = room?.text("id")
    val name = room?.text("name")
    if (streamerToken == null || roomId == null || name == null) {
        throw SandboxException("Sandbox API response has no streamer token")
    }
    return SandboxLivestream(streamerToken = streamerToken, roomId = roomId, roomName = name)
}

internal fun sandboxViewerToken(status: Int, body: String, roomName: String): String {
    if (status == 404) {
        throw SandboxException("A livestream room of name '$roomName' does not exist.")
    }
    if (status !in 200..299) {
        throw SandboxException("Failed to retrieve viewer token for '$roomName' livestream room.")
    }
    return sandboxJsonObject(body)?.text("token")
        ?: throw SandboxException("Sandbox API response has no viewer token")
}

private fun sandboxPeerTokenFailure(peerName: String, roomType: SandboxRoomType, roomName: String): String =
    "Failed to retrieve peer token for peer '$peerName' in ${roomType.wire} room '$roomName'."

private fun sandboxRoomConflictMessage(roomName: String): String =
    "Room '$roomName' already exists with a different room type or video codec."

private fun sandboxJsonObject(body: String): JsonObject? =
    runCatching { Json.parseToJsonElement(body).jsonObject }.getOrNull()

private fun JsonObject.text(key: String): String? {
    val value = this[key] as? JsonPrimitive ?: return null
    if (!value.isString) return null
    return value.contentOrNull?.takeIf { it.isNotEmpty() }
}

internal fun sandboxUrl(sandboxApiUrl: String, pathSegments: List<String>, query: Map<String, String>): String {
    val base = sandboxBaseUri(sandboxApiUrl)
    val path =
        buildString {
            append(base.path.orEmpty().trimEnd('/'))
            for (segment in pathSegments) {
                append('/')
                append(sandboxEncode(segment))
            }
        }
    val merged = linkedMapOf<String, String>()
    sandboxQuery(base.rawQuery).forEach { (key, value) -> merged[key] = value }
    query.forEach { (key, value) -> merged[key] = value }
    val queryText =
        merged.entries.joinToString("&") { (key, value) ->
            "${sandboxEncode(key)}=${sandboxEncode(value)}"
        }
    return sandboxAssemble(base, path, queryText)
}

private fun sandboxBaseUri(sandboxApiUrl: String): URI {
    val trimmed = sandboxApiUrl.trim()
    val uri = if (trimmed.isEmpty()) null else runCatching { URI(trimmed) }.getOrNull()
    if (uri == null || (uri.scheme != "http" && uri.scheme != "https") || uri.host.isNullOrEmpty()) {
        throw SandboxException(SANDBOX_MISSING_URL)
    }
    return uri
}

private fun sandboxAssemble(base: URI, path: String, queryText: String): String = buildString {
    append(base.scheme)
    append("://")
    val userInfo = base.rawUserInfo
    if (!userInfo.isNullOrEmpty()) {
        append(userInfo)
        append('@')
    }
    append(base.host)
    if (base.port != -1) {
        append(':')
        append(base.port)
    }
    append(if (path.isEmpty()) "/" else path)
    if (queryText.isNotEmpty()) {
        append('?')
        append(queryText)
    }
}

private fun sandboxQuery(raw: String?): Map<String, String> {
    if (raw.isNullOrEmpty()) return emptyMap()
    val items = linkedMapOf<String, String>()
    for (part in raw.split('&')) {
        if (part.isEmpty()) continue
        val eq = part.indexOf('=')
        if (eq < 0) {
            items[sandboxDecode(part)] = ""
        } else {
            items[sandboxDecode(part.substring(0, eq))] = sandboxDecode(part.substring(eq + 1))
        }
    }
    return items
}

private fun sandboxEncode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8.name()).replace("+", "%20")

private fun sandboxDecode(value: String): String = URLDecoder.decode(value, Charsets.UTF_8.name())

private suspend fun sandboxHttpGet(url: String): Pair<Int, String> = withContext(Dispatchers.IO) {
    val connection = URL(url).openConnection() as HttpURLConnection
    try {
        connection.requestMethod = "GET"
        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        status to stream?.bufferedReader()?.use { it.readText() }.orEmpty()
    } finally {
        connection.disconnect()
    }
}
