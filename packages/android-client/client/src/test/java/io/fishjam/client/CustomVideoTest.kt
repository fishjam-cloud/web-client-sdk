package io.fishjam.client

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.fail
import org.junit.Test
import org.webrtc.VideoTrack
import uniffi.fishjam_core.CoreTrackKind
import uniffi.fishjam_core.CoreTrackType

@OptIn(ExperimentalCoroutinesApi::class)
class CustomVideoTest {
    @Test
    fun rotationKeepsOnlyRightAngles() {
        assertEquals(0, customVideoRotation(0))
        assertEquals(90, customVideoRotation(90))
        assertEquals(180, customVideoRotation(180))
        assertEquals(270, customVideoRotation(270))
        assertEquals(0, customVideoRotation(45))
        assertEquals(0, customVideoRotation(-90))
    }

    @Test
    fun poolSizeMustBePositive() {
        assertThrows(IllegalArgumentException::class.java) {
            requireCustomVideoPoolSize(0, 10, 1)
        }
        assertThrows(IllegalArgumentException::class.java) {
            requireCustomVideoPoolSize(10, 0, 1)
        }
        assertThrows(IllegalArgumentException::class.java) {
            requireCustomVideoPoolSize(10, 10, 0)
        }
    }

    @Test
    fun disposingAPoolWhileAttachedThrows() {
        val gate = CustomVideoPoolGate()
        gate.attach()
        assertThrows(IllegalStateException::class.java) { gate.dispose() }
        gate.trackStopped()
        gate.dispose()
        gate.dispose()
    }

    @Test
    fun aPoolAttachesToOneTrack() {
        val gate = CustomVideoPoolGate()
        gate.attach()
        assertThrows(IllegalStateException::class.java) { gate.attach() }
    }

    @Test
    fun settingTheSameTrackTwiceSetsTheSourceOnce() = runTest(UnconfinedTestDispatcher()) {
        val core = FakeLocalSourceCore()
        val controller = CustomSourceController(LocalSources(core, FakeLocalSourceSink()), { true }, { 1 })
        val track = VideoTrack(1)
        controller.set("video", track)
        controller.set("video", track)
        assertEquals(listOf("video"), core.set.map { it.sourceId })
        assertEquals(CoreTrackType.CUSTOM_VIDEO, core.set.single().type)
        assertEquals(CoreTrackKind.VIDEO, core.set.single().kind)
    }

    @Test
    fun settingNullRemovesTheSource() = runTest(UnconfinedTestDispatcher()) {
        val core = FakeLocalSourceCore()
        val controller = CustomSourceController(LocalSources(core, FakeLocalSourceSink()), { true }, { 1 })
        controller.set("video", VideoTrack(1))
        controller.set("video", null)
        assertEquals(listOf("video"), core.removed)
        assertNull(controller.track("video"))
    }

    @Test
    fun settingNullForAnUnknownSourceDoesNothing() = runTest(UnconfinedTestDispatcher()) {
        val core = FakeLocalSourceCore()
        val controller = CustomSourceController(LocalSources(core, FakeLocalSourceSink()), { true }, { 1 })
        controller.set("video", null)
        assertEquals(emptyList<String>(), core.removed)
    }

    @Test
    fun replacingATrackKeepsTheSourceAndSetsTheNewTrack() = runTest(UnconfinedTestDispatcher()) {
        val core = FakeLocalSourceCore()
        val controller = CustomSourceController(LocalSources(core, FakeLocalSourceSink()), { true }, { 1 })
        val first = VideoTrack(1)
        val second = VideoTrack(2)
        controller.set("video", first)
        controller.set("video", second)
        assertEquals(2, core.set.size)
        assertEquals(second, controller.track("video"))
    }

    @Test
    fun builtInSourceIdsAreRejected() = runTest(UnconfinedTestDispatcher()) {
        val core = FakeLocalSourceCore()
        val controller = CustomSourceController(LocalSources(core, FakeLocalSourceSink()), { true }, { 1 })
        try {
            controller.set(CAMERA_SOURCE_ID, VideoTrack(1))
            fail("A built-in source id must be rejected")
        } catch (_: IllegalArgumentException) {
            // Expected.
        }
        assertEquals(emptyList<String>(), core.set.map { it.sourceId })
    }
}
