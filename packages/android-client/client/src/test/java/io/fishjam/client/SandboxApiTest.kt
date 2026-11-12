package io.fishjam.client

import java.net.URI
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SandboxApiTest {
    @Test
    fun emptyUrlFailsBeforeARequest() {
        val error =
            runCatching {
                sandboxPeerTokenUrl(sandboxApiUrl = "  ", roomName = "room", peerName = "peer")
            }.exceptionOrNull()
        assertTrue(error is SandboxException)
        assertTrue(error!!.message!!.contains("sandboxApiUrl"))
    }

    @Test
    fun peerTokenBuildsTheQuery() {
        val params =
            query(
                sandboxPeerTokenUrl(
                    sandboxApiUrl = "https://sandbox.test/api",
                    roomName = "my-room",
                    peerName = "alice",
                    roomType = SandboxRoomType.AudioOnly
                )
            )
        assertEquals("my-room", params["roomName"])
        assertEquals("alice", params["peerName"])
        assertEquals("audio_only", params["roomType"])
    }

    @Test
    fun peerTokenDefaultsRoomTypeToConference() {
        val params =
            query(
                sandboxPeerTokenUrl(
                    sandboxApiUrl = "https://sandbox.test/api",
                    roomName = "room",
                    peerName = "bob"
                )
            )
        assertEquals("conference", params["roomType"])
    }

    @Test
    fun peerTokenPassesTheVideoCodec() {
        val params =
            query(
                sandboxPeerTokenUrl(
                    sandboxApiUrl = "https://sandbox.test/api",
                    roomName = "room",
                    peerName = "bob",
                    videoCodec = SandboxVideoCodec.H264
                )
            )
        assertEquals("h264", params["videoCodec"])
    }

    @Test
    fun peerTokenOmitsTheVideoCodecByDefault() {
        val params =
            query(
                sandboxPeerTokenUrl(
                    sandboxApiUrl = "https://sandbox.test/api",
                    roomName = "room",
                    peerName = "bob"
                )
            )
        assertFalse(params.containsKey("videoCodec"))
    }

    @Test
    fun peerTokenKeepsAnExistingQueryParameter() {
        val params =
            query(
                sandboxPeerTokenUrl(
                    sandboxApiUrl = "https://sandbox.test/api?foo=1",
                    roomName = "room",
                    peerName = "bob"
                )
            )
        assertEquals("1", params["foo"])
        assertEquals("room", params["roomName"])
    }

    @Test
    fun peerTokenReturnsTheToken() {
        assertEquals(
            "pt-1",
            sandboxPeerToken(200, """{"peerToken":"pt-1"}""", "room", "bob", SandboxRoomType.Conference)
        )
    }

    @Test
    fun peerTokenExplainsAConflictingRoom() {
        val error = failure { sandboxPeerToken(409, "", "room", "bob", SandboxRoomType.Conference) }
        assertTrue(error.message!!.contains("already exists with a different"))
    }

    @Test
    fun peerTokenExplainsAnotherFailure() {
        val error = failure { sandboxPeerToken(500, "", "room", "bob", SandboxRoomType.Conference) }
        assertTrue(error.message!!.contains("Failed to retrieve peer token"))
    }

    @Test
    fun peerTokenRejectsABodyWithNoToken() {
        val error = failure { sandboxPeerToken(200, "{}", "room", "bob", SandboxRoomType.Conference) }
        assertTrue(error.message!!.contains("no peer token"))
    }

    @Test
    fun livestreamPassesVisibilityAndCodec() {
        val url =
            sandboxLivestreamUrl(
                sandboxApiUrl = "https://sandbox.test/api",
                roomName = "room",
                isPublic = true,
                videoCodec = SandboxVideoCodec.H264
            )
        val params = query(url)
        assertTrue(URI(url).path.endsWith("/livestream"))
        assertEquals("true", params["public"])
        assertEquals("room", params["roomName"])
        assertEquals("h264", params["videoCodec"])
    }

    @Test
    fun livestreamOmitsTheVideoCodecByDefault() {
        val params = query(sandboxLivestreamUrl(sandboxApiUrl = "https://sandbox.test/api", roomName = "room"))
        assertEquals("false", params["public"])
        assertFalse(params.containsKey("videoCodec"))
    }

    @Test
    fun livestreamReturnsTheStreamerToken() {
        val result =
            sandboxLivestream(
                200,
                """{"streamerToken":"st","room":{"id":"r","name":"n"}}""",
                "room"
            )
        assertEquals("st", result.streamerToken)
        assertEquals("r", result.roomId)
        assertEquals("n", result.roomName)
    }

    @Test
    fun livestreamExplainsAConflictingRoom() {
        val error = failure { sandboxLivestream(409, "", "room") }
        assertTrue(error.message!!.contains("already exists with a different"))
    }

    @Test
    fun livestreamRejectsABodyWithNoToken() {
        val error = failure { sandboxLivestream(200, "{}", "room") }
        assertTrue(error.message!!.contains("no streamer token"))
    }

    @Test
    fun viewerTokenBuildsThePath() {
        val url = sandboxViewerTokenUrl("https://sandbox.test/api?foo=1", "a b/c")
        assertTrue(url.contains("/a%20b%2Fc/livestream-viewer-token"))
        assertEquals("1", query(url)["foo"])
    }

    @Test
    fun viewerTokenGivesAFriendlyErrorWhenTheRoomIsMissing() {
        val error = failure { sandboxViewerToken(404, "", "ghost") }
        assertTrue(error.message!!.contains("does not exist"))
    }

    @Test
    fun viewerTokenReturnsTheToken() {
        assertEquals("vt", sandboxViewerToken(200, """{"token":"vt"}""", "room"))
    }

    @Test
    fun viewerTokenExplainsAnotherFailure() {
        val error = failure { sandboxViewerToken(500, "", "room") }
        assertTrue(error.message!!.contains("Failed to retrieve viewer token"))
    }

    @Test
    fun peerTokenIgnoresANonStringToken() {
        val error =
            failure {
                sandboxPeerToken(200, """{"peerToken":1}""", "room", "bob", SandboxRoomType.Conference)
            }
        assertTrue(error.message!!.contains("no peer token"))
        assertNull(error.cause)
    }

    private fun failure(block: () -> Unit): SandboxException {
        val error = runCatching(block).exceptionOrNull()
        assertTrue(error is SandboxException)
        return error as SandboxException
    }

    private fun query(url: String): Map<String, String> {
        val raw = URI(url).rawQuery ?: return emptyMap()
        return raw.split('&').associate { part ->
            val eq = part.indexOf('=')
            if (eq < 0) part to "" else part.substring(0, eq) to part.substring(eq + 1)
        }
    }
}
