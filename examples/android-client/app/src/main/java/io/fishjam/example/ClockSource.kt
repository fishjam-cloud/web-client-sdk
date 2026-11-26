package io.fishjam.example

import android.graphics.Color
import android.graphics.HardwareBufferRenderer
import android.graphics.Paint
import android.graphics.RenderNode
import android.os.Handler
import android.os.HandlerThread
import androidx.annotation.RequiresApi
import io.fishjam.client.CustomVideoBufferPool
import io.fishjam.client.PooledVideoTrack
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * Draws a clock into the SDK buffer pool at about 15 fps.
 * [HardwareBufferRenderer] writes the pool buffer, then [PooledVideoTrack.pushFrame] sends it.
 * Requires API 34. No fence is passed.
 */
@RequiresApi(34)
class ClockSource(
    private val pool: CustomVideoBufferPool,
    private val track: PooledVideoTrack
) {
    private val thread = HandlerThread("fishjam-clock")
    private val handler: Handler
    private val width = pool.buffers.first().width
    private val height = pool.buffers.first().height
    private val node = RenderNode("clock")
    private val renderers: List<HardwareBufferRenderer>
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG)
    private var slot = 0
    private var running = false

    init {
        thread.start()
        handler = Handler(thread.looper)
        node.setPosition(0, 0, width, height)
        renderers = pool.buffers.map { buffer ->
            HardwareBufferRenderer(buffer.buffer).also { renderer -> renderer.setContentRoot(node) }
        }
        stroke.color = Color.WHITE
        stroke.style = Paint.Style.STROKE
        stroke.strokeCap = Paint.Cap.ROUND
    }

    fun start() {
        running = true
        handler.post { frame() }
    }

    fun stop() {
        if (!running) return
        running = false
        handler.post {
            renderers.forEach { renderer -> runCatching { renderer.close() } }
            thread.quitSafely()
        }
        track.stop()
        runCatching { pool.dispose() }
    }

    private fun frame() {
        if (!running) return
        val index = slot
        slot = (slot + 1) % renderers.size
        val canvas = node.beginRecording()
        drawClock(canvas)
        node.endRecording()
        renderers[index].obtainRenderRequest().draw({ command -> handler.post(command) }) {
            if (running) {
                track.pushFrame(index, System.nanoTime())
                handler.postDelayed({ frame() }, FRAME_DELAY_MS)
            }
        }
    }

    private fun drawClock(canvas: android.graphics.Canvas) {
        canvas.drawColor(Color.rgb(20, 24, 28))
        val cx = width / 2f
        val cy = height / 2f
        val radius = min(cx, cy) * 0.8f
        stroke.strokeWidth = 4f
        canvas.drawCircle(cx, cy, radius, stroke)
        val now = System.currentTimeMillis()
        val seconds = (now % 60_000) / 1000.0
        val minutes = (now / 60_000 % 60) + seconds / 60.0
        stroke.strokeWidth = 8f
        drawHand(canvas, cx, cy, radius * 0.65f, minutes / 60.0)
        stroke.strokeWidth = 4f
        drawHand(canvas, cx, cy, radius * 0.9f, seconds / 60.0)
        fill.color = Color.WHITE
        canvas.drawCircle(cx, cy, 6f, fill)
    }

    private fun drawHand(canvas: android.graphics.Canvas, cx: Float, cy: Float, length: Float, fraction: Double) {
        val angle = (-Math.PI / 2.0 + fraction * 2.0 * Math.PI).toFloat()
        canvas.drawLine(cx, cy, cx + length * cos(angle), cy + length * sin(angle), stroke)
    }

    private companion object {
        const val FRAME_DELAY_MS = 66L
    }
}
