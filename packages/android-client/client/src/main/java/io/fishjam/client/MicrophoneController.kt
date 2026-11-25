package io.fishjam.client

import android.Manifest
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.webrtc.AudioTrack
import uniffi.fishjam_core.CoreTrackKind
import uniffi.fishjam_core.CoreTrackType

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
    private var runningTrack: AudioTrack? = null

    suspend fun start(): AudioTrack {
        if (_isOn.value) {
            _error.value = null
            return runningTrack ?: throw IllegalStateException("The microphone stopped before it started.")
        }
        val epochValue = epoch.incrementAndGet()
        val generation = host.captureGeneration()
        try {
            val track = host.session.startMicrophone(generation) { epoch.get() == epochValue } ?: return stoppedEarly()
            if (!isCurrentDevice(generation, epochValue)) return stoppedEarly()
            _isOn.value = true
            _error.value = null
            runningTrack = track
            publishJob?.cancel()
            publishJob =
                scope.launch {
                    publishWhileCurrent(
                        host = host,
                        trackIds = trackIds,
                        track = track,
                        kind = CoreTrackKind.AUDIO,
                        type = CoreTrackType.MICROPHONE,
                        generation = generation,
                        isCurrent = { isCurrentDevice(generation, epochValue) }
                    )
                }
            return track
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
        runningTrack = null
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
        runningTrack = null
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

    private fun stoppedEarly(): Nothing = throw IllegalStateException("The microphone stopped before it started.")

    private fun isCurrentCapture(generation: Int): Boolean = host.isOpen() && generation == host.captureGeneration()

    private fun isCurrentDevice(generation: Int, epochValue: Int): Boolean =
        isCurrentCapture(generation) && epoch.get() == epochValue
}
