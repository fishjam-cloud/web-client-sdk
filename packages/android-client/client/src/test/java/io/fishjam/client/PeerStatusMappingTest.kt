package io.fishjam.client

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import uniffi.fishjam_core.CoreAuthErrorReason
import uniffi.fishjam_core.CoreEvent
import uniffi.fishjam_core.CoreException
import uniffi.fishjam_core.CoreJoinErrorReason
import uniffi.fishjam_core.CorePeerStatus

class PeerStatusMappingTest {
    @Test
    fun mapsConnectingConnectedAndIdle() {
        assertEquals(PeerStatus.Connecting, statusOf(CorePeerStatus.CONNECTING).peerStatus)
        assertEquals(PeerStatus.Connected, statusOf(CorePeerStatus.CONNECTED).peerStatus)
        assertEquals(PeerStatus.Idle, statusOf(CorePeerStatus.IDLE).peerStatus)
        assertEquals("idle", statusOf(CorePeerStatus.IDLE).peerStatus.label)
    }

    @Test
    fun mapsAuthErrorReason() {
        val update =
            statusOf(CorePeerStatus.ERROR, coreFailure("invalid token", auth = CoreAuthErrorReason.INVALID_TOKEN))
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
                CorePeerStatus.ERROR,
                coreFailure("reached peers limit", join = CoreJoinErrorReason.REACHED_PEERS_LIMIT)
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
                CorePeerStatus.ERROR,
                coreFailure("room not found", CoreAuthErrorReason.ROOM_NOT_FOUND, CoreJoinErrorReason.ROOM_NOT_FOUND)
            ).peerStatus as PeerStatus.Error

        assertEquals(AuthErrorReason.RoomNotFound, error.authReason)
        assertEquals(JoinErrorReason.RoomNotFound, error.joinReason)
    }

    @Test
    fun joinFailureUsesTheReasonWhenTheDetailIsEmpty() {
        val update = statusOf(CorePeerStatus.ERROR, coreFailure(auth = CoreAuthErrorReason.EXPIRED_TOKEN))

        assertEquals("expired token", joinFailure(update)?.message)
        assertEquals(AuthErrorReason.ExpiredToken, joinFailure(update)?.authReason)
    }

    @Test
    fun ignoresEventsThatAreNotPeerStatus() {
        assertNull(peerStatusUpdate(CoreEvent.ClosePeerConnection))
        assertNull(joinFailure(statusOf(CorePeerStatus.CONNECTED)))
    }

    private fun statusOf(status: CorePeerStatus, error: CoreException? = null): PeerStatusUpdate =
        peerStatusUpdate(CoreEvent.PeerStatusChanged(status, error))!!
}
