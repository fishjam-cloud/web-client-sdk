package io.fishjam.client

import org.junit.Assert.assertEquals
import org.junit.Test

class LocalVoiceActivityTest {
    @Test
    fun aLevelAboveTheThresholdIsSpeech() {
        val detector = SpeakingDetector()

        assertEquals(VadStatus.Speech, detector.onLevel(SpeakingDetector.SPEECH_THRESHOLD + 0.001))
    }

    @Test
    fun aLevelAtTheThresholdStaysSilent() {
        val detector = SpeakingDetector()

        assertEquals(VadStatus.Silence, detector.onLevel(SpeakingDetector.SPEECH_THRESHOLD))
        assertEquals(VadStatus.Silence, detector.onLevel(0.0))
        assertEquals(VadStatus.Silence, detector.onLevel(null))
    }

    @Test
    fun silenceNeedsTwoQuietPolls() {
        val detector = SpeakingDetector()
        detector.onLevel(0.1)

        assertEquals(VadStatus.Speech, detector.onLevel(0.0))
        assertEquals(VadStatus.Silence, detector.onLevel(0.0))
    }

    @Test
    fun aLoudPollResetsTheQuietCount() {
        val detector = SpeakingDetector()
        detector.onLevel(0.1)
        detector.onLevel(0.0)

        assertEquals(VadStatus.Speech, detector.onLevel(0.1))
        assertEquals(VadStatus.Speech, detector.onLevel(0.0))
        assertEquals(VadStatus.Silence, detector.onLevel(null))
    }

    @Test
    fun resetClearsSpeech() {
        val detector = SpeakingDetector()
        detector.onLevel(0.1)
        detector.reset()

        assertEquals(VadStatus.Silence, detector.onLevel(0.0))
    }
}
