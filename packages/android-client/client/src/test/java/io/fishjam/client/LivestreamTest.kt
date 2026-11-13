package io.fishjam.client

import java.io.BufferedInputStream
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.CopyOnWriteArrayList
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.webrtc.PeerConnection

class LivestreamUrlTest {
    @Test
    fun aBareFishjamIdUsesTheDefaultDomain() {
        assertEquals(
            "https://fishjam.io/api/v1/live/api/whep",
            livestreamWhepBaseUrl("abc123")
        )
    }

    @Test
    fun aFishjamIdThatIsAUrlUsesItsOrigin() {
        assertEquals(
            "https://cloud.fishjam.work/api/v1/live/api/whep",
            livestreamWhepBaseUrl("https://cloud.fishjam.work/api/v1/connect/abc123")
        )
        assertEquals(
            "http://localhost:5002/api/v1/live/api/whep",
            livestreamWhepBaseUrl("http://localhost:5002/api/v1/connect/abc123")
        )
    }

    @Test
    fun aBlankFishjamIdIsRejected() {
        assertThrows(IllegalArgumentException::class.java) { livestreamWhepBaseUrl("  ") }
    }

    @Test
    fun aStreamIdIsAppendedToTheBaseUrl() {
        assertEquals(
            "https://fishjam.io/api/v1/live/api/whep/stream-1",
            whepUrl(ConnectViewerConfig.StreamId("stream-1"), "https://fishjam.io/api/v1/live/api/whep", null)
        )
    }

    @Test
    fun aTokenUsesTheBaseUrlAlone() {
        assertEquals(
            "https://fishjam.io/api/v1/live/api/whep",
            whepUrl(ConnectViewerConfig.Token("secret"), "https://fishjam.io/api/v1/live/api/whep", null)
        )
    }

    @Test
    fun anExplicitUrlWins() {
        assertEquals(
            "https://example.com/whep",
            whepUrl(ConnectViewerConfig.StreamId("stream-1"), "https://fishjam.io/x", "https://example.com/whep")
        )
    }

    @Test
    fun httpStatusesMapToLivestreamErrors() {
        assertEquals(LivestreamError.Unauthorized, livestreamErrorForStatus(401))
        assertEquals(LivestreamError.StreamNotFound, livestreamErrorForStatus(404))
        assertEquals(LivestreamError.UnknownError, livestreamErrorForStatus(500))
        assertEquals(LivestreamError.UnknownError, livestreamErrorForStatus(409))
    }

    @Test
    fun onlyAConnectedPeerConnectionIsConnected() {
        assertTrue(isLivestreamConnected(PeerConnection.PeerConnectionState.CONNECTED))
        assertFalse(isLivestreamConnected(PeerConnection.PeerConnectionState.CONNECTING))
        assertFalse(isLivestreamConnected(PeerConnection.PeerConnectionState.DISCONNECTED))
        assertFalse(isLivestreamConnected(PeerConnection.PeerConnectionState.FAILED))
    }
}

/** A one-thread HTTP/1.1 server: enough for [WhepSignaling], with no extra test dependency. */
private class FakeHttpServer(private val respond: (Request) -> Response) : AutoCloseable {
    data class Request(
        val method: String,
        val path: String,
        val contentType: String?,
        val authorization: String?,
        val body: String
    )

    data class Response(val status: Int, val body: String = "", val headers: Map<String, String> = emptyMap())

    val requests = CopyOnWriteArrayList<Request>()
    private val socket = ServerSocket(0, 50, java.net.InetAddress.getByName("127.0.0.1"))
    val port get() = socket.localPort
    private val thread =
        Thread {
            while (!socket.isClosed) {
                try {
                    socket.accept().use { serve(it) }
                } catch (error: java.io.IOException) {
                    Unit
                }
            }
        }.apply {
            isDaemon = true
            start()
        }

