package io.fishjam.client

import android.os.Handler
import android.util.Log
import org.webrtc.CapturerObserver
import org.webrtc.VideoFrame

/**
 * Re-delivers the last captured frame about once per second.
 *
 * Android's [org.webrtc.ScreenCapturerAndroid] only emits a frame when the screen content changes.
 * On a static screen the encoder has no input, so a keyframe request from a newly joined viewer
 * stays unanswered until the screen changes again. Repeating the last frame keeps a frame available.
 *
 * The cached frame is an I420 memory copy, never the capture texture. Holding a texture frame
 * would block the capturer from delivering the next one.
 */
internal class FrameRepeatingCapturerObserver(
    private val delegate: CapturerObserver,
    private val handler: Handler
) : CapturerObserver {
    private var lastBuffer: VideoFrame.Buffer? = null
    private var lastRotation = 0
    private var lastCacheNs = 0L
    private var capturing = false
    private var loggedFirstFrame = false

    private val repeatRunnable = Runnable { repeatLastFrame() }

    override fun onCapturerStarted(success: Boolean) {
        handler.post { capturing = success }
        delegate.onCapturerStarted(success)
    }

    override fun onCapturerStopped() {
        handler.post {
            capturing = false
            handler.removeCallbacks(repeatRunnable)
            releaseCachedFrame()
        }
        delegate.onCapturerStopped()
    }

    override fun onFrameCaptured(frame: VideoFrame) {
        delegate.onFrameCaptured(frame)
        if (!capturing) return
        if (!loggedFirstFrame) {
            loggedFirstFrame = true
            Log.i(TAG, "First screen frame ${frame.rotatedWidth}x${frame.rotatedHeight}")
        }

        val now = System.nanoTime()
        if (lastBuffer == null || now - lastCacheNs >= CACHE_MIN_INTERVAL_NS) {
            val i420 = frame.buffer.toI420()
            if (i420 != null) {
                releaseCachedFrame()
                lastBuffer = i420
                lastRotation = frame.rotation
                lastCacheNs = now
            }
        }

        handler.removeCallbacks(repeatRunnable)
        handler.postDelayed(repeatRunnable, REPEAT_INTERVAL_MS)
    }

    private fun repeatLastFrame() {
        val buffer = lastBuffer
        if (!capturing || buffer == null) return
        buffer.retain()
        val repeated = VideoFrame(buffer, lastRotation, System.nanoTime())
        delegate.onFrameCaptured(repeated)
        repeated.release()
        handler.postDelayed(repeatRunnable, REPEAT_INTERVAL_MS)
    }

    private fun releaseCachedFrame() {
        lastBuffer?.release()
        lastBuffer = null
    }

    companion object {
        private const val TAG = "Fishjam"
        private const val REPEAT_INTERVAL_MS = 1000L
        private const val CACHE_MIN_INTERVAL_NS = 500_000_000L
    }
}
