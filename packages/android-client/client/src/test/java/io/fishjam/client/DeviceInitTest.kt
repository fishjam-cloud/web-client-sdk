package io.fishjam.client

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DeviceInitTest {
    @Test
    fun bothDevicesStartedHasNoErrors() {
        val result =
            initializeDevicesResult(
                videoRequested = true,
                audioRequested = true,
                videoError = null,
                audioError = null
            )
        assertEquals(InitializeDevicesResult(InitializeDevicesStatus.Initialized, null), result)
    }

    @Test
    fun oneDeviceFailedIsInitializedWithErrors() {
        val result =
            initializeDevicesResult(
                videoRequested = true,
                audioRequested = true,
                videoError = DeviceError.NotFound,
                audioError = null
            )
        assertEquals(InitializeDevicesStatus.InitializedWithErrors, result.status)
        assertEquals(DeviceError.NotFound, result.errors?.video)
        assertNull(result.errors?.audio)
    }

    @Test
    fun everyRequestedDeviceFailedIsFailed() {
        val result =
            initializeDevicesResult(
                videoRequested = true,
                audioRequested = true,
                videoError = DeviceError.NotAllowed,
                audioError = DeviceError.Unknown
            )
        assertEquals(InitializeDevicesStatus.Failed, result.status)
        assertEquals(DeviceError.NotAllowed, result.errors?.video)
        assertEquals(DeviceError.Unknown, result.errors?.audio)
    }

    @Test
    fun deviceLeftOutIsNotAnError() {
        val videoOnly =
            initializeDevicesResult(
                videoRequested = true,
                audioRequested = false,
                videoError = null,
                audioError = null
            )
        assertEquals(InitializeDevicesResult(InitializeDevicesStatus.Initialized, null), videoOnly)

        val audioFailed =
            initializeDevicesResult(
                videoRequested = false,
                audioRequested = true,
                videoError = null,
                audioError = DeviceError.NotAllowed
            )
        assertEquals(InitializeDevicesStatus.Failed, audioFailed.status)
        assertNull(audioFailed.errors?.video)
        assertEquals(DeviceError.NotAllowed, audioFailed.errors?.audio)
    }

    @Test
    fun nothingRequestedIsInitialized() {
        val result =
            initializeDevicesResult(
                videoRequested = false,
                audioRequested = false,
                videoError = null,
                audioError = null
            )
        assertEquals(InitializeDevicesResult(InitializeDevicesStatus.Initialized, null), result)
    }

    @Test
    fun interruptedCallFailsRequestedDevices() {
        val result = interruptedInitializeDevicesResult(videoRequested = true, audioRequested = false)
        assertEquals(InitializeDevicesStatus.Failed, result.status)
        assertEquals(DeviceError.Unknown, result.errors?.video)
        assertNull(result.errors?.audio)
    }

    @Test
    fun cameraPermissionDeniedIsNotAllowed() {
        assertEquals(
            DeviceError.NotAllowed,
            deviceErrorForCameraFailure(SecurityException("CAMERA permission is required"))
        )
    }

    @Test
    fun noCameraIsNotFound() {
        assertEquals(DeviceError.NotFound, deviceErrorForCameraFailure(CameraNotFoundException()))
    }

    @Test
    fun otherCameraFailureIsUnknown() {
        assertEquals(
            DeviceError.Unknown,
            deviceErrorForCameraFailure(IllegalStateException("Camera switch timed out"))
        )
    }

    @Test
    fun microphonePermissionDeniedIsNotAllowed() {
        assertEquals(
            DeviceError.NotAllowed,
            deviceErrorForMicrophoneFailure(SecurityException("RECORD_AUDIO permission is required"))
        )
        assertEquals(
            DeviceError.Unknown,
            deviceErrorForMicrophoneFailure(IllegalStateException("audio failed"))
        )
    }
}
