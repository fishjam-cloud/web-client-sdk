package io.fishjam.client

import android.graphics.Matrix
import android.os.Handler
import android.os.SystemClock
import android.util.Log
import java.util.concurrent.ConcurrentHashMap
import org.webrtc.SurfaceTextureHelper
import org.webrtc.TextureBufferImpl
import org.webrtc.VideoFrame
import org.webrtc.VideoSource
import org.webrtc.YuvConverter

/**
 * Delivers [android.hardware.HardwareBuffer] frames into a [VideoSource].
 * GL work runs on one [SurfaceTextureHelper] thread that shares WebRTC's EGL context.
 */
internal class CustomVideoFrameDelivery(
    private val videoSource: VideoSource,
    private val poolBuffers: List<android.hardware.HardwareBuffer>?,
    private val width: Int,
    private val height: Int
) {
    private val surfaceTextureHelper: SurfaceTextureHelper
    private val glHandler: Handler
    private var yuvConverter: YuvConverter? = null
    private val cachedEglImages: LongArray
    private val cachedTextureIds: IntArray
    private val stateLock = Object()
    private var accepting = false
    private var inFlightCount = 0
    private var generation = 0L
    private var glResourcesReleased = false
    private val outstandingForwarded = ConcurrentHashMap<Long, Int>()

    init {
        val root = SharedEgl.base.eglBaseContext
        val helper =
            SurfaceTextureHelper.create("CustomVideoGL", root)
                ?: throw IllegalStateException("Custom video preview failed")
        surfaceTextureHelper = helper
        glHandler = helper.handler
        val poolSize = poolBuffers?.size ?: 0
        cachedEglImages = LongArray(poolSize)
        cachedTextureIds = IntArray(poolSize)
        glHandler.post { yuvConverter = YuvConverter() }
    }

    fun start() {
        synchronized(stateLock) {
            if (glResourcesReleased) return
            generation += 1
            accepting = true
        }
    }

    fun pushFrame(bufferIndex: Int, fenceFd: Int, timestampNs: Long, rotation: Int) {
        val buffers = poolBuffers
        if (buffers == null) {
            Log.w(TAG, "pushFrame on a forwarding track")
            closeFd(fenceFd)
            return
        }
        if (bufferIndex !in buffers.indices) {
            Log.w(TAG, "pushFrame index $bufferIndex is out of range")
            closeFd(fenceFd)
            return
        }
        val frameGeneration = reserveInFlight()
        if (frameGeneration == null) {
            closeFd(fenceFd)
            return
        }
        val posted =
            glHandler.post {
                val ownedFd = intArrayOf(fenceFd)
                try {
                    deliverPooled(buffers[bufferIndex], bufferIndex, ownedFd, frameGeneration, timestampNs, rotation)
                } catch (error: Throwable) {
                    Log.e(TAG, "pushFrame failed for index $bufferIndex", error)
                } finally {
                    closeFd(ownedFd[0])
                    finishInFlight()
                }
            }
        if (!posted) {
            closeFd(fenceFd)
            finishInFlight()
        }
    }

    fun pushExternalBuffer(handle: Long, timestampNs: Long, rotation: Int) {
        if (handle == 0L) return
        val frameGeneration = reserveInFlight()
        if (frameGeneration == null) {
            CustomVideoNative.release(handle)
            return
        }
        outstandingForwarded.merge(handle, 1, Int::plus)
        val posted =
            glHandler.post {
                val owned = longArrayOf(handle)
                try {
                    deliverExternal(owned, frameGeneration, timestampNs, rotation)
                } catch (error: Throwable) {
                    Log.e(TAG, "forwardFrame failed", error)
                } finally {
                    if (owned[0] != 0L) releaseForwarded(owned[0])
                    finishInFlight()
                }
            }
        if (!posted) {
            releaseForwarded(handle)
            finishInFlight()
        }
    }

    fun drain() {
        synchronized(stateLock) {
            if (glResourcesReleased) return
            accepting = false
            generation += 1
            val deadline = SystemClock.uptimeMillis() + DRAIN_TIMEOUT_MS
            while (inFlightCount > 0) {
                val remaining = deadline - SystemClock.uptimeMillis()
                if (remaining <= 0) {
                    Log.w(TAG, "Timed out waiting for custom video frames to finish")
                    break
                }
                try {
                    stateLock.wait(remaining)
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    break
                }
            }
        }
    }

    fun releaseGlResources() {
        synchronized(stateLock) {
            if (glResourcesReleased) return
            accepting = false
            generation += 1
            glResourcesReleased = true
        }
        val done = Object()
        val finished = booleanArrayOf(false)
        synchronized(done) {
            glHandler.post {
                for (index in cachedTextureIds.indices) {
                    if (cachedTextureIds[index] != 0 || cachedEglImages[index] != 0L) {
                        CustomVideoNative.releaseImportedTexture(cachedEglImages[index], cachedTextureIds[index])
                        cachedEglImages[index] = 0
                        cachedTextureIds[index] = 0
                    }
                }
                yuvConverter?.release()
                yuvConverter = null
                synchronized(done) {
                    finished[0] = true
                    done.notifyAll()
                }
            }
            try {
                done.wait(DRAIN_TIMEOUT_MS)
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
            }
        }
        if (!finished[0]) Log.w(TAG, "Timed out releasing custom video GL resources")
        surfaceTextureHelper.dispose()
        for (handle in outstandingForwarded.keys) {
            val count = outstandingForwarded.remove(handle) ?: continue
            repeat(count) { CustomVideoNative.release(handle) }
        }
    }

    private fun deliverPooled(
        buffer: android.hardware.HardwareBuffer,
        bufferIndex: Int,
        ownedFd: IntArray,
        frameGeneration: Long,
        timestampNs: Long,
        rotation: Int
    ) {
        if (!shouldDeliver(frameGeneration)) return
        var textureId = cachedTextureIds[bufferIndex]
        if (textureId == 0) {
            val imported = CustomVideoNative.importToTexture(buffer)
            if (imported == null || imported.size != 2 || imported[1] == 0L) {
                Log.e(TAG, "Could not import pool buffer $bufferIndex")
                return
            }
            cachedEglImages[bufferIndex] = imported[0]
            cachedTextureIds[bufferIndex] = imported[1].toInt()
            textureId = cachedTextureIds[bufferIndex]
        }
        val fenceFd = ownedFd[0]
        ownedFd[0] = -1
        if (!CustomVideoNative.waitSyncFd(fenceFd)) {
            Log.w(TAG, "Custom video fence wait failed")
            return
        }
        if (!shouldDeliver(frameGeneration)) return
        deliverTexture(width, height, textureId, rotation, timestampNs) {}
    }

    private fun deliverExternal(owned: LongArray, frameGeneration: Long, timestampNs: Long, rotation: Int) {
        val handle = owned[0]
        if (!shouldDeliver(frameGeneration)) return
        val dimensions = CustomVideoNative.describe(handle)
        if (dimensions == null || dimensions.size != 2 || dimensions[0] <= 0 || dimensions[1] <= 0) {
            Log.e(TAG, "Could not read the forwarded buffer size")
            return
        }
        val imported = CustomVideoNative.importHandleToTexture(handle)
        if (imported == null) {
            Log.e(TAG, "Could not import the forwarded buffer")
            return
        }
        if (!shouldDeliver(frameGeneration)) {
            CustomVideoNative.releaseImportedTexture(imported[0], imported[1].toInt())
            return
        }
        val stampNs = if (timestampNs != 0L) timestampNs else System.nanoTime()
        owned[0] = 0
        deliverTexture(dimensions[0], dimensions[1], imported[1].toInt(), rotation, stampNs) {
            releaseForwardedFrame(imported[0], imported[1].toInt(), handle)
        }
    }

    private fun deliverTexture(
        frameWidth: Int,
        frameHeight: Int,
        textureId: Int,
        rotation: Int,
        timestampNs: Long,
        release: () -> Unit
    ) {
        val buffer =
            TextureBufferImpl(
                frameWidth,
                frameHeight,
                VideoFrame.TextureBuffer.Type.OES,
                textureId,
                topDownMatrix(),
                glHandler,
                yuvConverter,
                release
            )
        val frame = VideoFrame(buffer, rotation, timestampNs)
        try {
            videoSource.capturerObserver.onFrameCaptured(frame)
        } finally {
            frame.release()
        }
    }

    private fun releaseForwardedFrame(eglImage: Long, textureId: Int, handle: Long) {
        val posted =
            glHandler.post {
                CustomVideoNative.releaseImportedTexture(eglImage, textureId)
                releaseForwarded(handle)
            }
        if (!posted) releaseForwarded(handle)
    }

    private fun releaseForwarded(handle: Long) {
        val owned = booleanArrayOf(false)
        outstandingForwarded.compute(handle) { _, count ->
            if (count == null) {
                null
            } else {
                owned[0] = true
                if (count == 1) null else count - 1
            }
        }
        if (owned[0]) CustomVideoNative.release(handle)
    }

    private fun reserveInFlight(): Long? = synchronized(stateLock) {
        if (!accepting || glResourcesReleased) return null
        inFlightCount += 1
        generation
    }

    private fun finishInFlight() {
        synchronized(stateLock) {
            inFlightCount -= 1
            if (inFlightCount <= 0) stateLock.notifyAll()
        }
    }

    private fun shouldDeliver(frameGeneration: Long): Boolean = synchronized(stateLock) {
        accepting && !glResourcesReleased && generation == frameGeneration
    }

    private fun closeFd(fenceFd: Int) {
        if (fenceFd >= 0) CustomVideoNative.closeFd(fenceFd)
    }

    private fun topDownMatrix(): Matrix = Matrix().apply {
        preTranslate(0.5f, 0.5f)
        preScale(1f, -1f)
        preTranslate(-0.5f, -0.5f)
    }

    private companion object {
        const val TAG = "FishjamCustomVideo"
        const val DRAIN_TIMEOUT_MS = 3_000L
    }
}
