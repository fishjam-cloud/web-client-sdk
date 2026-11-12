package io.fishjam.client

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class CameraDeviceTest {
    @Test
    fun frontAndBackLabels() {
        val cameras = listedCameras(listOf("0", "1")) { name -> name == "0" }
        assertEquals(CameraDevice("0", "Front camera", true), cameras[0])
        assertEquals(CameraDevice("1", "Back camera", false), cameras[1])
    }

    @Test
    fun duplicateFacingAppendsDeviceId() {
        val cameras = listedCameras(listOf("0", "2", "1")) { name -> name != "1" }
        assertEquals("Front camera (0)", cameras[0].label)
        assertEquals(true, cameras[0].front)
        assertEquals("Front camera (2)", cameras[1].label)
        assertEquals("Back camera", cameras[2].label)
        assertEquals(false, cameras[2].front)
    }

    @Test
    fun unknownAndEmptyDeviceIdThrow() {
        val cameras = listedCameras(listOf("0")) { true }
        val empty =
            assertThrows(CameraNotFoundException::class.java) {
                requireListedCamera(cameras, "")
            }
        val missing =
            assertThrows(CameraNotFoundException::class.java) {
                requireListedCamera(cameras, "missing")
            }
        assertEquals("No camera found", empty.message)
        assertEquals("No camera found", missing.message)
    }
}
