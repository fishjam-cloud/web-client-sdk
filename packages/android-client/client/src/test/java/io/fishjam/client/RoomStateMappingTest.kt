package io.fishjam.client

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import uniffi.fishjam_core.CoreEvent
import uniffi.fishjam_core.CoreSimulcastConfig
import uniffi.fishjam_core.CoreTrackType
import uniffi.fishjam_core.CoreVadStatus
import uniffi.fishjam_core.CoreVariant

class RoomStateMappingTest {
    @Test
    fun mapsLocalMicrophoneAndRemoteCamera() {
        val room =
            roomStateOf(
                coreRoom(
                    local = corePeer(
                        "local",
                        """{"peer":{"name":"me"}}""",
                        microphoneTrack = coreTrack("local:mic", CoreTrackType.MICROPHONE)
                    ),
                    remote = listOf(corePeer("remote", cameraTrack = coreTrack("remote:cam", CoreTrackType.CAMERA)))
                )
            )

        assertEquals("local", room.localPeer?.id)
        val metadata = room.localPeer?.metadata
        assertEquals(JsonPrimitive("me"), (metadata?.peer as JsonObject)["name"])
        assertNull(metadata?.server)
        assertEquals("microphone", room.localPeer?.microphoneTrack?.metadata?.type)
        assertEquals(false, room.localPeer?.microphoneTrack?.metadata?.paused)
        assertNull(room.localPeer?.cameraTrack)
        assertEquals("remote", room.remotePeers.single().id)
        assertEquals("camera", room.remotePeers.single().cameraTrack?.metadata?.type)
        assertNull(room.remotePeers.single().metadata)
    }

    @Test
    fun peerJoinedAddsRemotePeerSplitByTrackType() {
        val camera = coreTrack("remote:cam", CoreTrackType.CAMERA)
        val custom = coreTrack("remote:custom", CoreTrackType.CUSTOM_VIDEO)
        val event =
            CoreEvent.PeerJoined(
                corePeer(
                    "remote",
                    cameraTrack = camera,
                    customVideoTracks = listOf(custom),
                    tracks = listOf(camera, custom)
                )
            )

        val joined = peerTrackEventOf(event, emptyMap()) as FishjamEvent.PeerJoined
        val room = RoomState.Empty.applying(joined)

        assertEquals("remote:cam", joined.peer.cameraTrack?.trackId)
        assertEquals(listOf("remote:custom"), joined.peer.customVideoTracks.map { it.trackId })
        assertEquals(listOf("remote"), room.remotePeers.map { it.id })
        assertEquals("camera", room.remotePeers.single().cameraTrack?.metadata?.type)
    }

    @Test
    fun trackReadyThenRemovedUpdatesThePeer() {
        val camera = coreTrack("remote:cam", CoreTrackType.CAMERA)
        val joined =
            peerTrackEventOf(
                CoreEvent.PeerJoined(corePeer("remote", cameraTrack = camera, tracks = listOf(camera))),
                emptyMap()
            )!!
        var room = RoomState.Empty.applying(joined)

        val ready =
            peerTrackEventOf(CoreEvent.TrackReady("remote", camera), emptyMap()) as FishjamEvent.TrackReady
        room = room.applying(ready)
        assertEquals("remote:cam", room.remotePeers.single().cameraTrack?.trackId)

        room = room.applying(FishjamEvent.TrackRemoved("remote", ready.track))
        assertNull(room.remotePeers.single().cameraTrack)
        assertEquals(emptyList<Track>(), room.remotePeers.single().tracks)

        room = room.applying(FishjamEvent.PeerLeft(room.remotePeers.single()))
        assertEquals(emptyList<PeerWithTracks>(), room.remotePeers)
    }

    @Test
    fun splitsPeerAndServerMetadata() {
        val room =
            roomStateOf(
                coreRoom(
                    local = corePeer("local", """{"peer":{"name":"me"},"server":{"role":"host"}}"""),
                    remote = listOf(corePeer("raw", """{"name":"raw"}"""), corePeer("blank"))
                )
            )

        val local = room.localPeer?.metadata
        assertEquals(JsonPrimitive("me"), (local?.peer as JsonObject)["name"])
        assertEquals(JsonPrimitive("host"), (local?.server as JsonObject)["role"])
        val raw = room.remotePeers.first { it.id == "raw" }.metadata
        assertEquals(JsonPrimitive("raw"), (raw?.peer as JsonObject)["name"])
        assertNull(raw?.server)
        assertNull(room.remotePeers.first { it.id == "blank" }.metadata)
    }

    @Test
    fun mapsSimulcastConfigAndCurrentEncoding() {
        val camera =
            coreTrack(
                "remote:cam",
                CoreTrackType.CAMERA,
                simulcastConfig = CoreSimulcastConfig(
                    true,
                    listOf(CoreVariant.LOW, CoreVariant.MEDIUM),
                    listOf(CoreVariant.HIGH)
                ),
                encoding = CoreVariant.MEDIUM
            )
        val room =
            roomStateOf(coreRoom(remote = listOf(corePeer("remote", cameraTrack = camera, tracks = listOf(camera)))))

        val mapped = room.remotePeers.single().cameraTrack
        assertEquals(true, mapped?.simulcastConfig?.enabled)
        assertEquals(listOf(Variant.Low, Variant.Medium), mapped?.simulcastConfig?.enabledVariants)
        assertEquals(listOf(Variant.High), mapped?.simulcastConfig?.disabledVariants)
        assertEquals(Variant.Medium, mapped?.encoding)
        assertNull(mapped?.videoTrack)
    }

