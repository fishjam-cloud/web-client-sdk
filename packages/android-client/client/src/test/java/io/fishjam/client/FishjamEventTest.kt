package io.fishjam.client

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import uniffi.fishjam_core.CoreAuthErrorReason
import uniffi.fishjam_core.CoreEvent
import uniffi.fishjam_core.CoreException
import uniffi.fishjam_core.CoreJoinErrorReason
import uniffi.fishjam_core.CorePeerState
import uniffi.fishjam_core.CorePeerStatus
import uniffi.fishjam_core.CoreReconnectionStatus
import uniffi.fishjam_core.CoreVadStatus

class FishjamEventTest {
    private val mapper = FishjamEventMapper()

    @Test
    fun joinEmitsConnectionStartedAuthSuccessAndJoined() {
        val names =
            run(status(CorePeerStatus.CONNECTING)) +
                run(authenticated()) +
                run(roomChanged(local = peerState("local"), remote = listOf(peerState("remote", "remote:cam")))) +
                run(status(CorePeerStatus.CONNECTED))

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
        run(status(CorePeerStatus.CONNECTING))
        val error = coreFailure("invalid token", auth = CoreAuthErrorReason.INVALID_TOKEN)

        assertEquals(
            listOf("authError InvalidToken", "disconnected"),
            run(status(CorePeerStatus.ERROR, error))
        )
    }

    @Test
    fun roomNotFoundIsAnAuthErrorOnly() {
        run(status(CorePeerStatus.CONNECTING))
        val error = coreFailure(auth = CoreAuthErrorReason.ROOM_NOT_FOUND, join = CoreJoinErrorReason.ROOM_NOT_FOUND)

        assertEquals(
            listOf("authError RoomNotFound", "disconnected"),
            run(status(CorePeerStatus.ERROR, error))
        )
    }

    @Test
    fun joinErrorIsFollowedByDisconnected() {
        run(status(CorePeerStatus.CONNECTING))
        val error = coreFailure(join = CoreJoinErrorReason.REACHED_PEERS_LIMIT)

        assertEquals(
            listOf("joinError ReachedPeersLimit", "disconnected"),
            run(status(CorePeerStatus.ERROR, error))
        )
    }

    @Test
    fun errorWithoutReasonIsAConnectionError() {
        join()
        val error = coreFailure("ice failed")

        assertEquals(
            listOf("connectionError ice failed", "disconnected"),
            run(status(CorePeerStatus.ERROR, error))
        )
    }

    @Test
    fun leavingEmitsDisconnectedOnce() {
        join()

        assertEquals(listOf("disconnected"), run(status(CorePeerStatus.IDLE)))
        assertEquals(emptyList<String>(), run(status(CorePeerStatus.IDLE)))
    }

    @Test
    fun idleBeforeAnyJoinEmitsNothing() {
        assertEquals(emptyList<String>(), run(status(CorePeerStatus.IDLE)))
    }

    @Test
    fun reconnectionSucceedsWithJoined() {
        join()
        val names =
            run(reconnection(CoreReconnectionStatus.RECONNECTING)) +
                run(reconnection(CoreReconnectionStatus.RECONNECTING)) +
                run(roomChanged(local = null, remote = emptyList())) +
                run(roomChanged(local = peerState("local"), remote = emptyList())) +
                run(reconnection(CoreReconnectionStatus.IDLE))

        assertEquals(listOf("reconnectionStarted", "joined local peers=", "reconnected"), names)
    }

    @Test
    fun noDisconnectedWhileReconnecting() {
        join()
        val names =
            run(reconnection(CoreReconnectionStatus.RECONNECTING)) +
                run(roomChanged(local = null, remote = emptyList()))

        assertFalse(names.contains("disconnected"))
    }

    @Test
    fun retriesExhaustedEmitsLimitReachedThenDisconnectedWithoutReconnected() {
        join()
        val error = coreFailure("Reconnection attempts exhausted")
        val names =
            run(reconnection(CoreReconnectionStatus.RECONNECTING)) +
                run(reconnection(CoreReconnectionStatus.ERROR)) +
                run(status(CorePeerStatus.ERROR, error))

        assertEquals(listOf("reconnectionStarted", "reconnectionRetriesLimitReached", "disconnected"), names)
    }

