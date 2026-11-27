package io.fishjam.client

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import org.webrtc.MediaStreamTrack
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
    fun displayNameComesFromPeerMetadata() {
        val metadata = Metadata(peer = JsonObject(mapOf("displayName" to JsonPrimitive("Ada"))))
        assertEquals("Ada", customSourceDisplayName(metadata))
        assertNull(customSourceDisplayName(Metadata(peer = JsonPrimitive("Ada"))))
        assertNull(customSourceDisplayName(null))
    }

    @Test
    fun settingTheSameTrackTwiceDoesNothing() = runTest(UnconfinedTestDispatcher()) {
        val host = FakeCustomSourceHost(PeerStatus.Connected)
        val controller = CustomSourceController(this, host)
        val track = VideoTrack(1)
        controller.set("video", track)
        controller.set("video", track)
        assertEquals(listOf("custom-0"), host.published)
        controller.close()
    }

    @Test
    fun settingNullUnpublishes() = runTest(UnconfinedTestDispatcher()) {
        val host = FakeCustomSourceHost(PeerStatus.Connected)
        val controller = CustomSourceController(this, host)
        val track = VideoTrack(1)
        controller.set("video", track)
        controller.set("video", null)
        assertEquals(listOf("custom-0"), host.removed)
        assertNull(controller.track("video"))
        controller.close()
    }

    @Test
    fun republishesAfterTheConnectionDrops() = runTest(UnconfinedTestDispatcher()) {
        val host = FakeCustomSourceHost(PeerStatus.Connected)
        val controller = CustomSourceController(this, host)
        controller.set("video", VideoTrack(1))
        host.status.value = PeerStatus.Connecting
        host.status.value = PeerStatus.Connected
        assertEquals(listOf("custom-0", "custom-1"), host.published)
        controller.close()
    }
}

private class FakeCustomSourceHost(initial: PeerStatus) : CustomSourceHost {
    val status = MutableStateFlow(initial)
    val published = mutableListOf<String>()
    val removed = mutableListOf<String>()
    private var nextId = 0

    override val peerStatus: StateFlow<PeerStatus> = status

    override fun isOpen(): Boolean = true

    override fun isAudioOnly(): Boolean = false

    override fun captureGeneration(): Int = 1

    override suspend fun publish(kind: CoreTrackKind, type: CoreTrackType): String {
        val id = "custom-${nextId++}"
        published += id
        return id
    }

    override fun removePublishedTrack(trackId: String) {
        removed += trackId
    }

    override fun localTrackAdded(trackId: String, type: CoreTrackType) = Unit

    override fun localTrackRemoved(trackId: String) = Unit

    override fun bind(trackId: String, track: MediaStreamTrack, generation: Int) = Unit
}
