package io.fishjam.client

import fishjam.sdk.SdkApi

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

internal fun peerStatusUpdate(event: SdkApi.SdkEvent): PeerStatusUpdate? {
    if (!event.hasPeerStatusChanged()) return null
    val changed = event.peerStatusChanged
    val error = if (changed.hasError()) changed.error else null
    return PeerStatusUpdate(
        peerStatus =
        when (changed.peerStatus) {
            SdkApi.PeerStatus.PEER_STATUS_CONNECTING -> PeerStatus.Connecting
            SdkApi.PeerStatus.PEER_STATUS_CONNECTED -> PeerStatus.Connected
            SdkApi.PeerStatus.PEER_STATUS_ERROR ->
                PeerStatus.Error(
                    message = error?.message.orEmpty(),
                    authReason = error?.let(::authReasonOf),
                    joinReason = error?.let(::joinReasonOf)
                )
            SdkApi.PeerStatus.PEER_STATUS_IDLE,
            SdkApi.PeerStatus.PEER_STATUS_UNSPECIFIED,
            SdkApi.PeerStatus.UNRECOGNIZED -> PeerStatus.Idle
        }
    )
}

internal fun reconnectionStatusUpdate(event: SdkApi.SdkEvent): ReconnectionStatus? {
    if (!event.hasReconnectionStatusChanged()) return null
    return when (event.reconnectionStatusChanged.status) {
        SdkApi.ReconnectionStatus.RECONNECTION_STATUS_RECONNECTING -> ReconnectionStatus.Reconnecting
        SdkApi.ReconnectionStatus.RECONNECTION_STATUS_ERROR -> ReconnectionStatus.Error
        SdkApi.ReconnectionStatus.RECONNECTION_STATUS_IDLE,
        SdkApi.ReconnectionStatus.UNRECOGNIZED -> ReconnectionStatus.Idle
    }
}

internal fun joinFailure(update: PeerStatusUpdate): JoinRoomException? {
    val error = update.peerStatus as? PeerStatus.Error ?: return null
    val message = error.message.ifEmpty { error.authReason?.rawValue ?: error.joinReason?.rawValue.orEmpty() }
    return JoinRoomException(message, error.authReason, error.joinReason)
}

private fun authReasonOf(error: SdkApi.Error): AuthErrorReason? = when (error.authErrorReason) {
    SdkApi.AuthErrorReason.AUTH_ERROR_REASON_MISSING_TOKEN -> AuthErrorReason.MissingToken
    SdkApi.AuthErrorReason.AUTH_ERROR_REASON_INVALID_TOKEN -> AuthErrorReason.InvalidToken
    SdkApi.AuthErrorReason.AUTH_ERROR_REASON_EXPIRED_TOKEN -> AuthErrorReason.ExpiredToken
    SdkApi.AuthErrorReason.AUTH_ERROR_REASON_ROOM_NOT_FOUND -> AuthErrorReason.RoomNotFound
    SdkApi.AuthErrorReason.AUTH_ERROR_REASON_PEER_NOT_FOUND -> AuthErrorReason.PeerNotFound
    else -> AuthErrorReason.fromRaw(error.authReason)
}

private fun joinReasonOf(error: SdkApi.Error): JoinErrorReason? = when (error.joinErrorReason) {
    SdkApi.JoinErrorReason.JOIN_ERROR_REASON_REACHED_PEERS_LIMIT -> JoinErrorReason.ReachedPeersLimit
    SdkApi.JoinErrorReason.JOIN_ERROR_REASON_ROOM_NOT_FOUND -> JoinErrorReason.RoomNotFound
    SdkApi.JoinErrorReason.JOIN_ERROR_REASON_NODE_NOT_FOUND -> JoinErrorReason.NodeNotFound
    SdkApi.JoinErrorReason.JOIN_ERROR_REASON_INVALID_SDK_VERSION -> JoinErrorReason.InvalidSdkVersion
    else -> JoinErrorReason.fromRaw(error.joinReason)
}
