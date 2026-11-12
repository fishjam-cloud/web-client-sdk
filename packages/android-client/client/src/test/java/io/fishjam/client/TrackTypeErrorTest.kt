package io.fishjam.client

import fishjam.sdk.SdkApi
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TrackTypeErrorTest {
    @Test
    fun trackTypeReasonMapsToTrackTypeError() {
        val error =
            SdkApi.Error
                .newBuilder()
                .setCallErrorReason(SdkApi.CallErrorReason.CALL_ERROR_REASON_TRACK_TYPE)
                .setMessage("ignored")
                .build()
        val thrown = exceptionForCallError(error)
        assertTrue(thrown is TrackTypeError)
        assertTrue(thrown.message!!.contains("audio-only"))
    }

    @Test
    fun anotherReasonIsNotTrackTypeError() {
        val error =
            SdkApi.Error
                .newBuilder()
                .setMessage("Cannot add tracks before being accepted by the server")
                .build()
        assertFalse(isTrackTypeError(error))
        assertTrue(exceptionForCallError(error) is IllegalStateException)
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
