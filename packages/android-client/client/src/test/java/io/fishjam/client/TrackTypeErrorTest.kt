package io.fishjam.client

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import uniffi.fishjam_core.CoreException

class TrackTypeErrorTest {
    @Test
    fun trackTypeReasonMapsToTrackTypeError() {
        val thrown = exceptionForCallError(CoreException.TrackType("ignored"))
        assertTrue(thrown is TrackTypeError)
        assertTrue(thrown.message!!.contains("audio-only"))
    }

    @Test
    fun anotherReasonIsNotTrackTypeError() {
        val error = coreFailure("Cannot add tracks before being accepted by the server")
        assertFalse(isTrackTypeError(error))
        val thrown = exceptionForCallError(error)
        assertTrue(thrown is IllegalStateException)
        assertEquals("Cannot add tracks before being accepted by the server", thrown.message)
    }

    @Test
    fun connectedAudioOnlyRejectsBeforeTheCameraOpens() {
        assertEquals(CameraStart.RejectVideo, cameraStart(connected = true, audioOnly = true))
    }

    @Test
    fun notConnectedOpensTheCameraAndPublishesInTheBackground() {
        assertEquals(CameraStart.OpenAndPublish, cameraStart(connected = false, audioOnly = true))
        assertEquals(CameraStart.OpenAndPublish, cameraStart(connected = true, audioOnly = false))
        assertEquals(CameraStart.OpenAndPublish, cameraStart(connected = false, audioOnly = false))
    }
}
