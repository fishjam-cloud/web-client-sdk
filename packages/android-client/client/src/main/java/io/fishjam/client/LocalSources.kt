package io.fishjam.client

import java.util.UUID
import org.webrtc.MediaStreamTrack
import uniffi.fishjam_core.CoreTrackKind
import uniffi.fishjam_core.CoreTrackType

/** What [LocalSources] asks of the core. */
internal interface LocalSourceCore {
    fun setLocalSource(sourceId: String, mediaId: String, kind: CoreTrackKind, type: CoreTrackType)

    fun removeLocalSource(sourceId: String)
}

/** What [LocalSources] reports to: the WebRTC session and the app's events. */
internal interface LocalSourceSink {
    /** Gives the media for [trackId] to the session, so it can go on that track's sender. */
    fun bind(trackId: String, track: MediaStreamTrack, generation: Int)

    /** Puts [track] on the sender of [trackId]. The track id does not change. */
    fun replace(trackId: String, track: MediaStreamTrack)

    fun localTrackAdded(trackId: String, type: CoreTrackType)

    fun localTrackRemoved(trackId: String)

    fun localTrackReplaced(trackId: String)
}

/**
 * Keeps the WebRTC media for each source. The platform chooses a media id for each [set] and the core
 * echoes it in its events. The core handles events in order, so a media id that is older than the
 * event's own media id for the same source can no longer be published, and is dropped.
 */
internal class LocalSources(
    private val core: LocalSourceCore,
    private val sink: LocalSourceSink
) {
    private val lock = Any()
    private val media = LinkedHashMap<String, Media>()

    /** Publishes [track] as [sourceId]. The core publishes it now when connected, otherwise on connect. */
    fun set(sourceId: String, track: MediaStreamTrack, kind: CoreTrackKind, type: CoreTrackType, generation: Int) {
        val mediaId = UUID.randomUUID().toString()
        synchronized(lock) { media[mediaId] = Media(sourceId, track, generation, type) }
        try {
            core.setLocalSource(sourceId, mediaId, kind, type)
        } catch (error: Throwable) {
            synchronized(lock) { media.remove(mediaId) }
            throw error
        }
    }

    /** Stops publishing [sourceId] and forgets its media. Its track is not stopped. */
    fun remove(sourceId: String) {
        synchronized(lock) { media.values.removeAll { it.sourceId == sourceId } }
        core.removeLocalSource(sourceId)
    }

    fun published(mediaId: String, trackId: String) {
        val entry = take(mediaId) ?: return
        sink.localTrackAdded(trackId, entry.type)
        sink.bind(trackId, entry.track, entry.generation)
    }

    fun replaced(mediaId: String, trackId: String) {
        val entry = take(mediaId) ?: return
        sink.replace(trackId, entry.track)
        sink.localTrackReplaced(trackId)
    }

    fun unpublished(trackId: String) {
        sink.localTrackRemoved(trackId)
    }

    /** A rejected source keeps its media, so a later publish can use it. */
    fun rejected(mediaId: String) = Unit

    /** Returns the media for [mediaId] and drops the older media of the same source. Null when unknown. */
    private fun take(mediaId: String): Media? = synchronized(lock) {
        val entry = media[mediaId] ?: return null
        val iterator = media.entries.iterator()
        while (iterator.hasNext()) {
            val current = iterator.next()
            if (current.key == mediaId) break
            if (current.value.sourceId == entry.sourceId) iterator.remove()
        }
        entry
    }

    private class Media(
        val sourceId: String,
        val track: MediaStreamTrack,
        val generation: Int,
        val type: CoreTrackType
    )
}
