import Foundation

public enum AuthErrorReason: String, Equatable {
    case missingToken = "missing token"
    case invalidToken = "invalid token"
    case expiredToken = "expired token"
    case roomNotFound = "room not found"
    case peerNotFound = "peer not found"
}

public enum JoinErrorReason: String, Equatable {
    case reachedPeersLimit = "reached peers limit"
    case roomNotFound = "room not found"
    case nodeNotFound = "node not found"
    case invalidSdkVersion = "invalid sdk version"
}

public struct ConnectionFailure: Equatable {
    public let message: String
    public let authReason: AuthErrorReason?
    public let joinReason: JoinErrorReason?
}

public enum PeerStatus: Equatable {
    case idle
    case connecting
    case connected
    case error(ConnectionFailure)

    public var label: String {
        switch self {
        case .idle:
            return "idle"
        case .connecting:
            return "connecting"
        case .connected:
            return "connected"
        case .error:
            return "error"
        }
    }

    public var failure: ConnectionFailure? {
        if case let .error(failure) = self {
            return failure
        }
        return nil
    }
}

/// Mirrors the RN SDK's `useConnection().reconnectionStatus`: `.idle` most of
/// the time, `.reconnecting` while an automatic retry is in flight, `.error`
/// once retries are exhausted (at which point `peerStatus` also becomes
/// `.error`).
public enum ReconnectionStatus: String {
    case idle
    case reconnecting
    case error
}

public struct JoinRoomError: LocalizedError, Equatable {
    public let message: String
    public let authReason: AuthErrorReason?
    public let joinReason: JoinErrorReason?

    public var errorDescription: String? {
        message
    }
}

struct PeerStatusUpdate {
    let peerStatus: PeerStatus
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
        status = .error(
            ConnectionFailure(
                message: error?.message ?? "",
                authReason: error.flatMap(authReason(of:)),
                joinReason: error.flatMap(joinReason(of:))
            )
        )
    case .idle, .unspecified, .UNRECOGNIZED:
        status = .idle
    }
    return PeerStatusUpdate(peerStatus: status)
}

func joinRoomError(of error: Fishjam_Sdk_Error) -> JoinRoomError {
    let auth = authReason(of: error)
    let join = joinReason(of: error)
    let message = error.message.isEmpty ? (auth?.rawValue ?? join?.rawValue ?? "") : error.message
    return JoinRoomError(message: message, authReason: auth, joinReason: join)
}

func reconnectionStatusUpdate(_ event: Fishjam_Sdk_SdkEvent) -> ReconnectionStatus? {
    guard case let .reconnectionStatusChanged(changed)? = event.content else {
        return nil
    }
    switch changed.status {
    case .reconnecting:
        return .reconnecting
    case .error:
        return .error
    case .idle, .UNRECOGNIZED:
        return .idle
    }
}

func joinFailure(_ update: PeerStatusUpdate) -> JoinRoomError? {
    guard case let .error(failure) = update.peerStatus else {
        return nil
    }
    let message = failure.message.isEmpty
        ? (failure.authReason?.rawValue ?? failure.joinReason?.rawValue ?? "")
        : failure.message
    return JoinRoomError(
        message: message,
        authReason: failure.authReason,
        joinReason: failure.joinReason
    )
}

func authReason(of error: Fishjam_Sdk_Error) -> AuthErrorReason? {
    switch error.authErrorReason {
    case .missingToken:
        return .missingToken
    case .invalidToken:
        return .invalidToken
    case .expiredToken:
        return .expiredToken
    case .roomNotFound:
        return .roomNotFound
    case .peerNotFound:
        return .peerNotFound
    case .unspecified, .UNRECOGNIZED:
        return AuthErrorReason(rawValue: error.authReason)
    }
}

func joinReason(of error: Fishjam_Sdk_Error) -> JoinErrorReason? {
    switch error.joinErrorReason {
    case .reachedPeersLimit:
        return .reachedPeersLimit
    case .roomNotFound:
        return .roomNotFound
    case .nodeNotFound:
        return .nodeNotFound
    case .invalidSdkVersion:
        return .invalidSdkVersion
    case .unspecified, .UNRECOGNIZED:
        return JoinErrorReason(rawValue: error.joinReason)
    }
}
