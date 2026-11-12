package io.fishjam.client

import android.content.Context
import fishjam.sdk.SdkApi
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import org.webrtc.MediaStreamTrack
import org.webrtc.VideoTrack

/** What [CameraController] and [MicrophoneController] need from [FishjamClient]. */
internal interface DeviceHost {
    val appContext: Context
    val session: MediaSession
    val peerStatus: StateFlow<PeerStatus>

    fun captureGeneration(): Int
    fun isOpen(): Boolean
    fun isAudioOnly(): Boolean

    suspend fun publish(kind: SdkApi.TrackKind, type: SdkApi.TrackType): String
    fun removePublishedTrack(trackId: String)

    /** Shows or hides the local camera preview in the room state. */
    fun setLocalCamera(track: VideoTrack?)

    /** Report local track changes to [FishjamClient.events]. */
    fun localTrackAdded(trackId: String, type: SdkApi.TrackType)

    fun localTrackRemoved(trackId: String)

    fun localTracksReplaced(type: SdkApi.TrackType)
}

/** Track ids that this device published and has not removed yet. */
internal class PublishedTrackIds {
    private val lock = Any()
    private val ids = mutableListOf<String>()

    fun add(trackId: String) {
        synchronized(lock) { ids.add(trackId) }
    }

    fun drop(trackId: String): Boolean = synchronized(lock) { ids.remove(trackId) }

    fun take(): List<String> = synchronized(lock) {
        val copy = ids.toList()
        ids.clear()
        copy
    }

    fun clear() {
        synchronized(lock) { ids.clear() }
    }
}

/**
 * Publishes the device track while the peer is connected, and republishes it after a reconnect.
 * [isCurrent] is false once this device was stopped or the capture generation changed.
 */
internal suspend fun publishWhileCurrent(
    host: DeviceHost,
    trackIds: PublishedTrackIds,
    track: MediaStreamTrack,
    kind: SdkApi.TrackKind,
    type: SdkApi.TrackType,
    generation: Int,
    isCurrent: () -> Boolean
) {
    while (isCurrent()) {
        host.peerStatus.first { status -> status == PeerStatus.Connected }
        if (!isCurrent()) return
        val trackId =
            try {
                host.publish(kind, type)
            } catch (_: TrackTypeError) {
                return
            }
        if (!isCurrent()) {
            host.removePublishedTrack(trackId)
            return
        }
        trackIds.add(trackId)
        if (!isCurrent()) {
            if (trackIds.drop(trackId)) host.removePublishedTrack(trackId)
            return
        }
        host.localTrackAdded(trackId, type)
        host.session.bind(trackId, track, generation)
        host.peerStatus.first { status -> status != PeerStatus.Connected }
        // Still current: the connection ended for good, and the core dropped the track.
        // When the device was stopped, the stopper reports the removal.
        if (isCurrent()) host.localTrackRemoved(trackId)
    }
}
