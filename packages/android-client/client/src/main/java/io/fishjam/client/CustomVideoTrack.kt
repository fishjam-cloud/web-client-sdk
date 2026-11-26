package io.fishjam.client

import android.hardware.HardwareBuffer
import android.os.ParcelFileDescriptor
import org.webrtc.VideoSource
import org.webrtc.VideoTrack

/** A custom video track the app fills by index from a [CustomVideoBufferPool]. */
class PooledVideoTrack internal constructor(
    override val track: VideoTrack,
    private val source: VideoSource,
    private val pool: CustomVideoBufferPool,
    private val delivery: CustomVideoFrameDelivery,
    private val onStopped: (VideoTrack) -> Unit
) : CustomVideoTrack {
    private var stopped = false

    /**
     * Sends the frame you drew into the pool slot at [bufferIndex].
     *
     * [timestampNs] is a number of nanoseconds that says when the frame belongs in time.
     * It must go up with every frame. Use `System.nanoTime()`. The SDK sends it unchanged.
     *
     * [rotation] is 0, 90, 180, or 270 clockwise. Any other value is treated as 0.
     * [fence] is only needed when the GPU may still be drawing into the slot. Pass null otherwise.
     */
    fun pushFrame(bufferIndex: Int, timestampNs: Long, rotation: Int = 0, fence: ParcelFileDescriptor? = null) {
        val fenceFd = fence?.detachFd() ?: -1
        if (stopped) {
            if (fenceFd >= 0) CustomVideoNative.closeFd(fenceFd)
            return
        }
        delivery.pushFrame(bufferIndex, fenceFd, timestampNs, customVideoRotation(rotation))
    }

    /**
     * Ends this track for good. Frames stop, and the track cannot be restarted.
     * To send again, create a new track.
     * Unpublish it first with `setCustomSource(sourceId, null)`. Then stop it, and only then dispose its pool.
     */
    override fun stop() {
        if (stopped) return
        stopped = true
        delivery.drain()
        runCatching { track.setEnabled(false) }
        runCatching { source.dispose() }
        // Unregister before dispose: the session reads the track id, which throws once disposed.
        onStopped(track)
        runCatching { track.dispose() }
        delivery.releaseGlResources()
        pool.gate.trackStopped()
    }
}

/** A custom video track the app fills with buffers it already owns. */
class ForwardVideoTrack internal constructor(
    override val track: VideoTrack,
    private val source: VideoSource,
    private val delivery: CustomVideoFrameDelivery,
    private val onStopped: (VideoTrack) -> Unit
) : CustomVideoTrack {
    private var stopped = false

    /**
     * Sends [buffer], a frame that already exists (for example from a video file or camera).
     * The SDK keeps the buffer alive after this returns, so you may close your copy right away.
     *
     * [timestampNs] is nanoseconds, as in [PooledVideoTrack.pushFrame]. Leave it at 0 and the SDK
     * stamps the frame with the current time when it delivers it.
     * [rotation] is 0, 90, 180, or 270 clockwise. Any other value is treated as 0.
     */
    fun forwardFrame(buffer: HardwareBuffer, timestampNs: Long = 0, rotation: Int = 0) {
        if (stopped) return
        val handle = CustomVideoNative.acquire(buffer)
        if (handle == 0L) return
        delivery.pushExternalBuffer(handle, timestampNs, customVideoRotation(rotation))
    }

    /**
     * Ends this track for good. Frames stop, and the track cannot be restarted.
     * To send again, create a new track.
     * Unpublish it first with `setCustomSource(sourceId, null)`, then stop it.
     */
    override fun stop() {
        if (stopped) return
        stopped = true
        delivery.drain()
        runCatching { track.setEnabled(false) }
        runCatching { source.dispose() }
        // Unregister before dispose: the session reads the track id, which throws once disposed.
        onStopped(track)
        runCatching { track.dispose() }
        delivery.releaseGlResources()
    }
}

internal interface CustomVideoTrack {
    val track: VideoTrack

    fun stop()
}

internal class CustomVideoFactory(private val session: MediaSession) {
    private val tracks = mutableListOf<CustomVideoTrack>()
    private val pools = mutableListOf<CustomVideoBufferPool>()

    fun createPool(width: Int, height: Int, poolSize: Int): CustomVideoBufferPool {
        val pool = createCustomVideoBufferPool(width, height, poolSize)
        pools += pool
        return pool
    }

    fun createPooled(pool: CustomVideoBufferPool): PooledVideoTrack {
        pool.gate.attach()
        try {
            val (source, track) = session.createCustomVideoTrack()
            val delivery =
                CustomVideoFrameDelivery(
                    source,
                    pool.buffers.map { it.buffer },
                    poolWidth(pool),
                    poolHeight(pool)
                )
            delivery.start()
            val created =
                PooledVideoTrack(track, source, pool, delivery) { stopped ->
                    session.unregisterCustomTrack(stopped)
                }
            tracks += created
            return created
        } catch (error: Throwable) {
            pool.gate.trackStopped()
            throw error
        }
    }

    fun createForward(): ForwardVideoTrack {
        val (source, track) = session.createCustomVideoTrack()
        val delivery = CustomVideoFrameDelivery(source, null, 0, 0)
        delivery.start()
        val created =
            ForwardVideoTrack(track, source, delivery) { stopped ->
                session.unregisterCustomTrack(stopped)
            }
        tracks += created
        return created
    }

    fun close() {
        tracks.toList().forEach { track -> runCatching { track.stop() } }
        pools.toList().forEach { pool -> runCatching { pool.dispose() } }
        tracks.clear()
        pools.clear()
    }

    private fun poolWidth(pool: CustomVideoBufferPool): Int = pool.buffers.firstOrNull()?.width ?: 0

    private fun poolHeight(pool: CustomVideoBufferPool): Int = pool.buffers.firstOrNull()?.height ?: 0
}
