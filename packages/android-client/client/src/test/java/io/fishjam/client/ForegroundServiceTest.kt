package io.fishjam.client

import android.content.pm.ServiceInfo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ForegroundServiceTest {
    private val android14 = 34
    private val android9 = 28

    private fun types(
        config: ForegroundServiceConfig,
        sdkInt: Int = android14,
        cameraGranted: Boolean = true,
        microphoneGranted: Boolean = true,
        screenShareActive: Boolean = false
    ) = foregroundServiceTypes(config, sdkInt, cameraGranted, microphoneGranted, screenShareActive)

    @Test
    fun nothingEnabledHasNoTypes() {
        assertTrue(types(ForegroundServiceConfig()).isEmpty())
        assertTrue(types(ForegroundServiceConfig(), sdkInt = android9).isEmpty())
    }

    @Test
    fun cameraNeedsItsPermission() {
        val config = ForegroundServiceConfig(enableCamera = true)
        assertEquals(listOf(ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA), types(config))
        assertTrue(types(config, cameraGranted = false).isEmpty())
    }

    @Test
    fun microphoneNeedsItsPermission() {
        val config = ForegroundServiceConfig(enableMicrophone = true)
        assertEquals(listOf(ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE), types(config))
        assertTrue(types(config, microphoneGranted = false).isEmpty())
    }

    @Test
    fun screenSharingNeedsActiveCapture() {
        val config = ForegroundServiceConfig(enableScreenSharing = true)
        assertTrue(types(config, cameraGranted = false, microphoneGranted = false).isEmpty())
        assertEquals(
            listOf(ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION),
            types(config, cameraGranted = false, microphoneGranted = false, screenShareActive = true)
        )
    }

    @Test
    fun allEnabledGivesAllTypesWhenScreenShareIsActive() {
        val config = ForegroundServiceConfig(enableCamera = true, enableMicrophone = true, enableScreenSharing = true)
        assertEquals(
            listOf(
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            ),
            types(config)
        )
        assertEquals(
            listOf(
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            ),
            types(config, screenShareActive = true)
        )
    }

    @Test
    fun deniedPermissionDropsOnlyThatType() {
        val config = ForegroundServiceConfig(enableCamera = true, enableMicrophone = true)
        assertEquals(
            listOf(ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE),
            types(config, cameraGranted = false)
        )
    }

    @Test
    fun beforeAndroid10AnyEnabledFlagStartsTheService() {
        assertEquals(listOf(0), types(ForegroundServiceConfig(enableMicrophone = true), sdkInt = android9))
        assertEquals(
            listOf(0),
            types(ForegroundServiceConfig(enableCamera = true), sdkInt = android9, cameraGranted = false)
        )
        assertTrue(
            types(ForegroundServiceConfig(enableScreenSharing = true), sdkInt = android9).isEmpty()
        )
        assertEquals(
            listOf(0),
            types(
                ForegroundServiceConfig(enableScreenSharing = true),
                sdkInt = android9,
                screenShareActive = true
            )
        )
    }

    @Test
    fun defaultsMatchTheOtherSdks() {
        val config = ForegroundServiceConfig()
        assertEquals("com.fishjam.foregroundservice.channel", config.channelId)
        assertEquals("Fishjam Notifications", config.channelName)
        assertEquals(ForegroundServiceImportance.High, config.importance)
    }
}
