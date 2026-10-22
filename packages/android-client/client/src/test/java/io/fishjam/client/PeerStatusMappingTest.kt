package io.fishjam.client

import fishjam.sdk.SdkApi
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PeerStatusMappingTest {
    @Test
    fun mapsConnectingConnectedAndIdle() {
        assertEquals(PeerStatus.Connecting, statusOf(SdkApi.PeerStatus.PEER_STATUS_CONNECTING).peerStatus)
        assertEquals(PeerStatus.Connected, statusOf(SdkApi.PeerStatus.PEER_STATUS_CONNECTED).peerStatus)
        assertEquals(PeerStatus.Idle, statusOf(SdkApi.PeerStatus.PEER_STATUS_IDLE).peerStatus)
    }

    @Test
    fun mapsAuthErrorReason() {
        val update =
            statusOf(
                SdkApi.PeerStatus.PEER_STATUS_ERROR,
                SdkApi.Error
                    .newBuilder()
                    .setMessage("invalid token")
                    .setAuthReason("invalid token")
                    .build()
            )

        assertEquals(PeerStatus.Error, update.peerStatus)
        assertEquals("invalid token", update.authReason)
        assertEquals("", update.joinReason)
        assertEquals("invalid token", joinFailure(update)?.message)
    }

    @Test
    fun mapsJoinErrorReason() {
        val update =
            statusOf(
                SdkApi.PeerStatus.PEER_STATUS_ERROR,
                SdkApi.Error
                    .newBuilder()
                    .setMessage("reached peers limit")
                    .setJoinReason("reached peers limit")
                    .build()
            )

        assertEquals("reached peers limit", update.joinReason)
        assertEquals("", update.authReason)
        assertEquals("reached peers limit", joinFailure(update)?.message)
    }

    @Test
    fun ignoresEventsThatAreNotPeerStatus() {
        val event =
            SdkApi.SdkEvent
                .newBuilder()
                .setClosePeerConnection(SdkApi.ClosePeerConnection.getDefaultInstance())
                .build()

        assertNull(peerStatusUpdate(event))
        assertNull(joinFailure(statusOf(SdkApi.PeerStatus.PEER_STATUS_CONNECTED)))
    }

    private fun statusOf(status: SdkApi.PeerStatus, error: SdkApi.Error? = null): PeerStatusUpdate {
        val changed =
            SdkApi.PeerStatusChanged
                .newBuilder()
                .setPeerStatus(status)
                .apply { if (error != null) setError(error) }
        val event = SdkApi.SdkEvent.newBuilder().setPeerStatusChanged(changed).build()
        return peerStatusUpdate(event)!!
    }
}
