package io.fishjam.client

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.webrtc.MediaStreamTrack
import org.webrtc.VideoTrack
import uniffi.fishjam_core.CoreTrackKind
import uniffi.fishjam_core.CoreTrackType

class LocalSourcesTest {
    @Test
    fun setSendsAMediaIdToTheCore() {
        val core = FakeLocalSourceCore()
        val sources = LocalSources(core, FakeLocalSourceSink())
        sources.set("builtin.camera", VideoTrack(1), CoreTrackKind.VIDEO, CoreTrackType.CAMERA, 1)
        val call = core.set.single()
        assertEquals("builtin.camera", call.sourceId)
        assertEquals(CoreTrackKind.VIDEO, call.kind)
        assertEquals(CoreTrackType.CAMERA, call.type)
        assertTrue(call.mediaId.isNotEmpty())
    }

    @Test
    fun publishedBindsTheTrackOfThatMedia() {
        val core = FakeLocalSourceCore()
        val sink = FakeLocalSourceSink()
        val sources = LocalSources(core, sink)
        val track = VideoTrack(1)
        sources.set("builtin.camera", track, CoreTrackKind.VIDEO, CoreTrackType.CAMERA, 7)
        sources.published(core.set.single().mediaId, "t1")
        assertEquals(listOf("t1" to CoreTrackType.CAMERA), sink.added)
        assertSame(track, sink.binds.single().second)
        assertEquals("t1", sink.binds.single().first)
    }

    @Test
    fun publishedAgainAfterARejoinStillBinds() {
        val core = FakeLocalSourceCore()
        val sink = FakeLocalSourceSink()
        val sources = LocalSources(core, sink)
        sources.set("builtin.microphone", VideoTrack(1), CoreTrackKind.AUDIO, CoreTrackType.MICROPHONE, 1)
        val mediaId = core.set.single().mediaId
        sources.published(mediaId, "t1")
        sources.unpublished("t1")
        sources.published(mediaId, "t2")
        assertEquals(listOf("t1", "t2"), sink.binds.map { it.first })
    }

    @Test
    fun replacedPutsTheNewTrackOnTheSameTrackId() {
        val core = FakeLocalSourceCore()
        val sink = FakeLocalSourceSink()
        val sources = LocalSources(core, sink)
        sources.set("video", VideoTrack(1), CoreTrackKind.VIDEO, CoreTrackType.CUSTOM_VIDEO, 1)
        val second = VideoTrack(2)
        sources.set("video", second, CoreTrackKind.VIDEO, CoreTrackType.CUSTOM_VIDEO, 1)
        sources.replaced(core.set.last().mediaId, "t1")
        assertEquals("t1", sink.replacedMedia.single().first)
        assertSame(second, sink.replacedMedia.single().second)
        assertEquals(listOf("t1"), sink.replaced)
        assertEquals(emptyList<String>(), sink.binds.map { it.first })
    }

    @Test
    fun aNewerMediaDropsTheOlderMediaOfTheSameSource() {
        val core = FakeLocalSourceCore()
        val sink = FakeLocalSourceSink()
        val sources = LocalSources(core, sink)
        sources.set("video", VideoTrack(1), CoreTrackKind.VIDEO, CoreTrackType.CUSTOM_VIDEO, 1)
        val older = core.set.first().mediaId
        sources.set("video", VideoTrack(2), CoreTrackKind.VIDEO, CoreTrackType.CUSTOM_VIDEO, 1)
        val newer = core.set.last().mediaId
        sources.published(newer, "t2")
        sources.published(older, "t1")
        assertEquals(listOf("t2"), sink.binds.map { it.first })
    }

    @Test
    fun unpublishedReportsTheTrackRemoved() {
        val sink = FakeLocalSourceSink()
        LocalSources(FakeLocalSourceCore(), sink).unpublished("t1")
        assertEquals(listOf("t1"), sink.removed)
    }

    @Test
    fun aRejectedSourceKeepsItsMediaForALaterPublish() {
        val core = FakeLocalSourceCore()
        val sink = FakeLocalSourceSink()
        val sources = LocalSources(core, sink)
        sources.set("builtin.screenShare", VideoTrack(1), CoreTrackKind.VIDEO, CoreTrackType.SCREEN_SHARE_VIDEO, 1)
        val mediaId = core.set.single().mediaId
        sources.rejected(mediaId)
        sources.published(mediaId, "t1")
        assertEquals(listOf("t1"), sink.binds.map { it.first })
    }

    @Test
    fun removeDropsTheMediaAndTellsTheCore() {
        val core = FakeLocalSourceCore()
        val sink = FakeLocalSourceSink()
        val sources = LocalSources(core, sink)
        sources.set("video", VideoTrack(1), CoreTrackKind.VIDEO, CoreTrackType.CUSTOM_VIDEO, 1)
        val mediaId = core.set.single().mediaId
        sources.remove("video")
        assertEquals(listOf("video"), core.removed)
        sources.published(mediaId, "t1")
        assertEquals(emptyList<String>(), sink.binds.map { it.first })
    }

