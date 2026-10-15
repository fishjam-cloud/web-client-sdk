package io.fishjam.client

import fishjam.sdk.SdkApi

/** Temporary check that the Kotlin code reaches fishjam-core through JNI. */
object FishjamCore {
    fun add(a: Int, b: Int): Int {
        val handle = NativeCore.nativeCreate(ByteArray(0))
        check(handle != 0L) { "fishjam_client_new returned null" }
        try {
            val request =
                SdkApi.SdkRequest
                    .newBuilder()
                    .setAdd(SdkApi.AddRequest.newBuilder().setA(a).setB(b))
                    .build()
            val result = NativeCore.nativeCall(handle, request.toByteArray())
            val response = SdkApi.SdkResponse.parseFrom(result.payload)
            check(result.code == 0 && response.hasAdd()) { response.error.message }
            return response.add.sum
        } finally {
            NativeCore.nativeDestroy(handle)
        }
    }
}
