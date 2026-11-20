package io.fishjam.client

import uniffi.fishjam_core.CoreAuthErrorReason
import uniffi.fishjam_core.CoreEvent
import uniffi.fishjam_core.CoreException
import uniffi.fishjam_core.CoreJoinErrorReason
import uniffi.fishjam_core.CorePeerStatus
import uniffi.fishjam_core.CoreReconnectionStatus

enum class AuthErrorReason(val rawValue: String) {
    MissingToken("missing token"),
    InvalidToken("invalid token"),
    ExpiredToken("expired token"),
    RoomNotFound("room not found"),
    PeerNotFound("peer not found");

    companion object {
        fun fromRaw(value: String): AuthErrorReason? = entries.firstOrNull { it.rawValue == value }
    }
}

enum class JoinErrorReason(val rawValue: String) {
    ReachedPeersLimit("reached peers limit"),
    RoomNotFound("room not found"),
    NodeNotFound("node not found"),
    InvalidSdkVersion("invalid sdk version");

    companion object {
        fun fromRaw(value: String): JoinErrorReason? = entries.firstOrNull { it.rawValue == value }
    }
}

sealed class PeerStatus {
    data object Idle : PeerStatus()

    data object Connecting : PeerStatus()

    data object Connected : PeerStatus()

    data class Error(
        val message: String,
        val authReason: AuthErrorReason?,
        val joinReason: JoinErrorReason?
    ) : PeerStatus()

    val label: String
        get() =
            when (this) {
                Idle -> "idle"
                Connecting -> "connecting"
                Connected -> "connected"
                is Error -> "error"
            }
}

/**
 * Mirrors the RN SDK's `useConnection().reconnectionStatus`: [Idle] most of
 * the time, [Reconnecting] while an automatic retry is in flight, [Error]
 * once retries are exhausted (at which point [PeerStatus.Error] also
 * applies).
 */
enum class ReconnectionStatus {
    Idle,
    Reconnecting,
    Error
}

/** Thrown by [FishjamClient.joinRoom] when auth or join fails. The message is the reason. */
class JoinRoomException(
    message: String,
    val authReason: AuthErrorReason? = null,
    val joinReason: JoinErrorReason? = null
) : Exception(message)

internal data class PeerStatusUpdate(
    val peerStatus: PeerStatus
)

internal fun peerStatusUpdate(event: CoreEvent): PeerStatusUpdate? {
    if (event !is CoreEvent.PeerStatusChanged) return null
    val error = event.error
    return PeerStatusUpdate(
        peerStatus =
        when (event.peerStatus) {
            CorePeerStatus.CONNECTING -> PeerStatus.Connecting
            CorePeerStatus.CONNECTED -> PeerStatus.Connected
            CorePeerStatus.ERROR ->
                PeerStatus.Error(
                    message = error?.detail.orEmpty(),
                    authReason = error?.let(::authReasonOf),
                    joinReason = error?.let(::joinReasonOf)
                )
            CorePeerStatus.IDLE -> PeerStatus.Idle
        }
    )
}

internal fun reconnectionStatusUpdate(event: CoreEvent): ReconnectionStatus? {
    if (event !is CoreEvent.ReconnectionStatusChanged) return null
    return when (event.status) {
        CoreReconnectionStatus.RECONNECTING -> ReconnectionStatus.Reconnecting
        CoreReconnectionStatus.ERROR -> ReconnectionStatus.Error
        CoreReconnectionStatus.IDLE -> ReconnectionStatus.Idle
    }
}

internal fun joinFailure(update: PeerStatusUpdate): JoinRoomException? {
    val error = update.peerStatus as? PeerStatus.Error ?: return null
    val message = error.message.ifEmpty { error.authReason?.rawValue ?: error.joinReason?.rawValue.orEmpty() }
    return JoinRoomException(message, error.authReason, error.joinReason)
}

internal val CoreException.detail: String
    get() = when (this) {
        is CoreException.TrackType -> detail
        is CoreException.Failed -> detail
    }

private fun authReasonOf(error: CoreException): AuthErrorReason? = when ((error as? CoreException.Failed)?.authReason) {
    CoreAuthErrorReason.MISSING_TOKEN -> AuthErrorReason.MissingToken
    CoreAuthErrorReason.INVALID_TOKEN -> AuthErrorReason.InvalidToken
    CoreAuthErrorReason.EXPIRED_TOKEN -> AuthErrorReason.ExpiredToken
    CoreAuthErrorReason.ROOM_NOT_FOUND -> AuthErrorReason.RoomNotFound
    CoreAuthErrorReason.PEER_NOT_FOUND -> AuthErrorReason.PeerNotFound
    null -> null
}

private fun joinReasonOf(error: CoreException): JoinErrorReason? = when ((error as? CoreException.Failed)?.joinReason) {
    CoreJoinErrorReason.REACHED_PEERS_LIMIT -> JoinErrorReason.ReachedPeersLimit
    CoreJoinErrorReason.ROOM_NOT_FOUND -> JoinErrorReason.RoomNotFound
    CoreJoinErrorReason.NODE_NOT_FOUND -> JoinErrorReason.NodeNotFound
    CoreJoinErrorReason.INVALID_SDK_VERSION -> JoinErrorReason.InvalidSdkVersion
    null -> null
}