    @Test
    fun roomSnapshotKeepsTheAttachedMediaTrack() {
        val first = coreTrack("remote:cam", CoreTrackType.CAMERA, encoding = CoreVariant.LOW)
        val video = org.webrtc.VideoTrack(1)
        val attached =
            roomStateOf(coreRoom(remote = listOf(corePeer("remote", cameraTrack = first, tracks = listOf(first)))))
                .attach(mapOf("remote:cam" to video))
        assertEquals(video, attached.remotePeers.single().cameraTrack?.videoTrack)

        val next =
            coreTrack(
                "remote:cam",
                CoreTrackType.CAMERA,
                simulcastConfig = CoreSimulcastConfig(true, listOf(CoreVariant.HIGH), emptyList()),
                encoding = CoreVariant.HIGH
            )
        val refreshed =
            roomStateOf(coreRoom(remote = listOf(corePeer("remote", cameraTrack = next, tracks = listOf(next)))))
                .attach(mapOf("remote:cam" to video))

        assertEquals(video, refreshed.remotePeers.single().cameraTrack?.videoTrack)
        assertEquals(Variant.High, refreshed.remotePeers.single().cameraTrack?.encoding)
        assertEquals(
            listOf(Variant.High),
            refreshed.remotePeers.single().cameraTrack?.simulcastConfig?.enabledVariants
        )
    }

    @Test
    fun screenShareTracksGetTheirMedia() {
        val remoteScreen = coreTrack("remote:screen", CoreTrackType.SCREEN_SHARE_VIDEO)
        val localScreen = coreTrack("local:screen", CoreTrackType.SCREEN_SHARE_VIDEO)
        val remoteVideo = org.webrtc.VideoTrack(1)
        val localVideo = org.webrtc.VideoTrack(2)
        val attached =
            roomStateOf(
                coreRoom(
                    local = corePeer("local", screenShareVideoTrack = localScreen, tracks = listOf(localScreen)),
                    remote = listOf(
                        corePeer("remote", screenShareVideoTrack = remoteScreen, tracks = listOf(remoteScreen))
                    )
                )
            ).attach(mapOf("remote:screen" to remoteVideo, "local:screen" to localVideo))

        assertEquals(remoteVideo, attached.remotePeers.single().screenShareVideoTrack?.videoTrack)
        assertEquals(localVideo, attached.localPeer?.screenShareVideoTrack?.videoTrack)
    }

    @Test
    fun trackAddedEventPutsTheRemoteScreenShareInItsSlot() {
        val screen = coreTrack("remote:screen", CoreTrackType.SCREEN_SHARE_VIDEO)
        val video = org.webrtc.VideoTrack(1)
        val event = peerTrackEventOf(CoreEvent.TrackAdded("remote", screen), mapOf("remote:screen" to video))

        val state = RoomState.Empty.applying(requireNotNull(event))

        assertEquals(video, state.remotePeers.single().screenShareVideoTrack?.videoTrack)
    }

    @Test
    fun mapsSpeechOnTheMicrophoneAndSilenceByDefault() {
        val quiet = coreTrack("local:mic", CoreTrackType.MICROPHONE)
        val speech = coreTrack("remote:mic", CoreTrackType.MICROPHONE, vadStatus = CoreVadStatus.SPEECH)
        val room =
            roomStateOf(
                coreRoom(
                    local = corePeer("local", microphoneTrack = quiet, tracks = listOf(quiet)),
                    remote = listOf(corePeer("remote", microphoneTrack = speech, tracks = listOf(speech)))
                )
            )

        assertEquals(VadStatus.Silence, room.localPeer?.microphoneTrack?.vadStatus)
        assertEquals(VadStatus.Speech, room.remotePeers.single().microphoneTrack?.vadStatus)
        assertEquals(mapOf("local" to false, "remote" to true), voiceActivityOf(room))
    }

    @Test
    fun trackUpdatedAppliesVadStatus() {
        val quiet = coreTrack("remote:mic", CoreTrackType.MICROPHONE)
        val joined =
            peerTrackEventOf(
                CoreEvent.PeerJoined(corePeer("remote", microphoneTrack = quiet, tracks = listOf(quiet))),
                emptyMap()
            )!!
        val speech = quiet.copy(vadStatus = CoreVadStatus.SPEECH)
        val updated = peerTrackEventOf(
            CoreEvent.TrackUpdated("remote", speech),
            emptyMap()
        ) as FishjamEvent.TrackUpdated
        val room = RoomState.Empty.applying(joined).applying(updated)

        assertEquals(VadStatus.Speech, updated.track.vadStatus)
        assertEquals(VadStatus.Speech, room.remotePeers.single().microphoneTrack?.vadStatus)
        assertEquals(mapOf("remote" to true), voiceActivityOf(room))
    }
}
