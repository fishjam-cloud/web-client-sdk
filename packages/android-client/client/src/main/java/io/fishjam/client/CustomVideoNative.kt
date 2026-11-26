package io.fishjam.client

import android.hardware.HardwareBuffer

/**
 * JNI entry points for turning a [HardwareBuffer] into a GL texture.
 * The methods stay public so the native names are stable.
 */
object CustomVideoNative {
    init {
        System.loadLibrary("fishjam_custom_video")
    }

    @JvmStatic
    external fun importToTexture(buffer: HardwareBuffer): LongArray?

    @JvmStatic
    external fun importHandleToTexture(handle: Long): LongArray?

    @JvmStatic
    external fun waitSyncFd(fenceFd: Int): Boolean

    @JvmStatic
    external fun releaseImportedTexture(eglImageHandle: Long, texId: Int)

    @JvmStatic
    external fun closeFd(fenceFd: Int)

    @JvmStatic
    external fun acquire(buffer: HardwareBuffer): Long

    @JvmStatic
    external fun release(handle: Long)

    @JvmStatic
    external fun describe(handle: Long): IntArray?
}
