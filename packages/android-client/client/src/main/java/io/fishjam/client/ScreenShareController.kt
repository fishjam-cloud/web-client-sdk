package io.fishjam.client

import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import uniffi.fishjam_core.CoreTrackKind
import uniffi.fishjam_core.CoreTrackType

/** Owns screen sharing: consent, capture, publish, and its error. */
internal class ScreenShareController(
    private val scope: CoroutineScope,
    private val host: DeviceHost
) {
    private val _isOn = MutableStateFlow(false)
    val isOn: StateFlow<Boolean> = _isOn.asStateFlow()

    private val _error = MutableStateFlow<DeviceError?>(null)
    val error: StateFlow<DeviceError?> = _error.asStateFlow()

    private val epoch = AtomicInteger(0)
    private var publishJob: Job? = null
    private val trackIds = PublishedTrackIds()

    suspend fun start() {
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
        if (!ForegroundService.isScreenSharingEnabled()) {
            throw IllegalStateException(
                "Start ForegroundService with enableScreenSharing before screen sharing"
            )
        }
        val epochValue = epoch.incrementAndGet()
        val generation = host.captureGeneration()
        try {
            val consent = ScreenCaptureConsent.request(host.appContext)
            if (!isCurrentDevice(generation, epochValue)) return
            if (consent == null) {
                _error.value = DeviceError.NotAllowed
                throw SecurityException("Screen capture permission was not granted")
            }
            ForegroundService.activateScreenShare(host.appContext)
            if (!isCurrentDevice(generation, epochValue)) {
                ForegroundService.deactivateScreenShare(host.appContext)
                return
            }
            val track =
                host.session.startScreenCapture(generation, consent) { epoch.get() == epochValue }
                    ?: run {
                        ForegroundService.deactivateScreenShare(host.appContext)
                        return
                    }
            if (!isCurrentDevice(generation, epochValue)) {
                host.session.stopScreenCapture(generation)
                ForegroundService.deactivateScreenShare(host.appContext)
                return
            }
            _isOn.value = true
            _error.value = null
            publishJob?.cancel()
            publishJob =
                scope.launch {
                    publishWhileCurrent(
                        host = host,
                        trackIds = trackIds,
                        track = track,
                        kind = CoreTrackKind.VIDEO,
                        type = CoreTrackType.SCREEN_SHARE_VIDEO,
                        generation = generation,
                        isCurrent = { isCurrentDevice(generation, epochValue) }
                    )
                }
        } catch (error: CancellationException) {
            throw error
        } catch (error: TrackTypeError) {
            throw error
        } catch (error: Throwable) {
            _error.value = deviceErrorForScreenShareFailure(error)
            throw error
        }
    }

    suspend fun stop() {
        val epochValue = epoch.incrementAndGet()
        publishJob?.cancel()
        publishJob = null
        val generation = host.captureGeneration()
        val ids = trackIds.take()
        host.session.stopScreenCapture(generation)
        ForegroundService.deactivateScreenShare(host.appContext)
        ids.forEach { trackId ->
            host.removePublishedTrack(trackId)
            host.localTrackRemoved(trackId)
        }
        if (epoch.get() != epochValue) return
        _isOn.value = false
    }

    /** Called when the system stops MediaProjection (the user taps the stop chip). */
    fun onSystemStopped() {
        if (!_isOn.value) return
        scope.launch {
            try {
                stop()
            } catch (_: Throwable) {
                // Best effort: the capture is already gone.
            }
        }
    }

    suspend fun toggle() {
        if (_isOn.value) stop() else start()
    }

    /** Stops screen sharing after the room is left. Keeps the error. */
    fun reset() {
        epoch.incrementAndGet()
        publishJob?.cancel()
        publishJob = null
        trackIds.take().forEach { trackId -> host.localTrackRemoved(trackId) }
        _isOn.value = false
        // Stop the projection while the service still has the media projection type.
        // Dropping that type first leaves the status-bar timer up, and Android 14 can warn.
        host.session.endScreenCapture()
        ForegroundService.deactivateScreenShare(host.appContext)
    }

    private fun isCurrentCapture(generation: Int): Boolean = host.isOpen() && generation == host.captureGeneration()

    private fun isCurrentDevice(generation: Int, epochValue: Int): Boolean =
        isCurrentCapture(generation) && epoch.get() == epochValue
}
