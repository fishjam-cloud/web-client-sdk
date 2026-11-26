package io.fishjam.client

import android.os.Build

/** 0, 90, 180, or 270. Any other value becomes 0. */
internal fun customVideoRotation(degrees: Int): Int = when (degrees) {
    0, 90, 180, 270 -> degrees
    else -> 0
}

internal fun requireCustomVideoPoolSize(width: Int, height: Int, poolSize: Int) {
    require(width > 0 && height > 0 && poolSize > 0) {
        "width, height and poolSize must all be positive"
    }
}

internal fun requireCustomVideoApi() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        throw UnsupportedOperationException("Custom video tracks require Android 8 (API 26) or newer")
    }
}

/**
 * One pool attaches to one live track.
 * [dispose] throws while that track has not stopped.
 */
internal class CustomVideoPoolGate {
    private var disposed = false
    private var liveTrack = false

    fun attach() {
        check(!disposed) { "This pool is disposed" }
        check(!liveTrack) { "This pool is already attached to a track" }
        liveTrack = true
    }

    fun trackStopped() {
        liveTrack = false
    }

    /** Returns false when the pool was already disposed. */
    fun dispose(): Boolean {
        if (disposed) return false
        check(!liveTrack) { "Stop the track that uses this pool before disposing it" }
        disposed = true
        return true
    }
}
