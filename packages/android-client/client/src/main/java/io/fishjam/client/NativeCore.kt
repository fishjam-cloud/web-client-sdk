package io.fishjam.client

class NativeCallResult(
    @JvmField val code: Int,
    @JvmField val payload: ByteArray
)

internal fun interface NativeEvents {
    fun onEvent(payload: ByteArray)
}

internal object NativeCore {
    init {
        System.loadLibrary("fishjam_jni")
    }

    @JvmStatic external fun nativeCreate(config: ByteArray, events: NativeEvents): Long

    @JvmStatic external fun nativeCall(handle: Long, request: ByteArray): NativeCallResult

    @JvmStatic external fun nativeDestroy(handle: Long)
}
