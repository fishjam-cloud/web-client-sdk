package io.fishjam.client

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ScreenCaptureSizeTest {
    @Test
    fun scalesDownWhenLongerEdgeExceedsCap() {
        val size = screenCaptureSizeFor(2560, 1440, maxEdge = 1280f)
        assertEquals(1280, size.first)
        assertEquals(720, size.second)
    }

    @Test
    fun leavesSmallDisplaysUnchanged() {
        val size = screenCaptureSizeFor(720, 1280, maxEdge = 1280f)
        assertEquals(720, size.first)
        assertEquals(1280, size.second)
    }

    @Test
    fun neverReturnsZero() {
        val size = screenCaptureSizeFor(0, 0, maxEdge = 1280f)
        assertTrue(size.first >= 1)
        assertTrue(size.second >= 1)
    }
}
