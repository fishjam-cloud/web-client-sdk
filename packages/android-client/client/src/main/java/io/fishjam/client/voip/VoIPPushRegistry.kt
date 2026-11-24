package io.fishjam.client.voip

/**
 * Process-wide bridge between [VoIPMessagingService] (which can run with no
 * app UI alive, e.g. a push received while the app is killed) and [VoIP].
 */
object VoIPPushRegistry {
    data class Incoming(
        val roomName: String,
        val displayName: String,
        val handle: String,
        val isVideo: Boolean,
        val avatarUrl: String? = null
    )

    interface Listener {
        fun onVoIPToken(token: String)

        fun onVoIPIncoming(incoming: Incoming)

        fun onWaitingCallDeclined(incoming: Incoming)
    }

    @Volatile
    private var token: String? = null

    @Volatile
    private var pendingIncoming: Incoming? = null

    @Volatile
    private var pendingWaitingIncoming: Incoming? = null

    @Volatile
    private var listener: Listener? = null

    @Synchronized
    fun setListener(l: Listener?) {
        listener = l
    }

    @Synchronized
    fun updateToken(newToken: String) {
        if (token == newToken) return
        token = newToken
        listener?.onVoIPToken(newToken)
    }

    @Synchronized
    fun getToken(): String? = token

    @Synchronized
    fun reportIncoming(incoming: Incoming) {
        pendingIncoming = incoming
        listener?.onVoIPIncoming(incoming)
    }

    @Synchronized
    fun pending(): Incoming? = pendingIncoming

    @Synchronized
    fun clearPending() {
        pendingIncoming = null
    }

    @Synchronized
    fun bufferWaitingIncoming(incoming: Incoming) {
        pendingWaitingIncoming = incoming
    }

    @Synchronized
    fun revealWaitingIncoming() {
        val incoming = pendingWaitingIncoming ?: return
        pendingWaitingIncoming = null
        reportIncoming(incoming)
    }

    @Synchronized
    fun discardWaitingIncoming() {
        val incoming = pendingWaitingIncoming
        pendingWaitingIncoming = null
        if (incoming != null) {
            listener?.onWaitingCallDeclined(incoming)
        }
    }

    @Synchronized
    fun reportRejectedIncoming(incoming: Incoming) {
        listener?.onWaitingCallDeclined(incoming)
    }
}
