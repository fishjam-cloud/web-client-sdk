package io.fishjam.client

import fishjam.sdk.SdkApi

enum class PeerStatus {
    Idle,
    Connecting,
    Connected,
    Error
}

/** Thrown by [FishjamClient.joinRoom] when auth or join fails. The message is the reason. */
class JoinRoomException(
    message: String,
    val authReason: String = "",
    val joinReason: String = ""
) : Exception(message)

internal data class PeerStatusUpdate(
    val peerStatus: PeerStatus,
    val message: String,
    val authReason: String,
    val joinReason: String
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
            SdkApi.PeerStatus.PEER_STATUS_ERROR -> PeerStatus.Error
            SdkApi.PeerStatus.PEER_STATUS_IDLE,
            SdkApi.PeerStatus.PEER_STATUS_UNSPECIFIED,
            SdkApi.PeerStatus.UNRECOGNIZED -> PeerStatus.Idle
        },
        message = error?.message.orEmpty(),
        authReason = error?.authReason.orEmpty(),
        joinReason = error?.joinReason.orEmpty()
    )
}

internal fun joinFailure(update: PeerStatusUpdate): JoinRoomException? {
    if (update.peerStatus != PeerStatus.Error) return null
    val reason = update.authReason.ifEmpty { update.joinReason }.ifEmpty { update.message }
    return JoinRoomException(reason, update.authReason, update.joinReason)
}
