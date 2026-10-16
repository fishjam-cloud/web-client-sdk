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
        assertEquals(JsonPrimitive("me"), (metadata?.get("peer") as JsonObject)["name"])
        assertEquals("microphone", room.localPeer?.microphoneTrack?.metadata?.type)
        assertEquals(false, room.localPeer?.microphoneTrack?.metadata?.paused)
        assertNull(room.localPeer?.cameraTrack)
        assertEquals("remote", room.remotePeers.single().id)
        assertEquals("camera", room.remotePeers.single().cameraTrack?.metadata?.type)
        assertNull(room.remotePeers.single().metadata)
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
