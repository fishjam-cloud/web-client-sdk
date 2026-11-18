package io.fishjam.client

import android.app.PictureInPictureParams
import android.content.Intent
import android.os.Build
import android.util.Log
import android.util.Rational
import android.view.View
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.annotation.RequiresApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.sp
import androidx.core.app.PictureInPictureModeChangedInfo
import androidx.core.util.Consumer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import org.webrtc.VideoTrack

data class PipOptions(
    val enabled: Boolean = true,
    /** Enter PiP when the app goes to the background. Android 12 (API 31) and above. */
    val startAutomatically: Boolean = true,
    /** Kept for parity with iOS. Android always ends PiP when the user returns to the app. */
    val stopAutomatically: Boolean = true,
    /** Kept for parity with iOS. Android keeps the camera running while the foreground service runs. */
    val allowsCameraInBackground: Boolean = false,
    val placeholderText: String = "No video",
    /** The tiles of the PiP window, left to right. */
    val tiles: List<PipTile> = listOf(PipTile.LocalCamera, PipTile.ActiveSpeaker)
)

/** What a [PipTile] can choose its video from. */
data class PipContext(
    val room: RoomState,
    val voiceActivity: Map<String, Boolean>,
    /** The remote peer speaking now, else the last speaker, else the first remote peer with camera video. */
    val activeSpeaker: PeerWithTracks?
)

/** One tile of the PiP window. [track] picks its video, and `null` shows the placeholder text. */
class PipTile(val mirror: Boolean = false, val track: (PipContext) -> VideoTrack?) {
    companion object {
        val LocalCamera = PipTile(mirror = true) { it.room.localPeer?.cameraTrack?.videoTrack }
        val LocalScreenShare = PipTile { it.room.localPeer?.screenShareVideoTrack?.videoTrack }
        val ActiveSpeaker = PipTile { it.activeSpeaker?.cameraTrack?.videoTrack }
        val ActiveSpeakerScreenShare = PipTile { it.activeSpeaker?.screenShareVideoTrack?.videoTrack }

        fun peerCamera(peerId: String) =
            PipTile { context -> context.room.remotePeers.firstOrNull { it.id == peerId }?.cameraTrack?.videoTrack }
    }
}

/**
 * The remote peer shown on the right of the PiP window: the one speaking now, else the last
 * speaker still in the room, else the first remote peer with camera video.
 */
internal fun pickActiveSpeaker(
    remotePeers: List<PeerWithTracks>,
    voiceActivity: Map<String, Boolean>,
    lastSpeakerId: String?
): PeerWithTracks? {
    remotePeers.firstOrNull { voiceActivity[it.id] == true }?.let { return it }
    lastSpeakerId?.let { id -> remotePeers.firstOrNull { it.id == id }?.let { return it } }
    return remotePeers.firstOrNull { it.cameraTrack?.videoTrack != null }
}

/**
 * Picture in Picture for calls. By default the PiP window shows the local camera on the left and the
 * active speaker on the right. Change that with [PipOptions.tiles]. The app looks the same until PiP starts.
 * The activity must declare `android:supportsPictureInPicture="true"`, and
 * `android:configChanges="screenSize|smallestScreenSize|screenLayout|orientation"` so entering PiP
 * does not recreate it. PiP needs Android 8 (API 26).
 * Create and close it on the main thread.
 */
