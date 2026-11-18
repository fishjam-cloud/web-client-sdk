package io.fishjam.client

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

internal data class WhepAnswer(val sdp: String, val resource: String?)

/**
 * The HTTP half of WHEP. Every call blocks, so run it off the main thread.
 */
internal class WhepSignaling(private val timeoutMs: Int = DEFAULT_TIMEOUT_MS) {
    /**
     * Sends [offerSdp] to the endpoint [url]. `resource` is the `Location` header resolved against [url],
     * or `null` when the response has none. Throws [LivestreamException] for any failure.
     */
    fun postOffer(url: String, token: String?, offerSdp: String): WhepAnswer {
        val connection = open(url, "POST", token)
        try {
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/sdp")
            connection.outputStream.use { it.write(offerSdp.toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            if (status !in 200..299) {
                throw LivestreamException(livestreamErrorForStatus(status), statusCode = status)
            }
            val answer = connection.inputStream.use { it.readBytes().toString(Charsets.UTF_8) }
            val resource = connection.getHeaderField("Location")?.let { URI(url).resolve(it).toString() }
            return WhepAnswer(answer, resource)
        } catch (error: LivestreamException) {
            throw error
        } catch (error: IOException) {
            throw LivestreamException(LivestreamError.UnknownError, cause = error)
        } catch (error: IllegalArgumentException) {
            throw LivestreamException(LivestreamError.UnknownError, cause = error)
        } finally {
            connection.disconnect()
        }
    }

    /** Ends the session at [resource]. A failure is ignored: the peer connection is closed either way. */
    fun delete(resource: String, token: String?) {
        try {
            val connection = open(resource, "DELETE", token)
            try {
                connection.responseCode
            } finally {
                connection.disconnect()
            }
        } catch (error: IOException) {
            Unit
        } catch (error: IllegalArgumentException) {
            Unit
        }
    }

    private fun open(url: String, method: String, token: String?): HttpURLConnection {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = timeoutMs
        connection.readTimeout = timeoutMs
        if (token != null) connection.setRequestProperty("Authorization", "Bearer $token")
        return connection
    }

    private companion object {
        const val DEFAULT_TIMEOUT_MS = 10_000
    }
}
