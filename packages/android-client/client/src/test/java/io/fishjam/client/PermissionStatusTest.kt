package io.fishjam.client

import org.junit.Assert.assertEquals
import org.junit.Test

class PermissionStatusTest {
    @Test
    fun grantedWinsOverStoredDenial() {
        assertEquals(
            PermissionStatus.Granted,
            permissionStatus(granted = true, requested = true, permanentlyDenied = true)
        )
        assertEquals(
            PermissionStatus.Granted,
            permissionStatus(granted = true, requested = false, permanentlyDenied = false)
        )
    }

    @Test
    fun neverAskedIsPrompt() {
        assertEquals(
            PermissionStatus.Prompt,
            permissionStatus(granted = false, requested = false, permanentlyDenied = false)
        )
    }

    @Test
    fun denialThatCanBeAskedAgainIsPrompt() {
        assertEquals(
            PermissionStatus.Prompt,
            permissionStatus(granted = false, requested = true, permanentlyDenied = false)
        )
    }

    @Test
    fun permanentDenialIsDenied() {
        assertEquals(
            PermissionStatus.Denied,
            permissionStatus(granted = false, requested = true, permanentlyDenied = true)
        )
    }

    @Test
    fun labelsAreGrantedDeniedPrompt() {
        assertEquals("granted", PermissionStatus.Granted.label)
        assertEquals("denied", PermissionStatus.Denied.label)
        assertEquals("prompt", PermissionStatus.Prompt.label)
    }
}
