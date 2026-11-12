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

/** Owns the microphone: start, stop, its publish job, and its error. */
internal class MicrophoneController(
    private val scope: CoroutineScope,
    private val host: DeviceHost
) {
    private val _isOn = MutableStateFlow(false)
    val isOn: StateFlow<Boolean> = _isOn.asStateFlow()

    private val _error = MutableStateFlow<DeviceError?>(null)
    val error: StateFlow<DeviceError?> = _error.asStateFlow()

    // Each start or stop takes the next value. The call that still owns that
    // value after the device work is the one that keeps the microphone.
    private val epoch = AtomicInteger(0)
    private var publishJob: Job? = null
    private val trackIds = PublishedTrackIds()

    suspend fun start() {
        if (_isOn.value) {
            _error.value = null
            return
        }
        val epochValue = epoch.incrementAndGet()
        val generation = host.captureGeneration()
        try {
            val track = host.session.startMicrophone(generation) { epoch.get() == epochValue } ?: return
            if (!isCurrentDevice(generation, epochValue)) return
            _isOn.value = true
            _error.value = null
            publishJob?.cancel()
            publishJob =
                scope.launch {
                    publishWhileCurrent(
                        host = host,
                        trackIds = trackIds,
                        track = track,
                        kind = SdkApi.TrackKind.TRACK_KIND_AUDIO,
                        type = SdkApi.TrackType.TRACK_TYPE_MICROPHONE,
                        generation = generation,
                        isCurrent = { isCurrentDevice(generation, epochValue) }
                    )
                }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            _error.value = deviceErrorForMicrophoneFailure(error)
            throw error
        }
    }

    suspend fun stop() {
        val epochValue = epoch.incrementAndGet()
        publishJob?.cancel()
        publishJob = null
        val generation = host.captureGeneration()
        val ids = trackIds.take()
        host.session.stopMicrophone(generation)
        ids.forEach { trackId ->
            host.removePublishedTrack(trackId)
            host.localTrackRemoved(trackId)
        }
        if (epoch.get() != epochValue) return
        _isOn.value = false
    }

    suspend fun toggle() {
        if (_isOn.value) stop() else start()
    }

    /** Stops the microphone after the room is left. Keeps the error. */
    fun reset() {
        epoch.incrementAndGet()
        publishJob?.cancel()
        publishJob = null
        trackIds.take().forEach { trackId -> host.localTrackRemoved(trackId) }
        _isOn.value = false
    }

    /**
     * Used by initializeDevices. Asks for permission, then starts the microphone.
     * Returns the error, or null when the microphone is on.
     */
    suspend fun startRequested(): DeviceError? {
        if (_isOn.value) {
            _error.value = null
            return null
        }
        val permission =
            if (OsPermissions.query(host.appContext, Manifest.permission.RECORD_AUDIO) == PermissionStatus.Granted) {
                PermissionStatus.Granted
            } else {
                OsPermissions.request(host.appContext, Manifest.permission.RECORD_AUDIO)
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
        } catch (error: Throwable) {
            _error.value ?: deviceErrorForMicrophoneFailure(error)
        }
    }

    private fun isCurrentCapture(generation: Int): Boolean = host.isOpen() && generation == host.captureGeneration()

    private fun isCurrentDevice(generation: Int, epochValue: Int): Boolean =
        isCurrentCapture(generation) && epoch.get() == epochValue
}