    @Test
    fun leavingWhileReconnectingNeverEmitsJoined() {
        join()
        run(reconnection(CoreReconnectionStatus.RECONNECTING))
        val names =
            run(roomChanged(local = null, remote = emptyList())) +
                run(reconnection(CoreReconnectionStatus.IDLE)) +
                run(status(CorePeerStatus.IDLE)) +
                run(status(CorePeerStatus.CONNECTING)) +
                run(roomChanged(local = peerState("local"), remote = emptyList())) +
                run(status(CorePeerStatus.CONNECTED))

        assertEquals(listOf("disconnected", "connectionStarted", "joined local peers="), names)
    }

    @Test
    fun peerAndTrackEventsAreForwarded() {
        val joined = CoreEvent.PeerJoined(peerState("remote", "remote:cam"))
        val ready = CoreEvent.TrackReady("remote", coreTrack("remote:cam"))
        val updated = CoreEvent.PeerUpdated(peerState("remote"))

        assertEquals(listOf("peerJoined remote tracks=1"), run(joined))
        assertEquals(listOf("trackReady remote remote:cam"), run(ready))
        assertEquals(listOf("peerUpdated remote tracks=0"), run(updated))
    }

    @Test
    fun voiceActivityChangedIsForwarded() {
        val event = CoreEvent.VoiceActivityChanged("remote", "remote:mic", CoreVadStatus.SPEECH)

        assertEquals(listOf("voiceActivityChanged remote remote:mic speech"), run(event))
    }

    @Test
    fun peersMissingFromTheNewRoomAreReportedGone() {
        join(remote = listOf(peerState("remote", "remote:cam", "remote:mic")))
        run(peerJoined(peerState("remote", "remote:cam", "remote:mic")))
        run(reconnection(CoreReconnectionStatus.RECONNECTING))

        assertEquals(
            listOf("trackRemoved remote remote:cam", "trackRemoved remote remote:mic", "peerLeft remote"),
            run(roomChanged(local = null, remote = emptyList()))
        )
    }

    @Test
    fun peerLeftFollowedByRoomStateDoesNotReportItTwice() {
        run(peerJoined(peerState("remote")))
        val left = CoreEvent.PeerLeft(peerState("remote"))

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

    private fun join(remote: List<CorePeerState> = emptyList()) {
        run(status(CorePeerStatus.CONNECTING))
        run(authenticated())
        run(roomChanged(local = peerState("local"), remote = remote))
        run(status(CorePeerStatus.CONNECTED))
    }

    private fun run(event: CoreEvent): List<String> = mapper.map(event, emptyMap()).map(::describe)

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
        is FishjamEvent.LocalTrackMuted -> "localTrackMuted ${event.trackId}"
        is FishjamEvent.LocalTrackUnmuted -> "localTrackUnmuted ${event.trackId}"
        is FishjamEvent.LocalTrackBandwidthSet -> "localTrackBandwidthSet ${event.trackId}"
        is FishjamEvent.LocalTrackEncodingBandwidthSet ->
            "localTrackEncodingBandwidthSet ${event.trackId} ${event.kbps}"
        is FishjamEvent.LocalPeerMetadataChanged -> "localPeerMetadataChanged"
        is FishjamEvent.VoiceActivityChanged ->
            "voiceActivityChanged ${event.peerId} ${event.trackId} ${event.vadStatus.name.lowercase()}"
    }

    private fun status(status: CorePeerStatus, error: CoreException? = null): CoreEvent =
        CoreEvent.PeerStatusChanged(status, error)

    private fun reconnection(status: CoreReconnectionStatus): CoreEvent = CoreEvent.ReconnectionStatusChanged(status)

    private fun authenticated(audioOnly: Boolean = false): CoreEvent = CoreEvent.Authenticated(audioOnly)

    private fun roomChanged(local: CorePeerState?, remote: List<CorePeerState>): CoreEvent =
        CoreEvent.RoomStateChanged(coreRoom(local, remote))

    private fun peerJoined(peer: CorePeerState): CoreEvent = CoreEvent.PeerJoined(peer)

    private fun peerState(id: String, vararg tracks: String): CorePeerState =
        corePeer(id, tracks = tracks.map { coreTrack(it) })
}
