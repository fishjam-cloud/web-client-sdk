package io.fishjam.client

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DataChannelsTest {
    private class FakeLink(override val type: DataChannelType) : DataChannelLink {
        val sent = mutableListOf<ByteArray>()
        var closed = false

        override fun send(data: ByteArray): Boolean {
            sent += data
            return true
        }

        override fun close() {
            closed = true
        }
    }

    private val links = mutableListOf<FakeLink>()

    private fun channels() = DataChannels(
        encode = { payload -> byteArrayOf(9) + payload },
        decode = { bytes -> if (bytes.firstOrNull() == 9.toByte()) bytes.drop(1).toByteArray() else null }
    )

    private fun DataChannels.createLinks() = createMissing { type -> FakeLink(type).also { links += it } }

    private fun DataChannels.openBoth() {
        links.forEach { onOpen(it) }
    }

    private fun link(type: DataChannelType) = links.last { it.type == type }

    @Test
    fun startSetsLoadingAndIsIgnoredWhileLoadingOrReady() {
        val channels = channels()

        assertTrue(channels.start())
        assertTrue(channels.loading.value)
        assertFalse(channels.start())

        channels.createLinks()
        channels.openBoth()
        assertFalse(channels.start())
    }

    @Test
    fun channelsAreCreatedOnlyAfterStartAndOnlyOnce() {
        val channels = channels()
        channels.createLinks()
        assertTrue(links.isEmpty())

        channels.start()
        channels.createLinks()
        channels.createLinks()

        assertEquals(listOf(DataChannelType.Reliable, DataChannelType.Lossy), links.map { it.type })
    }

    @Test
    fun readyOnlyWhenBothChannelsOpen() {
        val channels = channels()
        channels.start()
        channels.createLinks()

        channels.onOpen(link(DataChannelType.Reliable))
        assertFalse(channels.ready.value)

        channels.onOpen(link(DataChannelType.Lossy))
        assertTrue(channels.ready.value)
        assertFalse(channels.loading.value)
        assertNull(channels.error.value)
    }

    @Test
    fun channelClosingBeforeOpenIsAnError() {
        val channels = channels()
        channels.start()
        channels.createLinks()

        channels.onClosed(link(DataChannelType.Lossy))

        assertFalse(channels.loading.value)
        assertFalse(channels.ready.value)
        assertEquals("Data channel lossy closed before opening", channels.error.value?.message)
        assertTrue(links.all { it.closed })
        assertTrue(channels.start())
    }

    @Test
    fun publishWrapsPayloadAndPicksTheChannel() {
        val channels = channels()
        channels.start()
        channels.createLinks()
        channels.openBoth()

        channels.publish(byteArrayOf(1, 2), reliable = false)

        assertTrue(link(DataChannelType.Reliable).sent.isEmpty())
        assertArrayEquals(byteArrayOf(9, 1, 2), link(DataChannelType.Lossy).sent.single())
    }

    @Test(expected = IllegalStateException::class)
    fun publishBeforeReadyThrows() {
        channels().publish(byteArrayOf(1), reliable = true)
    }

    @Test
    fun subscriberAddedBeforeSetupGetsDecodedMessagesOfItsChannelOnly() {
        val channels = channels()
        val received = mutableListOf<ByteArray>()
        channels.subscribe(reliable = true) { received += it }
        channels.start()
        channels.createLinks()
        channels.openBoth()

        channels.onMessage(link(DataChannelType.Reliable), byteArrayOf(9, 7))
        channels.onMessage(link(DataChannelType.Lossy), byteArrayOf(9, 8))
        channels.onMessage(link(DataChannelType.Reliable), byteArrayOf(1))

        assertEquals(1, received.size)
        assertArrayEquals(byteArrayOf(7), received.single())
    }

    @Test
    fun unsubscribeStopsDelivery() {
        val channels = channels()
        val received = mutableListOf<ByteArray>()
        channels.start()
        channels.createLinks()
        channels.openBoth()
        val unsubscribe = channels.subscribe(reliable = true) { received += it }

        unsubscribe()
        channels.onMessage(link(DataChannelType.Reliable), byteArrayOf(9, 7))

        assertTrue(received.isEmpty())
    }

    @Test
    fun resetClosesChannelsKeepsSubscribersAndAllowsAnotherStart() {
        val channels = channels()
        val received = mutableListOf<ByteArray>()
        channels.subscribe(reliable = true) { received += it }
        channels.start()
        channels.createLinks()
        channels.openBoth()
        val old = link(DataChannelType.Reliable)

        channels.reset()

        assertFalse(channels.ready.value)
        assertFalse(channels.loading.value)
        assertTrue(links.all { it.closed })
        channels.onOpen(old)
        assertFalse(channels.ready.value)

        assertTrue(channels.start())
        channels.createLinks()
        links.drop(2).forEach { channels.onOpen(it) }
        channels.onMessage(link(DataChannelType.Reliable), byteArrayOf(9, 5))
        assertTrue(channels.ready.value)
        assertArrayEquals(byteArrayOf(5), received.single())
    }

    @Test
    fun closeAfterReadyClearsReady() {
        val channels = channels()
        channels.start()
        channels.createLinks()
        channels.openBoth()

        channels.onClosed(link(DataChannelType.Reliable))

        assertFalse(channels.ready.value)
    }
}