    @Test
    fun muteTellsTheCoreAndTakesTheMediaOffTheSender() {
        val core = FakeLocalSourceCore()
        val sink = FakeLocalSourceSink()
        val sources = LocalSources(core, sink)
        sources.set("builtin.camera", VideoTrack(1), CoreTrackKind.VIDEO, CoreTrackType.CAMERA, 1)
        sources.published(core.set.single().mediaId, "t1")

        sources.mute("builtin.camera")
        assertEquals(listOf("builtin.camera"), core.muted)

        sources.muted("t1")
        assertEquals(listOf("t1"), sink.senderMuted)
        assertEquals(listOf("t1"), sink.mutedEvents)
        assertEquals("the track is kept", emptyList<String>(), sink.removed)
    }

    @Test
    fun aReplaceAfterMuteUnmutesTheSameTrack() {
        val core = FakeLocalSourceCore()
        val sink = FakeLocalSourceSink()
        val sources = LocalSources(core, sink)
        sources.set("builtin.microphone", VideoTrack(1), CoreTrackKind.AUDIO, CoreTrackType.MICROPHONE, 1)
        sources.published(core.set.single().mediaId, "t1")
        sources.muted("t1")

        val second = VideoTrack(2)
        sources.set("builtin.microphone", second, CoreTrackKind.AUDIO, CoreTrackType.MICROPHONE, 2)
        sources.replaced(core.set.last().mediaId, "t1")

        assertSame(second, sink.replacedMedia.single().second)
        assertEquals(listOf("t1"), sink.unmutedEvents)
        assertEquals("an unmute is not a switch", emptyList<String>(), sink.replaced)
    }

    @Test
    fun aReplaceOfALiveTrackIsNotAnUnmute() {
        val core = FakeLocalSourceCore()
        val sink = FakeLocalSourceSink()
        val sources = LocalSources(core, sink)
        sources.set("builtin.camera", VideoTrack(1), CoreTrackKind.VIDEO, CoreTrackType.CAMERA, 1)
        sources.published(core.set.single().mediaId, "t1")

        sources.set("builtin.camera", VideoTrack(2), CoreTrackKind.VIDEO, CoreTrackType.CAMERA, 1)
        sources.replaced(core.set.last().mediaId, "t1")

        assertEquals(listOf("t1"), sink.replaced)
        assertEquals(emptyList<String>(), sink.unmutedEvents)
    }

    @Test
    fun aFailedSetDropsItsMedia() {
        val core = FakeLocalSourceCore()
        core.failure = IllegalStateException("core is closed")
        val sink = FakeLocalSourceSink()
        val sources = LocalSources(core, sink)
        try {
            sources.set("video", VideoTrack(1), CoreTrackKind.VIDEO, CoreTrackType.CUSTOM_VIDEO, 1)
            fail("The core error must reach the caller")
        } catch (_: IllegalStateException) {
            // Expected.
        }
        sources.published(core.failedMediaId!!, "t1")
        assertEquals(emptyList<String>(), sink.binds.map { it.first })
    }
}

internal class FakeLocalSourceCore : LocalSourceCore {
    data class SetCall(
        val sourceId: String,
        val mediaId: String,
        val kind: CoreTrackKind,
        val type: CoreTrackType
    )

    val set = mutableListOf<SetCall>()
    val muted = mutableListOf<String>()
    val removed = mutableListOf<String>()
    var failure: Throwable? = null
    var failedMediaId: String? = null

    override fun setLocalSource(sourceId: String, mediaId: String, kind: CoreTrackKind, type: CoreTrackType) {
        failure?.let { error ->
            failedMediaId = mediaId
            throw error
        }
        set += SetCall(sourceId, mediaId, kind, type)
    }

    override fun muteLocalSource(sourceId: String) {
        muted += sourceId
    }

    override fun removeLocalSource(sourceId: String) {
        removed += sourceId
    }
}

internal class FakeLocalSourceSink : LocalSourceSink {
    val added = mutableListOf<Pair<String, CoreTrackType>>()
    val removed = mutableListOf<String>()
    val replaced = mutableListOf<String>()
    val binds = mutableListOf<Pair<String, MediaStreamTrack>>()
    val replacedMedia = mutableListOf<Pair<String, MediaStreamTrack>>()
    val senderMuted = mutableListOf<String>()
    val mutedEvents = mutableListOf<String>()
    val unmutedEvents = mutableListOf<String>()

    override fun bind(trackId: String, track: MediaStreamTrack, generation: Int) {
        binds += trackId to track
    }

    override fun replace(trackId: String, track: MediaStreamTrack) {
        replacedMedia += trackId to track
    }

    override fun mute(trackId: String) {
        senderMuted += trackId
    }

    override fun localTrackMuted(trackId: String) {
        mutedEvents += trackId
    }

    override fun localTrackUnmuted(trackId: String) {
        unmutedEvents += trackId
    }

    override fun localTrackAdded(trackId: String, type: CoreTrackType) {
        added += trackId to type
    }

    override fun localTrackRemoved(trackId: String) {
        removed += trackId
    }

    override fun localTrackReplaced(trackId: String) {
        replaced += trackId
    }
}