class PictureInPictureController(
    private val activity: ComponentActivity,
    client: FishjamClient,
    val options: PipOptions = PipOptions()
) : AutoCloseable {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val _isActive = MutableStateFlow(false)
    val isActive: StateFlow<Boolean> = _isActive.asStateFlow()

    private var lastSpeakerId: String? = null
    internal val tracks: StateFlow<List<VideoTrack?>> =
        combine(client.roomState, client.voiceActivity, ::tracksOf)
            .stateIn(scope, SharingStarted.Eagerly, options.tiles.map { null })

    private var overlay: ComposeView? = null
    private val hiddenViews = mutableListOf<Pair<View, Int>>()
    private var closed = false

    private val modeListener =
        Consumer<PictureInPictureModeChangedInfo> { info ->
            if (info.isInPictureInPictureMode) onEnter() else onExit()
        }

    init {
        activity.addOnPictureInPictureModeChangedListener(modeListener)
        applyParams(autoEnter = options.enabled && options.startAutomatically)
    }

    fun startPIP() {
        if (closed || !options.enabled || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        try {
            activity.enterPictureInPictureMode(params(autoEnter = options.startAutomatically))
        } catch (error: IllegalStateException) {
            Log.e(TAG, "Failed to enter Picture in Picture", error)
        }
    }

    /** Android has no call to leave PiP, so this brings the activity back to full screen. */
    fun stopPIP() {
        if (!_isActive.value) return
        activity.startActivity(
            Intent(activity, activity.javaClass).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        )
    }

    override fun close() {
        if (closed) return
        closed = true
        applyParams(autoEnter = false)
        activity.removeOnPictureInPictureModeChangedListener(modeListener)
        onExit()
        scope.cancel()
    }

    private fun tracksOf(room: RoomState, speaking: Map<String, Boolean>): List<VideoTrack?> {
        val speaker = pickActiveSpeaker(room.remotePeers, speaking, lastSpeakerId)
        if (speaker != null && speaking[speaker.id] == true) lastSpeakerId = speaker.id
        val context = PipContext(room, speaking, speaker)
        return options.tiles.map { it.track(context) }
    }

    @RequiresApi(Build.VERSION_CODES.O)
    private fun params(autoEnter: Boolean): PictureInPictureParams {
        val builder = PictureInPictureParams.Builder().setAspectRatio(Rational(16, 9))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) builder.setAutoEnterEnabled(autoEnter)
        return builder.build()
    }

    private fun applyParams(autoEnter: Boolean) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        try {
            activity.setPictureInPictureParams(params(autoEnter))
        } catch (error: IllegalStateException) {
            Log.e(TAG, "Failed to set Picture in Picture params", error)
        }
    }

    private fun onEnter() {
        _isActive.value = true
        if (overlay != null) return
        val root = activity.findViewById<ViewGroup>(android.R.id.content) ?: return
        for (index in 0 until root.childCount) {
            val child = root.getChildAt(index)
            hiddenViews += child to child.visibility
            child.visibility = View.GONE
        }
        val view = ComposeView(activity).apply { setContent { PictureInPictureSplit(this@PictureInPictureController) } }
        val fill = ViewGroup.LayoutParams.MATCH_PARENT
        root.addView(view, ViewGroup.LayoutParams(fill, fill))
        overlay = view
    }

    private fun onExit() {
        _isActive.value = false
        overlay?.let { view -> (view.parent as? ViewGroup)?.removeView(view) }
        overlay = null
        hiddenViews.forEach { (view, visibility) -> view.visibility = visibility }
        hiddenViews.clear()
    }

    private companion object {
        const val TAG = "FishjamPictureInPicture"
    }
}

@Composable
private fun PictureInPictureSplit(controller: PictureInPictureController) {
    val tracks by controller.tracks.collectAsState()
    Row(Modifier.fillMaxSize().background(Color.Black)) {
        controller.options.tiles.forEachIndexed { index, tile ->
            PipTileView(
                tracks.getOrNull(index),
                tile.mirror,
                controller.options.placeholderText,
                Modifier.weight(1f).fillMaxHeight()
            )
        }
    }
}

@Composable
private fun PipTileView(track: VideoTrack?, mirror: Boolean, placeholder: String, modifier: Modifier) {
    Box(modifier, contentAlignment = Alignment.Center) {
        if (track != null) {
            VideoView(track = track, modifier = Modifier.fillMaxSize(), mirror = mirror)
        } else {
            BasicText(placeholder, style = TextStyle(color = Color.White, fontSize = 12.sp))
        }
    }
}
