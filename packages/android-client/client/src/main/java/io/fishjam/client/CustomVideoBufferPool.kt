package io.fishjam.client

import android.hardware.HardwareBuffer

/** One buffer in a [CustomVideoBufferPool]. [index] does not change. */
class CustomVideoBuffer(
    val index: Int,
    val buffer: HardwareBuffer,
    val width: Int,
    val height: Int
)

/**
 * Buffers the app renders into, then hands back with [PooledVideoTrack.pushFrame].
 * RGBA, GPU-renderable and GPU-sampleable. Dispose only after the track that uses the pool has stopped.
 */
class CustomVideoBufferPool internal constructor(
    val buffers: List<CustomVideoBuffer>
) {
    internal val gate = CustomVideoPoolGate()

    /**
     * Frees the pool's memory. Call it only after the track that uses this pool has been stopped.
     * Throws [IllegalStateException] while that track is still running. Calling it again does nothing.
     */
    fun dispose() {
        if (!gate.dispose()) return
        buffers.forEach { buffer -> runCatching { buffer.buffer.close() } }
    }
}

internal fun createCustomVideoBufferPool(width: Int, height: Int, poolSize: Int): CustomVideoBufferPool {
    requireCustomVideoApi()
    requireCustomVideoPoolSize(width, height, poolSize)
    val created = ArrayList<CustomVideoBuffer>(poolSize)
    try {
        for (index in 0 until poolSize) {
            val buffer =
                HardwareBuffer.create(
                    width,
                    height,
                    HardwareBuffer.RGBA_8888,
                    1,
                    HardwareBuffer.USAGE_GPU_SAMPLED_IMAGE or HardwareBuffer.USAGE_GPU_COLOR_OUTPUT
                )
            created += CustomVideoBuffer(index, buffer, width, height)
        }
    } catch (error: Throwable) {
        created.forEach { buffer -> runCatching { buffer.buffer.close() } }
        throw error
    }
    return CustomVideoBufferPool(created)
}
