package io.fishjam.client

import kotlin.math.pow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Speech when the microphone level is above -32 dBov, the server's threshold.
 * The level is linear, from 0 to 1: 10^(-32/20).
 */
internal class SpeakingDetector {
    private var speaking = false
    private var silenceTicks = 0

    fun reset() {
        speaking = false
        silenceTicks = 0
    }

    /** One poll. A missing level counts as quiet. Silence waits for [SILENCE_DEBOUNCE_TICKS] quiet polls. */
    fun onLevel(level: Double?): VadStatus {
        if (level != null && level > SPEECH_THRESHOLD) {
            silenceTicks = 0
            speaking = true
        } else {
            silenceTicks += 1
            if (silenceTicks >= SILENCE_DEBOUNCE_TICKS) {
                speaking = false
            }
        }
        return if (speaking) VadStatus.Speech else VadStatus.Silence
    }

    companion object {
        const val SILENCE_DEBOUNCE_TICKS = 2
        const val POLL_INTERVAL_MS = 100L
        val SPEECH_THRESHOLD = 10.0.pow(-32.0 / 20.0)
    }
}

/**
 * Polls the published microphone while the client is connected.
 * Stops and reports silence when the microphone track goes away.
 */
internal class LocalVoiceActivity(
    private val scope: CoroutineScope,
    private val running: () -> Boolean,
    private val trackId: () -> String?,
    private val level: suspend (String) -> Double?,
    private val onStatus: (VadStatus) -> Unit
) {
    private var job: Job? = null

    fun start() {
        if (job != null) return
        job =
            scope.launch {
                val detector = SpeakingDetector()
                var polling = false
                while (running()) {
                    val id = trackId()
                    if (id == null) {
                        if (polling) {
                            polling = false
                            detector.reset()
                            onStatus(VadStatus.Silence)
                        }
                    } else {
                        polling = true
                        onStatus(detector.onLevel(runCatching { level(id) }.getOrNull()))
                    }
                    delay(SpeakingDetector.POLL_INTERVAL_MS)
                }
            }
    }
}
