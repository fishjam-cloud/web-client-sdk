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
        assertEquals("idle", statusOf(SdkApi.PeerStatus.PEER_STATUS_IDLE).peerStatus.label)
    }

    @Test
    fun mapsAuthErrorReason() {
        val update =
            statusOf(
                SdkApi.PeerStatus.PEER_STATUS_ERROR,
                SdkApi.Error
                    .newBuilder()
                    .setMessage("invalid token")
                    .setAuthErrorReason(SdkApi.AuthErrorReason.AUTH_ERROR_REASON_INVALID_TOKEN)
                    .build()
            )
        val error = update.peerStatus as PeerStatus.Error

        assertEquals(AuthErrorReason.InvalidToken, error.authReason)
        assertNull(error.joinReason)
        assertEquals("error", update.peerStatus.label)
        assertEquals("invalid token", joinFailure(update)?.message)
        assertEquals(AuthErrorReason.InvalidToken, joinFailure(update)?.authReason)
    }

    @Test
    fun mapsJoinErrorReason() {
        val update =
            statusOf(
                SdkApi.PeerStatus.PEER_STATUS_ERROR,
                SdkApi.Error
                    .newBuilder()
                    .setMessage("reached peers limit")
                    .setJoinErrorReason(SdkApi.JoinErrorReason.JOIN_ERROR_REASON_REACHED_PEERS_LIMIT)
                    .build()
            )
        val error = update.peerStatus as PeerStatus.Error

        assertEquals(JoinErrorReason.ReachedPeersLimit, error.joinReason)
        assertNull(error.authReason)
        assertEquals("reached peers limit", joinFailure(update)?.message)
        assertEquals(JoinErrorReason.ReachedPeersLimit, joinFailure(update)?.joinReason)
    }

    @Test
    fun roomNotFoundCarriesBothReasons() {
        val error =
            statusOf(
                SdkApi.PeerStatus.PEER_STATUS_ERROR,
                SdkApi.Error
                    .newBuilder()
                    .setMessage("room not found")
                    .setAuthErrorReason(SdkApi.AuthErrorReason.AUTH_ERROR_REASON_ROOM_NOT_FOUND)
                    .setJoinErrorReason(SdkApi.JoinErrorReason.JOIN_ERROR_REASON_ROOM_NOT_FOUND)
                    .build()
            ).peerStatus as PeerStatus.Error

        assertEquals(AuthErrorReason.RoomNotFound, error.authReason)
        assertEquals(JoinErrorReason.RoomNotFound, error.joinReason)
    }

    @Test
    fun fallsBackToReasonStrings() {
        val error =
            statusOf(
                SdkApi.PeerStatus.PEER_STATUS_ERROR,
                SdkApi.Error
                    .newBuilder()
                    .setMessage("expired token")
                    .setAuthReason("expired token")
                    .build()
            ).peerStatus as PeerStatus.Error

        assertEquals(AuthErrorReason.ExpiredToken, error.authReason)
        assertNull(error.joinReason)
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
