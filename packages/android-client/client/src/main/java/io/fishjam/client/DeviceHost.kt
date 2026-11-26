package io.fishjam.client

import android.content.Context
import kotlinx.coroutines.flow.StateFlow
import org.webrtc.MediaStreamTrack
import org.webrtc.VideoTrack
import uniffi.fishjam_core.CoreTrackKind
import uniffi.fishjam_core.CoreTrackType

/** Source ids of the built-in devices. Custom source ids may not start with [BUILT_IN_SOURCE_PREFIX]. */
internal const val BUILT_IN_SOURCE_PREFIX = "builtin."
internal const val CAMERA_SOURCE_ID = "builtin.camera"
internal const val MICROPHONE_SOURCE_ID = "builtin.microphone"
internal const val SCREEN_SHARE_SOURCE_ID = "builtin.screenShare"

/** What [CameraController], [MicrophoneController] and [ScreenShareController] need from [FishjamClient]. */
internal interface DeviceHost {
    val appContext: Context
    val session: MediaSession
    val peerStatus: StateFlow<PeerStatus>

    fun captureGeneration(): Int
    fun isOpen(): Boolean
    fun isAudioOnly(): Boolean

    /** Publishes [track] as [sourceId]. The core publishes it when connected, and again after a reconnect. */
    fun setLocalSource(
        sourceId: String,
        track: MediaStreamTrack,
        kind: CoreTrackKind,
        type: CoreTrackType,
        generation: Int
    )

    /** Removes [sourceId] from the room. The device keeps running; the caller stops it. */
    fun removeLocalSource(sourceId: String)

    /** Shows or hides the local camera preview in the room state. */
    fun setLocalCamera(track: VideoTrack?)

    /** Camera switched device, so the published track of [type] stays but its media changed. */
    fun localTracksReplaced(type: CoreTrackType)
}
