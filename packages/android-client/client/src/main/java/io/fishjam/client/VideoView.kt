package io.fishjam.client

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack

enum class ObjectFit { Contain, Cover }

@Composable
fun VideoView(
    track: VideoTrack,
    modifier: Modifier = Modifier,
    mirror: Boolean = false,
    objectFit: ObjectFit = ObjectFit.Cover
) {
    AndroidView(
        factory = { context ->
            FishjamVideoView(context)
        },
        modifier = modifier,
        update = { view ->
            view.setMirror(mirror)
            view.setScalingType(
                when (objectFit) {
                    ObjectFit.Contain -> RendererCommon.ScalingType.SCALE_ASPECT_FIT
                    ObjectFit.Cover -> RendererCommon.ScalingType.SCALE_ASPECT_FILL
                }
            )
            view.setTrack(track)
        },
        onRelease = { view -> view.releaseView() }
    )
}

private class FishjamVideoView(context: android.content.Context) : SurfaceViewRenderer(context) {
    private var current: VideoTrack? = null

    init {
        init(SharedEgl.base.eglBaseContext, null)
        setEnableHardwareScaler(true)
    }

    fun setTrack(track: VideoTrack) {
        if (current === track) return
        removeSinkQuietly(current)
        current = track
        try {
            track.addSink(this)
        } catch (error: IllegalStateException) {
            current = null
        }
    }

    fun releaseView() {
        removeSinkQuietly(current)
        current = null
        release()
    }

    private fun removeSinkQuietly(track: VideoTrack?) {
        if (track == null) return
        try {
            track.removeSink(this)
        } catch (error: IllegalStateException) {
            Unit
        }
    }
}
