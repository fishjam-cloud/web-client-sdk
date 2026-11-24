package io.fishjam.client.voip

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class VoIPTest {
    @Test
    fun parsesIncomingPayload() {
        val payload =
            parseVoIPIncoming(
                mapOf(
                    "roomName" to "room-1",
                    "displayName" to "Alice",
                    "handle" to "alice-id",
                    "isVideo" to "true",
                    "avatarUrl" to "https://example.com/a.png"
                )
            )
        assertEquals("room-1", payload?.roomName)
        assertEquals("Alice", payload?.displayName)
        assertEquals("alice-id", payload?.handle)
        assertEquals(true, payload?.isVideo)
        assertEquals("https://example.com/a.png", payload?.avatarUrl)
    }

    @Test
    fun incomingPayloadDefaults() {
        val payload = parseVoIPIncoming(mapOf("roomName" to "r"))
        assertEquals("Incoming call", payload?.displayName)
        assertEquals("Incoming call", payload?.handle)
        assertEquals(false, payload?.isVideo)
        assertNull(payload?.avatarUrl)
    }

    @Test
    fun incomingPayloadRequiresRoomName() {
        assertNull(parseVoIPIncoming(emptyMap()))
        assertNull(parseVoIPIncoming(mapOf("roomName" to "  ")))
        assertNull(parseVoIPIncoming(mapOf("displayName" to "Alice")))
    }

    @Test
    fun reasonRoundTrip() {
        for (reason in CallEndedReason.entries) {
            assertEquals(reason, reasonFromString(reasonToString(reason)))
        }
        assertEquals(CallEndedReason.Remote, reasonFromString("unknown"))
    }

    @Test
    fun fulfillRequestFulfillsOnce() {
        var timedOut = false
        val id =
            FulfillRequestManager.createRequest(5_000) {
                timedOut = true
            }
        assertEquals(true, FulfillRequestManager.fulfill(id))
        assertEquals(false, FulfillRequestManager.fulfill(id))
        assertEquals(false, timedOut)
        FulfillRequestManager.cancelAll()
    }

    @Test
    fun fulfillRequestCancel() {
        val id = FulfillRequestManager.createRequest(5_000) {}
        assertEquals(true, FulfillRequestManager.cancel(id))
        assertEquals(false, FulfillRequestManager.cancel(id))
    }
}
