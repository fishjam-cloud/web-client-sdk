package io.fishjam.client

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.webrtc.MediaStreamTrack
import org.webrtc.VideoTrack
import uniffi.fishjam_core.CoreTrackKind
import uniffi.fishjam_core.CoreTrackType

/** What [CustomSourceController] needs from [FishjamClient]. */
internal interface CustomSourceHost {
    val peerStatus: StateFlow<PeerStatus>

    fun isOpen(): Boolean

    fun isAudioOnly(): Boolean

    fun captureGeneration(): Int

    suspend fun publish(kind: CoreTrackKind, type: CoreTrackType): String

    fun removePublishedTrack(trackId: String)

    fun localTrackAdded(trackId: String, type: CoreTrackType)

    fun localTrackRemoved(trackId: String)

    fun bind(trackId: String, track: MediaStreamTrack, generation: Int)
}

/**
 * One custom video track per source id.
 * [set] calls run one at a time. A track set before the peer is connected is published on connect,
 * and published again after the connection drops and comes back.
 * Setting null unpublishes the track and does not stop it.
 */
internal class CustomSourceController(
    private val scope: CoroutineScope,
    private val host: CustomSourceHost
) {
    private val mutex = Mutex()
    private val sources = LinkedHashMap<String, Source>()

    fun track(sourceId: String): VideoTrack? = sources[sourceId]?.track

    suspend fun set(sourceId: String, track: VideoTrack?) = mutex.withLock {
        if (!host.isOpen()) return
        val existing = sources[sourceId]
        if (track == null) {
            if (existing == null) return
            retire(existing)
            sources.remove(sourceId)
            return
        }
        if (existing?.track === track) return
        if (host.peerStatus.value == PeerStatus.Connected && host.isAudioOnly()) throw TrackTypeError()
        if (existing != null) retire(existing)
        val source = Source(track, host.captureGeneration())
        sources[sourceId] = source
        source.job = launchPublish(sourceId, source)
    }

    fun close() {
        sources.values.forEach { source ->
            source.epoch += 1
            source.job?.cancel()
        }
        sources.clear()
    }

    private fun launchPublish(sourceId: String, source: Source): Job {
        val epoch = source.epoch
        val generation = source.generation
        return scope.launch {
            publishWhileCurrent(
                host = PublishHost(host),
                trackIds = source.trackIds,
                track = source.track,
                kind = CoreTrackKind.VIDEO,
                type = CoreTrackType.CUSTOM_VIDEO,
                generation = generation,
                isCurrent = {
                    host.isOpen() && sources[sourceId] === source && source.epoch == epoch
                }
            )
        }
    }

    private fun retire(source: Source) {
        source.epoch += 1
        source.job?.cancel()
        source.job = null
        source.trackIds.take().forEach { trackId ->
            host.removePublishedTrack(trackId)
            host.localTrackRemoved(trackId)
        }
    }

    private class Source(
        val track: VideoTrack,
        var generation: Int,
        var epoch: Int = 0,
        var job: Job? = null,
        val trackIds: PublishedTrackIds = PublishedTrackIds()
    )

    private class PublishHost(private val host: CustomSourceHost) : DeviceHost {
        override val appContext: Context get() = throw UnsupportedOperationException()
        override val session: MediaSession get() = throw UnsupportedOperationException()
        override val peerStatus: StateFlow<PeerStatus> get() = host.peerStatus

        override fun captureGeneration(): Int = host.captureGeneration()

        override fun isOpen(): Boolean = host.isOpen()

        override fun isAudioOnly(): Boolean = host.isAudioOnly()

        override suspend fun publish(kind: CoreTrackKind, type: CoreTrackType): String = host.publish(kind, type)

        override fun removePublishedTrack(trackId: String) = host.removePublishedTrack(trackId)

        override fun bindPublishedTrack(trackId: String, track: MediaStreamTrack, generation: Int) {
            host.bind(trackId, track, generation)
        }

        override fun setLocalCamera(track: VideoTrack?) = Unit

        override fun localTrackAdded(trackId: String, type: CoreTrackType) = host.localTrackAdded(trackId, type)

        override fun localTrackRemoved(trackId: String) = host.localTrackRemoved(trackId)

        override fun localTracksReplaced(type: CoreTrackType) = Unit
    }
}
