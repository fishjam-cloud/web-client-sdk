package io.fishjam.client

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.webrtc.VideoTrack
import uniffi.fishjam_core.CoreTrackKind
import uniffi.fishjam_core.CoreTrackType

/**
 * One custom video track per source id. The core publishes it, republishes it after a reconnect, and
 * replaces it on the same track id. This class keeps the track for each source id.
 * Setting null unpublishes the track and does not stop it.
 */
internal class CustomSourceController(
    private val sources: LocalSources,
    private val isOpen: () -> Boolean,
    private val captureGeneration: () -> Int
) {
    private val mutex = Mutex()
    private val tracks = LinkedHashMap<String, VideoTrack>()

    fun track(sourceId: String): VideoTrack? = tracks[sourceId]

    suspend fun set(sourceId: String, track: VideoTrack?) = mutex.withLock {
        require(!sourceId.startsWith(BUILT_IN_SOURCE_PREFIX)) {
            "Source ids that start with $BUILT_IN_SOURCE_PREFIX belong to the built-in devices"
        }
        if (!isOpen()) return
        if (track == null) {
            if (tracks.remove(sourceId) == null) return
            sources.remove(sourceId)
            return
        }
        if (tracks[sourceId] === track) return
        sources.set(sourceId, track, CoreTrackKind.VIDEO, CoreTrackType.CUSTOM_VIDEO, captureGeneration())
        tracks[sourceId] = track
    }

    fun close() {
        tracks.clear()
    }
}
