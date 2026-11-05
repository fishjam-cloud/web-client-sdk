package io.fishjam.client

import android.media.AudioDeviceInfo

/** One audio output device. [id] is the value passed to [FishjamClient.selectAudioOutput]. */
data class AudioDevice(
    val type: AudioDeviceType,
    val nativeType: String,
    val name: String,
    val id: String
)

enum class AudioDeviceType {
    Earpiece,
    Speaker,
    Bluetooth,
    WiredHeadset,
    Usb,
    Hdmi,
    AirPlay,
    CarAudio,
    HearingAid,
    LineOut,
    Unknown
}

enum class AudioOutputErrorCode {
    Select,
    Superseded,
    Timeout,
    Cancelled,
    Invalid,
    Override
}

class AudioOutputException(
    val code: AudioOutputErrorCode,
    message: String
) : Exception(message)

/**
 * `true` when [next] is the first [PeerStatus.Connected], `false` when a
 * connected room ends, and `null` when the mode stays as it is. Reconnect
 * keeps [PeerStatus.Connected], so this stays `null` across retries.
 */
internal fun communicationModeChange(previous: PeerStatus, next: PeerStatus): Boolean? {
    val wasConnected = previous == PeerStatus.Connected
    val nowConnected = next == PeerStatus.Connected
    return if (wasConnected == nowConnected) null else nowConnected
}

internal fun audioDeviceType(platformType: Int): AudioDeviceType = when (platformType) {
    AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> AudioDeviceType.Earpiece
    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> AudioDeviceType.Speaker
    AudioDeviceInfo.TYPE_WIRED_HEADSET,
    AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> AudioDeviceType.WiredHeadset
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
    AudioDeviceInfo.TYPE_BLE_HEADSET,
    AudioDeviceInfo.TYPE_BLE_SPEAKER,
    AudioDeviceInfo.TYPE_BLE_BROADCAST -> AudioDeviceType.Bluetooth
    AudioDeviceInfo.TYPE_HDMI -> AudioDeviceType.Hdmi
    AudioDeviceInfo.TYPE_USB_DEVICE,
    AudioDeviceInfo.TYPE_USB_HEADSET,
    AudioDeviceInfo.TYPE_USB_ACCESSORY -> AudioDeviceType.Usb
    AudioDeviceInfo.TYPE_BUS -> AudioDeviceType.CarAudio
    AudioDeviceInfo.TYPE_HEARING_AID -> AudioDeviceType.HearingAid
    else -> AudioDeviceType.Unknown
}

internal fun audioDeviceNativeType(platformType: Int): String = when (platformType) {
    AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "builtInEarpiece"
    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "builtInSpeaker"
    AudioDeviceInfo.TYPE_WIRED_HEADSET -> "wiredHeadset"
    AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "wiredHeadphones"
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "bluetoothSCO"
    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "bluetoothA2DP"
    AudioDeviceInfo.TYPE_HDMI -> "HDMI"
    AudioDeviceInfo.TYPE_USB_DEVICE -> "usbDevice"
    AudioDeviceInfo.TYPE_USB_HEADSET -> "usbHeadset"
    AudioDeviceInfo.TYPE_USB_ACCESSORY -> "usbAccessory"
    AudioDeviceInfo.TYPE_BUS -> "bus"
    AudioDeviceInfo.TYPE_HEARING_AID -> "hearingAid"
    AudioDeviceInfo.TYPE_BLE_HEADSET -> "bleHeadset"
    AudioDeviceInfo.TYPE_BLE_SPEAKER -> "bleSpeaker"
    AudioDeviceInfo.TYPE_BLE_BROADCAST -> "bleBroadcast"
    else -> "unknown"
}
