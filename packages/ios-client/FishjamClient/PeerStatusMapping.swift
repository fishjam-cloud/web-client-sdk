import Foundation

public enum PeerStatus: String {
    case idle
    case connecting
    case connected
    case error
}

public struct JoinRoomError: LocalizedError {
    public let message: String
    public let authReason: String
    public let joinReason: String

    public var errorDescription: String? {
        message
    }
}

struct PeerStatusUpdate {
    let peerStatus: PeerStatus
    let message: String
    let authReason: String
    let joinReason: String
}

func peerStatusUpdate(_ event: Fishjam_Sdk_SdkEvent) -> PeerStatusUpdate? {
    guard case let .peerStatusChanged(changed)? = event.content else {
        return nil
    }
    let error = changed.hasError ? changed.error : nil
    let status: PeerStatus
    switch changed.peerStatus {
    case .connecting:
        status = .connecting
    case .connected:
        status = .connected
    case .error:
        status = .error
    case .idle, .unspecified, .UNRECOGNIZED:
        status = .idle
    }
    return PeerStatusUpdate(
        peerStatus: status,
        message: error?.message ?? "",
        authReason: error?.authReason ?? "",
        joinReason: error?.joinReason ?? ""
    )
}

func joinFailure(_ update: PeerStatusUpdate) -> JoinRoomError? {
    guard update.peerStatus == .error else {
        return nil
    }
    let reason = update.authReason.isEmpty
        ? (update.joinReason.isEmpty ? update.message : update.joinReason)
        : update.authReason
    return JoinRoomError(message: reason, authReason: update.authReason, joinReason: update.joinReason)
}
