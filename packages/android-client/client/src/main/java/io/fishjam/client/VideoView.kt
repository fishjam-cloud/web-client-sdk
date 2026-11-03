package io.fishjam.client

import android.graphics.Color
import android.widget.FrameLayout
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack

enum class ObjectFit { Contain, Cover }

internal data class VideoDisplayRect(val left: Int, val top: Int, val right: Int, val bottom: Int)

internal fun videoDisplayRect(
    viewWidth: Int,
    viewHeight: Int,
    frameWidth: Int,
    frameHeight: Int,
    frameRotation: Int,
    objectFit: ObjectFit
): VideoDisplayRect {
    if (viewWidth == 0 || viewHeight == 0) {
        return VideoDisplayRect(0, 0, 0, 0)
    }
    if (objectFit == ObjectFit.Cover || frameWidth == 0 || frameHeight == 0) {
        return VideoDisplayRect(0, 0, viewWidth, viewHeight)
    }
    val rotated = frameRotation % 180 != 0
    val frameWide = if (rotated) frameHeight else frameWidth
    val frameTall = if (rotated) frameWidth else frameHeight
    val frameAspect = frameWide.toFloat() / frameTall
    val viewAspect = viewWidth.toFloat() / viewHeight
    val width: Int
    val height: Int
    if (frameAspect > viewAspect) {
        width = viewWidth
        height = (viewWidth.toLong() * frameTall / frameWide).toInt()
    } else {
        height = viewHeight
        width = (viewHeight.toLong() * frameWide / frameTall).toInt()
    }
    val left = (viewWidth - width) / 2
    val top = (viewHeight - height) / 2
    return VideoDisplayRect(left, top, left + width, top + height)
}

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
            view.setObjectFit(objectFit)
            view.setTrack(track)
        },
        onRelease = { view -> view.releaseView() }
    )
}

private class FishjamVideoView(context: android.content.Context) :
    FrameLayout(context),
    RendererCommon.RendererEvents {
    private val renderer = SurfaceViewRenderer(context)
    private var current: VideoTrack? = null
    private var objectFit = ObjectFit.Cover
    private var frameWidth = 0
    private var frameHeight = 0
    private var frameRotation = 0

    init {
        setBackgroundColor(Color.BLACK)
        renderer.init(SharedEgl.base.eglBaseContext, this)
        renderer.setEnableHardwareScaler(true)
        renderer.setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
        addView(renderer)
    }

    fun setMirror(mirror: Boolean) {
        renderer.setMirror(mirror)
    }

    fun setObjectFit(objectFit: ObjectFit) {
        this.objectFit = objectFit
        requestLayout()
    }

    fun setTrack(track: VideoTrack) {
        if (current === track) return
        removeSinkQuietly(current)
        current = track
        try {
            track.addSink(renderer)
        } catch (error: IllegalStateException) {
            current = null
        }
    }

    fun releaseView() {
        removeSinkQuietly(current)
        current = null
        renderer.release()
    }

    private fun removeSinkQuietly(track: VideoTrack?) {
        if (track == null) return
        try {
            track.removeSink(renderer)
        } catch (error: IllegalStateException) {
            Unit
        }
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        val rect =
            videoDisplayRect(
                right - left,
                bottom - top,
                frameWidth,
                frameHeight,
                frameRotation,
                objectFit
            )
        renderer.layout(rect.left, rect.top, rect.right, rect.bottom)
    }

    override fun onFirstFrameRendered() = Unit

    override fun onFrameResolutionChanged(videoWidth: Int, videoHeight: Int, rotation: Int) {
        post {
            frameWidth = videoWidth
            frameHeight = videoHeight
            frameRotation = rotation
            requestLayout()
        }
    }
}
