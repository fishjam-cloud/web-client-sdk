package io.fishjam.client

import fishjam.sdk.SdkApi
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RoomStateMappingTest {
    @Test
    fun mapsLocalMicrophoneAndRemoteCamera() {
        val room =
            roomStateOf(
                SdkApi.RoomState
                    .newBuilder()
                    .setLocalPeer(
                        peer("local", """{"peer":{"name":"me"}}""")
                            .setMicrophoneTrack(track("local:mic", SdkApi.TrackType.TRACK_TYPE_MICROPHONE))
                            .build()
                    ).addRemotePeers(
                        peer("remote", "")
                            .setCameraTrack(track("remote:cam", SdkApi.TrackType.TRACK_TYPE_CAMERA))
                            .build()
                    ).build()
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
        val camera = track("remote:cam", SdkApi.TrackType.TRACK_TYPE_CAMERA)
        val custom = track("remote:custom", SdkApi.TrackType.TRACK_TYPE_CUSTOM_VIDEO)
        val event =
            SdkApi.SdkEvent
                .newBuilder()
                .setPeerJoined(
                    SdkApi.PeerJoined
                        .newBuilder()
                        .setPeer(
                            peer("remote", "")
                                .setCameraTrack(camera)
                                .addCustomVideoTracks(custom)
                                .addTracks(camera)
                                .addTracks(custom)
                        )
                ).build()

        val joined = peerTrackEventOf(event, emptyMap()) as FishjamEvent.PeerJoined
        val room = RoomState.Empty.applying(joined)

        assertEquals("remote:cam", joined.peer.cameraTrack?.trackId)
        assertEquals(listOf("remote:custom"), joined.peer.customVideoTracks.map { it.trackId })
        assertEquals(listOf("remote"), room.remotePeers.map { it.id })
        assertEquals("camera", room.remotePeers.single().cameraTrack?.metadata?.type)
    }

    @Test
    fun trackReadyThenRemovedUpdatesThePeer() {
        val camera = track("remote:cam", SdkApi.TrackType.TRACK_TYPE_CAMERA)
        val joined =
            peerTrackEventOf(
                SdkApi.SdkEvent
                    .newBuilder()
                    .setPeerJoined(
                        SdkApi.PeerJoined
                            .newBuilder()
                            .setPeer(
                                peer("remote", "")
                                    .setCameraTrack(camera)
                                    .addTracks(camera)
                            )
                    ).build(),
                emptyMap()
            )!!
        var room = RoomState.Empty.applying(joined)

        val ready =
            peerTrackEventOf(
                SdkApi.SdkEvent
                    .newBuilder()
                    .setTrackReady(
                        SdkApi.TrackReady
                            .newBuilder()
                            .setPeerId("remote")
                            .setTrack(camera)
                    ).build(),
                emptyMap()
            ) as FishjamEvent.TrackReady
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
                SdkApi.RoomState
                    .newBuilder()
                    .setLocalPeer(
                        peer("local", """{"peer":{"name":"me"},"server":{"role":"host"}}""").build()
                    ).addRemotePeers(peer("raw", """{"name":"raw"}""").build())
                    .addRemotePeers(peer("blank", "").build())
                    .build()
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
            track("remote:cam", SdkApi.TrackType.TRACK_TYPE_CAMERA)
                .toBuilder()
                .setSimulcastConfig(
                    SdkApi.SimulcastConfig
                        .newBuilder()
                        .setEnabled(true)
                        .addEnabledVariants(SdkApi.Variant.VARIANT_LOW)
                        .addEnabledVariants(SdkApi.Variant.VARIANT_MEDIUM)
                        .addDisabledVariants(SdkApi.Variant.VARIANT_HIGH)
                ).setEncoding(SdkApi.Variant.VARIANT_MEDIUM)
                .build()
        val room =
            roomStateOf(
                SdkApi.RoomState
                    .newBuilder()
                    .addRemotePeers(
                        peer("remote", "")
                            .setCameraTrack(camera)
                            .addTracks(camera)
                    ).build()
            )

        val mapped = room.remotePeers.single().cameraTrack
        assertEquals(true, mapped?.simulcastConfig?.enabled)
        assertEquals(listOf(Variant.Low, Variant.Medium), mapped?.simulcastConfig?.enabledVariants)
        assertEquals(listOf(Variant.High), mapped?.simulcastConfig?.disabledVariants)
        assertEquals(Variant.Medium, mapped?.encoding)
        assertNull(mapped?.videoTrack)
    }

    @Test
    fun roomSnapshotKeepsTheAttachedMediaTrack() {
        val first =
            track("remote:cam", SdkApi.TrackType.TRACK_TYPE_CAMERA)
                .toBuilder()
                .setEncoding(SdkApi.Variant.VARIANT_LOW)
                .build()
        val video = org.webrtc.VideoTrack(1)
        val attached =
            roomStateOf(
                SdkApi.RoomState
                    .newBuilder()
                    .addRemotePeers(
                        peer("remote", "")
                            .setCameraTrack(first)
                            .addTracks(first)
                    ).build()
            ).attach(mapOf("remote:cam" to video))
        assertEquals(video, attached.remotePeers.single().cameraTrack?.videoTrack)

        val next =
            track("remote:cam", SdkApi.TrackType.TRACK_TYPE_CAMERA)
                .toBuilder()
                .setEncoding(SdkApi.Variant.VARIANT_HIGH)
                .setSimulcastConfig(
                    SdkApi.SimulcastConfig
                        .newBuilder()
                        .setEnabled(true)
                        .addEnabledVariants(SdkApi.Variant.VARIANT_HIGH)
                ).build()
        val refreshed =
            roomStateOf(
                SdkApi.RoomState
                    .newBuilder()
                    .addRemotePeers(
                        peer("remote", "")
                            .setCameraTrack(next)
                            .addTracks(next)
                    ).build()
            ).attach(mapOf("remote:cam" to video))

        assertEquals(video, refreshed.remotePeers.single().cameraTrack?.videoTrack)
        assertEquals(Variant.High, refreshed.remotePeers.single().cameraTrack?.encoding)
        assertEquals(
            listOf(Variant.High),
            refreshed.remotePeers.single().cameraTrack?.simulcastConfig?.enabledVariants
        )
    }
}

private fun peer(id: String, metadataJson: String): SdkApi.PeerState.Builder = SdkApi.PeerState
    .newBuilder()
    .setId(id)
    .setMetadataJson(metadataJson)

private fun track(id: String, type: SdkApi.TrackType): SdkApi.TrackState = SdkApi.TrackState
    .newBuilder()
    .setTrackId(id)
    .setMetadata(
        SdkApi.TrackMetadata
            .newBuilder()
            .setType(type)
            .setPaused(false)
    ).build()
