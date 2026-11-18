package io.fishjam.client

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.webrtc.VideoTrack

class PictureInPictureTest {
    private fun peer(id: String, video: Boolean = false): PeerWithTracks {
        val camera =
            if (video) {
                Track(
                    trackId = "$id-camera",
                    metadata = TrackMetadata(type = "camera", paused = false, displayName = null),
                    videoTrack = VideoTrack(1L),
                    audioTrack = null
                )
            } else {
                null
            }
        return PeerWithTracks(
            id = id,
            metadata = null,
            tracks = listOfNotNull(camera),
            cameraTrack = camera,
            microphoneTrack = null,
            screenShareVideoTrack = null,
            screenShareAudioTrack = null,
            customVideoTracks = emptyList(),
            customAudioTracks = emptyList()
        )
    }

    @Test
    fun theSpeakingPeerWins() {
        val peers = listOf(peer("a", video = true), peer("b"))

        assertEquals("b", pickActiveSpeaker(peers, mapOf("a" to false, "b" to true), lastSpeakerId = "a")?.id)
    }

    @Test
    fun theLastSpeakerStaysWhenNobodySpeaks() {
        val peers = listOf(peer("a", video = true), peer("b"))

        assertEquals("b", pickActiveSpeaker(peers, emptyMap(), lastSpeakerId = "b")?.id)
    }

    @Test
    fun aLastSpeakerWhoLeftFallsBackToTheFirstPeerWithVideo() {
        val peers = listOf(peer("a"), peer("b", video = true))

        assertEquals("b", pickActiveSpeaker(peers, emptyMap(), lastSpeakerId = "gone")?.id)
    }

    @Test
    fun noRemoteVideoGivesNoSpeaker() {
        assertNull(pickActiveSpeaker(listOf(peer("a")), emptyMap(), lastSpeakerId = null))
        assertNull(pickActiveSpeaker(emptyList(), emptyMap(), lastSpeakerId = null))
    }
}
