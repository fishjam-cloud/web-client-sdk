package io.fishjam.client

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DeviceInitTest {
    @Test
    fun bothDevicesStartedIsInitialized() {
        val result =
            initializeDevicesResult(
                videoRequested = true,
                audioRequested = true,
                videoError = null,
                audioError = null
            )
        assertEquals(InitializeDevicesStatus.Initialized, result.status)
        assertNull(result.errors)
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
                audioError = DeviceError.Unhandled
            )
        assertEquals(InitializeDevicesStatus.Failed, result.status)
        assertEquals(DeviceError.NotAllowed, result.errors?.video)
        assertEquals(DeviceError.Unhandled, result.errors?.audio)
    }

    @Test
    fun aDeviceLeftOutIsNotAnError() {
        val videoOnly =
            initializeDevicesResult(
                videoRequested = true,
                audioRequested = false,
                videoError = null,
                audioError = DeviceError.NotAllowed
            )
        assertEquals(InitializeDevicesStatus.Initialized, videoOnly.status)
        assertNull(videoOnly.errors)

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
                videoError = DeviceError.NotAllowed,
                audioError = DeviceError.NotAllowed
            )
        assertEquals(InitializeDevicesStatus.Initialized, result.status)
        assertNull(result.errors)
    }

    @Test
    fun labelsMatchReactNative() {
        assertEquals("initialized", InitializeDevicesStatus.Initialized.label)
        assertEquals("failed", InitializeDevicesStatus.Failed.label)
        assertEquals("initialized_with_errors", InitializeDevicesStatus.InitializedWithErrors.label)
        assertEquals("already_initialized", InitializeDevicesStatus.AlreadyInitialized.label)
        assertEquals("NotAllowedError", DeviceError.NotAllowed.rawValue)
        assertEquals("NotFoundError", DeviceError.NotFound.rawValue)
        assertEquals("OverconstrainedError", DeviceError.Overconstrained.rawValue)
        assertEquals("UNHANDLED_ERROR", DeviceError.Unhandled.rawValue)
    }

    @Test
    fun cameraPermissionDeniedIsNotAllowed() {
        assertEquals(
            DeviceError.NotAllowed,
            deviceErrorForCameraFailure(SecurityException("CAMERA permission is required"), 1, null)
        )
    }

    @Test
    fun noCameraAtAllIsNotFound() {
        assertEquals(
            DeviceError.NotFound,
            deviceErrorForCameraFailure(IllegalStateException("No camera found"), 0, null)
        )
    }

    @Test
    fun missingCameraIdIsOverconstrained() {
        assertEquals(
            DeviceError.Overconstrained,
            deviceErrorForCameraFailure(IllegalArgumentException("No camera found"), 2, "missing")
        )
    }

    @Test
    fun otherCameraFailureIsUnhandled() {
        assertEquals(
            DeviceError.Unhandled,
            deviceErrorForCameraFailure(IllegalStateException("Camera switch timed out"), 2, "0")
        )
    }

    @Test
    fun microphonePermissionDeniedIsNotAllowed() {
        assertEquals(
            DeviceError.NotAllowed,
            deviceErrorForMicrophoneFailure(SecurityException("RECORD_AUDIO permission is required"))
        )
        assertEquals(
            DeviceError.Unhandled,
            deviceErrorForMicrophoneFailure(IllegalStateException("audio failed"))
        )
    }

    @Test
    fun interruptedCallIsFailed() {
        val result = interruptedInitializeDevicesResult(videoRequested = true, audioRequested = false)
        assertEquals(InitializeDevicesStatus.Failed, result.status)
        assertEquals(DeviceError.Unhandled, result.errors?.video)
        assertNull(result.errors?.audio)
    }
}
