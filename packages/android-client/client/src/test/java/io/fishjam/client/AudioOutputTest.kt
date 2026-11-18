package io.fishjam.client

import android.media.AudioDeviceInfo
import org.junit.Assert.assertEquals
import org.junit.Test

class AudioOutputTest {
    @Test
    fun mapsPlatformTypes() {
        assertEquals(AudioDeviceType.Speaker, audioDeviceType(AudioDeviceInfo.TYPE_BUILTIN_SPEAKER))
        assertEquals(AudioDeviceType.Earpiece, audioDeviceType(AudioDeviceInfo.TYPE_BUILTIN_EARPIECE))
        assertEquals(AudioDeviceType.Bluetooth, audioDeviceType(AudioDeviceInfo.TYPE_BLUETOOTH_SCO))
        assertEquals(AudioDeviceType.Bluetooth, audioDeviceType(AudioDeviceInfo.TYPE_BLUETOOTH_A2DP))
        assertEquals(AudioDeviceType.WiredHeadset, audioDeviceType(AudioDeviceInfo.TYPE_WIRED_HEADSET))
        assertEquals(AudioDeviceType.WiredHeadset, audioDeviceType(AudioDeviceInfo.TYPE_WIRED_HEADPHONES))
        assertEquals(AudioDeviceType.Hdmi, audioDeviceType(AudioDeviceInfo.TYPE_HDMI))
        assertEquals(AudioDeviceType.Usb, audioDeviceType(AudioDeviceInfo.TYPE_USB_DEVICE))
        assertEquals(AudioDeviceType.Usb, audioDeviceType(AudioDeviceInfo.TYPE_USB_HEADSET))
        assertEquals(AudioDeviceType.CarAudio, audioDeviceType(AudioDeviceInfo.TYPE_BUS))
        assertEquals(AudioDeviceType.HearingAid, audioDeviceType(AudioDeviceInfo.TYPE_HEARING_AID))
        assertEquals(AudioDeviceType.Unknown, audioDeviceType(-1))
        assertEquals("builtInSpeaker", audioDeviceNativeType(AudioDeviceInfo.TYPE_BUILTIN_SPEAKER))
        assertEquals("bluetoothSCO", audioDeviceNativeType(AudioDeviceInfo.TYPE_BLUETOOTH_SCO))
        assertEquals("HDMI", audioDeviceNativeType(AudioDeviceInfo.TYPE_HDMI))
        assertEquals("bus", audioDeviceNativeType(AudioDeviceInfo.TYPE_BUS))
    }

    @Test
    fun entersOnConnectedAndLeavesWhenTheRoomEnds() {
        assertEquals(true, communicationModeChange(PeerStatus.Idle, PeerStatus.Connected))
        assertEquals(null, communicationModeChange(PeerStatus.Connecting, PeerStatus.Idle))
        assertEquals(null, communicationModeChange(PeerStatus.Connected, PeerStatus.Connected))
        assertEquals(false, communicationModeChange(PeerStatus.Connected, PeerStatus.Idle))
        assertEquals(
            false,
            communicationModeChange(PeerStatus.Connected, PeerStatus.Error("lost", null, null))
        )
    }
}
