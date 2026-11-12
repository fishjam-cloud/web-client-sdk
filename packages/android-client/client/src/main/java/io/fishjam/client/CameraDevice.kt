package io.fishjam.client

import org.webrtc.VideoTrack

/** A camera from [FishjamClient.cameraDevices]. */
data class CameraDevice(
    val deviceId: String,
    val label: String,
    val front: Boolean
)

internal data class OpenedCamera(
    val track: VideoTrack,
    val device: CameraDevice
)

internal fun listedCameras(names: List<String>, isFront: (String) -> Boolean): List<CameraDevice> {
    val facing = names.map { name -> runCatching { isFront(name) }.getOrDefault(false) }
    val frontCount = facing.count { front -> front }
    val backCount = facing.size - frontCount
    return names.mapIndexed { index, name ->
        val front = facing[index]
        val shared = if (front) frontCount > 1 else backCount > 1
        val base = if (front) "Front camera" else "Back camera"
        CameraDevice(
            deviceId = name,
            label = if (shared) "$base ($name)" else base,
            front = front
        )
    }
}

/** Thrown when no camera matches the request or no camera is available. */
internal class CameraNotFoundException : IllegalStateException("No camera found")

internal fun requireListedCamera(devices: List<CameraDevice>, deviceId: String): CameraDevice {
    if (deviceId.isEmpty()) throw CameraNotFoundException()
    return devices.firstOrNull { device -> device.deviceId == deviceId }
        ?: throw CameraNotFoundException()
}
