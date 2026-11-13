package io.fishjam.client

import android.Manifest
import fishjam.sdk.SdkApi
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Owns the camera: start, stop, switch, its publish job, and its error. */
internal class CameraController(
    private val scope: CoroutineScope,
    private val host: DeviceHost
) {
    private val _isOn = MutableStateFlow(false)
    val isOn: StateFlow<Boolean> = _isOn.asStateFlow()

    private val _currentCamera = MutableStateFlow<CameraDevice?>(null)
    val currentCamera: StateFlow<CameraDevice?> = _currentCamera.asStateFlow()

    private val _error = MutableStateFlow<DeviceError?>(null)
    val error: StateFlow<DeviceError?> = _error.asStateFlow()

    private var preferredCameraId: String? = null

    // Each start or stop takes the next value. The call that still owns that
    // value after the device work is the one that keeps the camera.
    private val epoch = AtomicInteger(0)
    private var publishJob: Job? = null
    private val trackIds = PublishedTrackIds()

    fun devices(): List<CameraDevice> = host.session.cameraDevices()

    /**
     * Switches to [deviceId] from [devices].
     * An open camera stays the same video track, so the room and the published track stay.
     */
    suspend fun select(deviceId: String) {
        val devices = devices()
        try {
            val device = requireListedCamera(devices, deviceId)
            if (_isOn.value) {
                if (_currentCamera.value?.deviceId == device.deviceId) {
                    _error.value = null
                    return
                }
                val generation = host.captureGeneration()
                host.session.switchCamera(generation, device.deviceId)
                if (!isCurrentCapture(generation) || !_isOn.value) return
                preferredCameraId = device.deviceId
                _currentCamera.value = device
                _error.value = null
                return
            }
            start(device.deviceId)
        } catch (error: CancellationException) {
            throw error
        } catch (error: TrackTypeError) {
            throw error
        } catch (error: Throwable) {
            _error.value = deviceErrorForCameraFailure(error)
            throw error
        }
    }

    suspend fun start() {
        val preferred = preferredCameraId
        val deviceId = preferred?.takeIf { id -> devices().any { camera -> camera.deviceId == id } }
        start(deviceId)
    }

    suspend fun stop() {
        val epochValue = epoch.incrementAndGet()
        publishJob?.cancel()
        publishJob = null
        val generation = host.captureGeneration()
        val ids = trackIds.take()
        host.session.stopCamera(generation)
        ids.forEach { trackId -> host.removePublishedTrack(trackId) }
        if (epoch.get() != epochValue) return
        host.setLocalCamera(null)
        _isOn.value = false
        _currentCamera.value = null
    }

    suspend fun toggle() {
        if (_isOn.value) stop() else start()
    }

    /** Stops the camera after the room is left. Keeps the error. */
    fun reset() {
        epoch.incrementAndGet()
        publishJob?.cancel()
        publishJob = null
        trackIds.clear()
        host.setLocalCamera(null)
        _isOn.value = false
        _currentCamera.value = null
    }

    /**
     * Used by initializeDevices. Asks for permission, then starts the camera.
     * Returns the error, or null when the camera is on.
     */
    suspend fun startRequested(): DeviceError? {
        if (_isOn.value) {
            _error.value = null
            return null
        }
        val permission =
            if (OsPermissions.query(host.appContext, Manifest.permission.CAMERA) == PermissionStatus.Granted) {
                PermissionStatus.Granted
            } else {
                OsPermissions.request(host.appContext, Manifest.permission.CAMERA)
            }
        if (permission != PermissionStatus.Granted) {
            _error.value = DeviceError.NotAllowed
            return DeviceError.NotAllowed
        }
        return try {
            start()
            if (_isOn.value) {
                null
            } else {
                _error.value ?: DeviceError.Unknown.also { _error.value = it }
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: TrackTypeError) {
            throw error
        } catch (error: Throwable) {
            _error.value ?: deviceErrorForCameraFailure(error)
        }
    }

    private suspend fun start(deviceId: String?) {
        if (_isOn.value) {
            _error.value = null
            return
        }
        if (
            cameraStart(
                connected = host.peerStatus.value == PeerStatus.Connected,
                audioOnly = host.isAudioOnly()
            ) == CameraStart.RejectVideo
        ) {
            throw TrackTypeError()
        }
        val epochValue = epoch.incrementAndGet()
        val generation = host.captureGeneration()
        try {
            val opened = host.session.startCamera(generation, deviceId) { epoch.get() == epochValue } ?: return
            if (!isCurrentDevice(generation, epochValue)) return
            _isOn.value = true
            preferredCameraId = opened.device.deviceId
            _currentCamera.value = opened.device
            host.setLocalCamera(opened.track)
            _error.value = null
            publishJob?.cancel()
            publishJob =
                scope.launch {
                    publishWhileCurrent(
                        host = host,
                        trackIds = trackIds,
                        track = opened.track,
                        kind = SdkApi.TrackKind.TRACK_KIND_VIDEO,
                        type = SdkApi.TrackType.TRACK_TYPE_CAMERA,
                        generation = generation,
                        isCurrent = { isCurrentDevice(generation, epochValue) }
                    )
                }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            _error.value = deviceErrorForCameraFailure(error)
            throw error
        }
    }

    private fun isCurrentCapture(generation: Int): Boolean = host.isOpen() && generation == host.captureGeneration()

    private fun isCurrentDevice(generation: Int, epochValue: Int): Boolean =
        isCurrentCapture(generation) && epoch.get() == epochValue
}
