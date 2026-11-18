package io.fishjam.client

import fishjam.sdk.SdkApi
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class FishjamEventTest {
    private val mapper = FishjamEventMapper()

    @Test
    fun joinEmitsConnectionStartedAuthSuccessAndJoined() {
        val names =
            run(status(SdkApi.PeerStatus.PEER_STATUS_CONNECTING)) +
                run(authenticated()) +
                run(roomChanged(local = peerState("local"), remote = listOf(peerState("remote", "remote:cam")))) +
                run(status(SdkApi.PeerStatus.PEER_STATUS_CONNECTED))

        assertEquals(
            listOf("connectionStarted", "authSuccess audioOnly=false", "joined local peers=remote"),
            names
        )
    }

    @Test
    fun authSuccessReportsAudioOnlyRoom() {
        assertEquals(listOf("authSuccess audioOnly=true"), run(authenticated(audioOnly = true)))
    }

    @Test
    fun authErrorIsFollowedByDisconnected() {
        run(status(SdkApi.PeerStatus.PEER_STATUS_CONNECTING))
        val error =
            SdkApi.Error
                .newBuilder()
                .setMessage("invalid token")
                .setAuthErrorReason(SdkApi.AuthErrorReason.AUTH_ERROR_REASON_INVALID_TOKEN)
                .build()

        assertEquals(
            listOf("authError InvalidToken", "disconnected"),
            run(status(SdkApi.PeerStatus.PEER_STATUS_ERROR, error))
        )
    }

    @Test
    fun roomNotFoundIsAnAuthErrorOnly() {
        run(status(SdkApi.PeerStatus.PEER_STATUS_CONNECTING))
        val error =
            SdkApi.Error
                .newBuilder()
                .setAuthErrorReason(SdkApi.AuthErrorReason.AUTH_ERROR_REASON_ROOM_NOT_FOUND)
                .setJoinErrorReason(SdkApi.JoinErrorReason.JOIN_ERROR_REASON_ROOM_NOT_FOUND)
                .build()

        assertEquals(
            listOf("authError RoomNotFound", "disconnected"),
            run(status(SdkApi.PeerStatus.PEER_STATUS_ERROR, error))
        )
    }

    @Test
    fun joinErrorIsFollowedByDisconnected() {
        run(status(SdkApi.PeerStatus.PEER_STATUS_CONNECTING))
        val error =
            SdkApi.Error
                .newBuilder()
                .setJoinErrorReason(SdkApi.JoinErrorReason.JOIN_ERROR_REASON_REACHED_PEERS_LIMIT)
                .build()

        assertEquals(
            listOf("joinError ReachedPeersLimit", "disconnected"),
            run(status(SdkApi.PeerStatus.PEER_STATUS_ERROR, error))
        )
    }

    @Test
    fun errorWithoutReasonIsAConnectionError() {
        join()
        val error = SdkApi.Error.newBuilder().setMessage("ice failed").build()

        assertEquals(
            listOf("connectionError ice failed", "disconnected"),
            run(status(SdkApi.PeerStatus.PEER_STATUS_ERROR, error))
        )
    }

    @Test
    fun leavingEmitsDisconnectedOnce() {
        join()

        assertEquals(listOf("disconnected"), run(status(SdkApi.PeerStatus.PEER_STATUS_IDLE)))
        assertEquals(emptyList<String>(), run(status(SdkApi.PeerStatus.PEER_STATUS_IDLE)))
    }

    @Test
    fun idleBeforeAnyJoinEmitsNothing() {
        assertEquals(emptyList<String>(), run(status(SdkApi.PeerStatus.PEER_STATUS_IDLE)))
    }

    @Test
    fun reconnectionSucceedsWithJoined() {
        join()
        val names =
            run(reconnection(SdkApi.ReconnectionStatus.RECONNECTION_STATUS_RECONNECTING)) +
                run(reconnection(SdkApi.ReconnectionStatus.RECONNECTION_STATUS_RECONNECTING)) +
                run(roomChanged(local = null, remote = emptyList())) +
                run(roomChanged(local = peerState("local"), remote = emptyList())) +
                run(reconnection(SdkApi.ReconnectionStatus.RECONNECTION_STATUS_IDLE))

        assertEquals(listOf("reconnectionStarted", "joined local peers=", "reconnected"), names)
    }

    @Test
    fun noDisconnectedWhileReconnecting() {
        join()
        val names =
            run(reconnection(SdkApi.ReconnectionStatus.RECONNECTION_STATUS_RECONNECTING)) +
                run(roomChanged(local = null, remote = emptyList()))

        assertFalse(names.contains("disconnected"))
    }

    @Test
    fun retriesExhaustedEmitsLimitReachedThenDisconnectedWithoutReconnected() {
        join()
        val error = SdkApi.Error.newBuilder().setMessage("Reconnection attempts exhausted").build()
        val names =
            run(reconnection(SdkApi.ReconnectionStatus.RECONNECTION_STATUS_RECONNECTING)) +
                run(reconnection(SdkApi.ReconnectionStatus.RECONNECTION_STATUS_ERROR)) +
                run(status(SdkApi.PeerStatus.PEER_STATUS_ERROR, error))

        assertEquals(listOf("reconnectionStarted", "reconnectionRetriesLimitReached", "disconnected"), names)
    }

    @Test
    fun leavingWhileReconnectingNeverEmitsJoined() {
        join()
        run(reconnection(SdkApi.ReconnectionStatus.RECONNECTION_STATUS_RECONNECTING))
        val names =
            run(roomChanged(local = null, remote = emptyList())) +
                run(reconnection(SdkApi.ReconnectionStatus.RECONNECTION_STATUS_IDLE)) +
                run(status(SdkApi.PeerStatus.PEER_STATUS_IDLE)) +
                run(status(SdkApi.PeerStatus.PEER_STATUS_CONNECTING)) +
                run(roomChanged(local = peerState("local"), remote = emptyList())) +
                run(status(SdkApi.PeerStatus.PEER_STATUS_CONNECTED))

        assertEquals(listOf("disconnected", "connectionStarted", "joined local peers="), names)
    }

    @Test
    fun peerAndTrackEventsAreForwarded() {
        val joined =
            SdkApi.SdkEvent
                .newBuilder()
                .setPeerJoined(SdkApi.PeerJoined.newBuilder().setPeer(peerState("remote", "remote:cam")))
                .build()
        val ready =
            SdkApi.SdkEvent
                .newBuilder()
                .setTrackReady(
                    SdkApi.TrackReady
                        .newBuilder()
                        .setPeerId("remote")
                        .setTrack(trackState("remote:cam"))
                ).build()
        val updated =
            SdkApi.SdkEvent
                .newBuilder()
                .setPeerUpdated(SdkApi.PeerUpdated.newBuilder().setPeer(peerState("remote")))
                .build()

        assertEquals(listOf("peerJoined remote tracks=1"), run(joined))
        assertEquals(listOf("trackReady remote remote:cam"), run(ready))
        assertEquals(listOf("peerUpdated remote tracks=0"), run(updated))
    }

    @Test
    fun peersMissingFromTheNewRoomAreReportedGone() {
        join(remote = listOf(peerState("remote", "remote:cam", "remote:mic")))
        run(peerJoined(peerState("remote", "remote:cam", "remote:mic")))
        run(reconnection(SdkApi.ReconnectionStatus.RECONNECTION_STATUS_RECONNECTING))

        assertEquals(
            listOf("trackRemoved remote remote:cam", "trackRemoved remote remote:mic", "peerLeft remote"),
            run(roomChanged(local = null, remote = emptyList()))
        )
    }

    @Test
    fun peerLeftFollowedByRoomStateDoesNotReportItTwice() {
        run(peerJoined(peerState("remote")))
        val left =
            SdkApi.SdkEvent
                .newBuilder()
                .setPeerLeft(SdkApi.PeerLeft.newBuilder().setPeer(peerState("remote")))
                .build()

        assertEquals(listOf("peerLeft remote"), run(left))
        assertEquals(emptyList<String>(), run(roomChanged(local = null, remote = emptyList())))
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun hubDeliversInOrderToEveryCollector() = runTest {
        val hub = EventHub()
        val first = mutableListOf<String>()
        val second = mutableListOf<String>()
        val dispatcher = UnconfinedTestDispatcher(testScheduler)
        val jobs =
            listOf(
                launch(dispatcher) { hub.events.collect { first += describe(it) } },
                launch(dispatcher) { hub.events.collect { second += describe(it) } }
            )

        hub.emit(listOf(FishjamEvent.ConnectionStarted, FishjamEvent.Disconnected))
        jobs.forEach { it.cancel() }

        assertEquals(listOf("connectionStarted", "disconnected"), first)
        assertEquals(first, second)
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun hubCollectorSeesOnlyEventsAfterItStartedAndNoneAfterCancel() = runTest {
        val hub = EventHub()
        hub.emit(FishjamEvent.ConnectionStarted)
        val names = mutableListOf<String>()
        val job = launch(UnconfinedTestDispatcher(testScheduler)) { hub.events.collect { names += describe(it) } }

        hub.emit(FishjamEvent.Reconnected)
        job.cancel()
        hub.emit(FishjamEvent.Disconnected)

        assertEquals(listOf("reconnected"), names)
    }

    private fun join(remote: List<SdkApi.PeerState.Builder> = emptyList()) {
        run(status(SdkApi.PeerStatus.PEER_STATUS_CONNECTING))
        run(authenticated())
        run(roomChanged(local = peerState("local"), remote = remote))
        run(status(SdkApi.PeerStatus.PEER_STATUS_CONNECTED))
    }

    private fun run(event: SdkApi.SdkEvent): List<String> = mapper.map(event, emptyMap()).map(::describe)

    private fun describe(event: FishjamEvent): String = when (event) {
        FishjamEvent.ConnectionStarted -> "connectionStarted"
        is FishjamEvent.AuthSuccess -> "authSuccess audioOnly=${event.audioOnly}"
        is FishjamEvent.AuthError -> "authError ${event.reason}"
        is FishjamEvent.Joined -> "joined ${event.peerId} peers=${event.peers.joinToString(",") { it.id }}"
        is FishjamEvent.JoinError -> "joinError ${event.reason}"
        is FishjamEvent.ConnectionError -> "connectionError ${event.message}"
        FishjamEvent.Disconnected -> "disconnected"
        FishjamEvent.ReconnectionStarted -> "reconnectionStarted"
        FishjamEvent.Reconnected -> "reconnected"
        FishjamEvent.ReconnectionRetriesLimitReached -> "reconnectionRetriesLimitReached"
        is FishjamEvent.PeerJoined -> "peerJoined ${event.peer.id} tracks=${event.peer.tracks.size}"
        is FishjamEvent.PeerLeft -> "peerLeft ${event.peer.id}"
        is FishjamEvent.PeerUpdated -> "peerUpdated ${event.peer.id} tracks=${event.peer.tracks.size}"
        is FishjamEvent.TrackAdded -> "trackAdded ${event.peerId} ${event.track.trackId}"
        is FishjamEvent.TrackReady -> "trackReady ${event.peerId} ${event.track.trackId}"
        is FishjamEvent.TrackRemoved -> "trackRemoved ${event.peerId} ${event.track.trackId}"
        is FishjamEvent.TrackUpdated -> "trackUpdated ${event.peerId} ${event.track.trackId}"
        is FishjamEvent.LocalTrackAdded -> "localTrackAdded ${event.trackId} ${event.type}"
        is FishjamEvent.LocalTrackRemoved -> "localTrackRemoved ${event.trackId}"
        is FishjamEvent.LocalTrackReplaced -> "localTrackReplaced ${event.trackId}"
        is FishjamEvent.LocalTrackBandwidthSet -> "localTrackBandwidthSet ${event.trackId}"
        is FishjamEvent.LocalTrackEncodingBandwidthSet ->
            "localTrackEncodingBandwidthSet ${event.trackId} ${event.kbps}"
        is FishjamEvent.LocalPeerMetadataChanged -> "localPeerMetadataChanged"
    }

    private fun status(status: SdkApi.PeerStatus, error: SdkApi.Error? = null): SdkApi.SdkEvent {
        val changed = SdkApi.PeerStatusChanged.newBuilder().setPeerStatus(status)
        if (error != null) changed.setError(error)
        return SdkApi.SdkEvent.newBuilder().setPeerStatusChanged(changed).build()
    }

    private fun reconnection(status: SdkApi.ReconnectionStatus): SdkApi.SdkEvent = SdkApi.SdkEvent
        .newBuilder()
        .setReconnectionStatusChanged(SdkApi.ReconnectionStatusChanged.newBuilder().setStatus(status))
        .build()

    private fun authenticated(audioOnly: Boolean = false): SdkApi.SdkEvent = SdkApi.SdkEvent
        .newBuilder()
        .setAuthenticated(SdkApi.Authenticated.newBuilder().setAudioOnly(audioOnly))
        .build()

    private fun roomChanged(local: SdkApi.PeerState.Builder?, remote: List<SdkApi.PeerState.Builder>): SdkApi.SdkEvent {
        val room = SdkApi.RoomState.newBuilder()
        if (local != null) room.setLocalPeer(local)
        remote.forEach { room.addRemotePeers(it) }
        return SdkApi.SdkEvent
            .newBuilder()
            .setRoomStateChanged(SdkApi.RoomStateChanged.newBuilder().setRoomState(room))
            .build()
    }

    private fun peerJoined(peer: SdkApi.PeerState.Builder): SdkApi.SdkEvent = SdkApi.SdkEvent
        .newBuilder()
        .setPeerJoined(SdkApi.PeerJoined.newBuilder().setPeer(peer))
        .build()

    private fun peerState(id: String, vararg tracks: String): SdkApi.PeerState.Builder {
        val builder = SdkApi.PeerState.newBuilder().setId(id)
        tracks.forEach { builder.addTracks(trackState(it)) }
        return builder
    }

    private fun trackState(id: String): SdkApi.TrackState = SdkApi.TrackState
        .newBuilder()
        .setTrackId(id)
        .setMetadata(SdkApi.TrackMetadata.newBuilder().setType(SdkApi.TrackType.TRACK_TYPE_CAMERA))
        .build()
}