    private fun serve(client: Socket) {
        val input = BufferedInputStream(client.getInputStream())
        fun line(): String {
            val bytes = java.io.ByteArrayOutputStream()
            while (true) {
                val next = input.read()
                if (next == -1 || next == '\n'.code) break
                if (next != '\r'.code) bytes.write(next)
            }
            return bytes.toString(Charsets.UTF_8.name())
        }
        val (method, path) = line().split(" ")
        val headers = HashMap<String, String>()
        while (true) {
            val header = line()
            if (header.isEmpty()) break
            headers[header.substringBefore(":").lowercase()] = header.substringAfter(":").trim()
        }
        val body = input.readNBytes(headers["content-length"]?.toInt() ?: 0).toString(Charsets.UTF_8)
        val request = Request(method, path, headers["content-type"], headers["authorization"], body)
        requests.add(request)
        val response = respond(request)
        val payload = response.body.toByteArray()
        val head =
            buildString {
                append("HTTP/1.1 ${response.status} X\r\n")
                response.headers.forEach { (name, value) -> append("$name: $value\r\n") }
                append("Content-Length: ${payload.size}\r\nConnection: close\r\n\r\n")
            }
        client.getOutputStream().apply {
            write(head.toByteArray())
            write(payload)
            flush()
        }
    }

    override fun close() {
        socket.close()
        thread.join(1_000)
    }
}

class WhepSignalingTest {
    private var status = 201
    private var location: String? = "/api/v1/live/api/whep/resource-1"
    private var answer = "v=0 answer"
    private val server =
        FakeHttpServer { request ->
            val headers = if (status in 200..299) {
                listOfNotNull(
                    location?.let { "Location" to it }
                ).toMap()
            } else {
                emptyMap()
            }
            FakeHttpServer.Response(status, if (request.method == "POST") answer else "", headers)
        }
    private val signaling = WhepSignaling()

    private val baseUrl get() = "http://127.0.0.1:${server.port}"
    private val requests get() = server.requests

    @After
    fun stopServer() {
        server.close()
    }

    @Test
    fun postOfferSendsTheOfferAndReturnsTheAnswerAndResource() {
        val result = signaling.postOffer("$baseUrl/api/v1/live/api/whep/stream-1", null, "v=0 offer")

        assertEquals("v=0 answer", result.sdp)
        assertEquals("$baseUrl/api/v1/live/api/whep/resource-1", result.resource)
        val request = requests.single()
        assertEquals("POST", request.method)
        assertEquals("/api/v1/live/api/whep/stream-1", request.path)
        assertEquals("application/sdp", request.contentType)
        assertEquals("v=0 offer", request.body)
        assertNull(request.authorization)
    }

    @Test
    fun postOfferSendsTheTokenAsABearer() {
        signaling.postOffer("$baseUrl/whep", "secret", "offer")

        assertEquals("Bearer secret", requests.single().authorization)
    }

    @Test
    fun aMissingLocationHeaderMeansNoResource() {
        location = null

        assertNull(signaling.postOffer("$baseUrl/whep", null, "offer").resource)
    }

    @Test
    fun postOfferMapsHttpStatusesToErrors() {
        val expected =
            mapOf(
                401 to LivestreamError.Unauthorized,
                404 to LivestreamError.StreamNotFound,
                500 to LivestreamError.UnknownError
            )
        expected.forEach { (code, error) ->
            status = code
            val thrown =
                assertThrows(LivestreamException::class.java) {
                    signaling.postOffer("$baseUrl/whep", null, "offer")
                }
            assertEquals(error, thrown.error)
            assertEquals(code, thrown.statusCode)
        }
    }

    @Test
    fun anUnreachableServerIsAnUnknownError() {
        server.close()

        val thrown =
            assertThrows(LivestreamException::class.java) {
                signaling.postOffer("$baseUrl/whep", null, "offer")
            }
        assertEquals(LivestreamError.UnknownError, thrown.error)
    }

    @Test
    fun deleteSendsTheTokenToTheResource() {
        status = 200

        signaling.delete("$baseUrl/api/v1/live/api/whep/resource-1", "secret")

        val request = requests.single()
        assertEquals("DELETE", request.method)
        assertEquals("/api/v1/live/api/whep/resource-1", request.path)
        assertEquals("Bearer secret", request.authorization)
    }

    @Test
    fun deleteNeverThrows() {
        status = 500
        signaling.delete("$baseUrl/resource", null)
        server.close()
        signaling.delete("$baseUrl/resource", null)
    }
}
