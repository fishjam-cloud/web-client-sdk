package io.fishjam.client

import android.util.Log
import java.nio.ByteBuffer
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.webrtc.DataChannel
import org.webrtc.PeerConnection

/** The server accepts only these two labels. */
internal enum class DataChannelType(val label: String, val ordered: Boolean, val maxRetransmits: Int) {
    Reliable("reliable", ordered = true, maxRetransmits = -1),
    Lossy("lossy", ordered = false, maxRetransmits = 0);

    companion object {
        fun of(reliable: Boolean): DataChannelType = if (reliable) Reliable else Lossy
    }
}

internal interface DataChannelLink {
    val type: DataChannelType

    fun send(data: ByteArray): Boolean

    fun close()
}

/**
 * The `reliable` and `lossy` channels of one peer connection, their ready, loading and error state,
 * and the subscribers. Subscribers outlive the channels, so they keep receiving after a reconnect.
 */
internal class DataChannels(
    private val encode: (ByteArray) -> ByteArray,
    private val decode: (ByteArray) -> ByteArray?,
    private val deliver: (() -> Unit) -> Unit = { it() }
) {
    private val _ready = MutableStateFlow(false)
    val ready: StateFlow<Boolean> = _ready.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _error = MutableStateFlow<Throwable?>(null)
    val error: StateFlow<Throwable?> = _error.asStateFlow()

    private val lock = Any()
    private var requested = false
    private val links = HashMap<DataChannelType, DataChannelLink>()
    private val open = HashSet<DataChannelType>()
    private val subscribers =
        DataChannelType.entries.associateWith { CopyOnWriteArrayList<(ByteArray) -> Unit>() }

    /** Returns `false` when the channels are already ready or being set up. */
    fun start(): Boolean = synchronized(lock) {
        if (_ready.value || _loading.value) return false
        requested = true
        _error.value = null
        _loading.value = true
        true
    }

    /**
     * Must run before the offer is created, so the offer carries the channels.
     * WebRTC calls run outside [lock]: they block on the WebRTC thread that also reports channel state.
     */
    fun createMissing(open: (DataChannelType) -> DataChannelLink?) {
        val missing = synchronized(lock) {
            if (!requested) return
            DataChannelType.entries.filter { it !in links }
        }
        missing.forEach { type ->
            val link = open(type)
            if (link == null) {
                fail(IllegalStateException("Data channel ${type.label} could not be created"))
                return
            }
            val kept = synchronized(lock) {
                if (requested && type !in links) {
                    links[type] = link
                    true
                } else {
                    false
                }
            }
            if (!kept) link.close()
        }
    }

    fun onOpen(link: DataChannelLink) = synchronized(lock) {
        if (links[link.type] !== link) return
        open += link.type
        if (open.size == DataChannelType.entries.size) {
            _error.value = null
            _ready.value = true
            _loading.value = false
        }
    }

    fun onClosed(link: DataChannelLink) {
        val closing = synchronized(lock) {
            if (links[link.type] !== link) return
            if (link.type in open) {
                open -= link.type
                links.remove(link.type)
                _ready.value = false
                emptyList()
            } else {
                failLocked(IllegalStateException("Data channel ${link.type.label} closed before opening"))
            }
        }
        closeAll(closing)
    }

    fun onMessage(link: DataChannelLink, bytes: ByteArray) {
        val payload = decode(bytes)
        if (payload == null) {
            Log.w(TAG, "Dropped a data channel message that is not a binary ChannelMessage")
            return
        }
        val targets = subscribers.getValue(link.type).toList()
        if (targets.isEmpty()) return
        deliver { targets.forEach { callback -> callback(payload) } }
    }

    fun fail(error: Throwable) = closeAll(synchronized(lock) { failLocked(error) })

    fun reportError(error: Throwable) {
        _error.value = error
    }

    fun publish(payload: ByteArray, reliable: Boolean) {
        val type = DataChannelType.of(reliable)
        val link =
            synchronized(lock) {
                links[type]?.takeIf { type in open }
            } ?: throw IllegalStateException(
                "Data channel ${type.label} is not open. Call initializeDataChannel() first."
            )
        if (!link.send(encode(payload))) {
            Log.w(TAG, "Data channel ${type.label} send failed")
        }
    }

    fun subscribe(reliable: Boolean, callback: (ByteArray) -> Unit): () -> Unit {
        val list = subscribers.getValue(DataChannelType.of(reliable))
        list += callback
        return { list.remove(callback) }
    }

    /** The peer connection is gone. The app calls `initializeDataChannel` again on the next one. */
    fun reset() {
        val closing = synchronized(lock) {
            requested = false
            _ready.value = false
            _loading.value = false
            takeLinksLocked()
        }
        closeAll(closing)
    }

    private fun failLocked(error: Throwable): List<DataChannelLink> {
        requested = false
        _ready.value = false
        _loading.value = false
        _error.value = error
        return takeLinksLocked()
    }

    private fun takeLinksLocked(): List<DataChannelLink> {
        val current = links.values.toList()
        links.clear()
        open.clear()
        return current
    }

    private fun closeAll(closing: List<DataChannelLink>) {
        closing.forEach { link -> runCatching { link.close() } }
    }

    private companion object {
        const val TAG = "Fishjam"
    }
}

/** One `org.webrtc.DataChannel`. Its observer runs on a WebRTC thread. */
internal class WebRtcDataChannelLink private constructor(
    override val type: DataChannelType,
    private val channels: DataChannels
) : DataChannelLink, DataChannel.Observer {
    @Volatile
    private var channel: DataChannel? = null

    override fun send(data: ByteArray): Boolean =
        channel?.send(DataChannel.Buffer(ByteBuffer.wrap(data), true)) ?: false

    override fun close() {
        val current = channel ?: return
        channel = null
        current.unregisterObserver()
        current.close()
        current.dispose()
    }

    override fun onBufferedAmountChange(previousAmount: Long) = Unit

    override fun onStateChange() {
        when (channel?.state()) {
            DataChannel.State.OPEN -> channels.onOpen(this)
            DataChannel.State.CLOSED -> channels.onClosed(this)
            else -> Unit
        }
    }

    override fun onMessage(buffer: DataChannel.Buffer) {
        // The buffer is only valid during this call.
        val bytes = ByteArray(buffer.data.remaining())
        buffer.data.get(bytes)
        channels.onMessage(this, bytes)
    }

    companion object {
        fun create(connection: PeerConnection, type: DataChannelType, channels: DataChannels): DataChannelLink? {
            val init =
                DataChannel.Init().apply {
                    ordered = type.ordered
                    maxRetransmits = type.maxRetransmits
                }
            val created = connection.createDataChannel(type.label, init) ?: return null
            val link = WebRtcDataChannelLink(type, channels)
            link.channel = created
            created.registerObserver(link)
            return link
        }
    }
}
