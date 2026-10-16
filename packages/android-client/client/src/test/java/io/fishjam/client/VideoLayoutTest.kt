package io.fishjam.client

import org.junit.Assert.assertEquals
import org.junit.Test

class VideoLayoutTest {
    @Test
    fun coverFillsTheView() {
        assertEquals(
            VideoDisplayRect(0, 0, 1000, 200),
            videoDisplayRect(1000, 200, 720, 1280, 0, ObjectFit.Cover)
        )
    }

    @Test
    fun containFitsAPortraitFrameInAWideView() {
        assertEquals(
            VideoDisplayRect(444, 0, 556, 200),
            videoDisplayRect(1000, 200, 720, 1280, 0, ObjectFit.Contain)
        )
    }

    @Test
    fun containTreatsAQuarterTurnAsSwappedSides() {
        assertEquals(
            VideoDisplayRect(0, 44, 200, 156),
            videoDisplayRect(200, 200, 720, 1280, 90, ObjectFit.Contain)
        )
    }
}
