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

func peerStatusUpdate(_ event: CoreEvent) -> PeerStatusUpdate? {
    guard case let .peerStatusChanged(peerStatus, error) = event else {
        return nil
    }
    let status: PeerStatus
    switch peerStatus {
    case .connecting:
        status = .connecting
    case .connected:
        status = .connected
    case .error:
        status = .error(
            ConnectionFailure(
                message: error?.detail ?? "",
                authReason: error.flatMap(authReason(of:)),
                joinReason: error.flatMap(joinReason(of:))
            )
        )
    case .idle:
        status = .idle
    }
    return PeerStatusUpdate(peerStatus: status)
}

func joinRoomError(of error: CoreError) -> JoinRoomError {
    let auth = authReason(of: error)
    let join = joinReason(of: error)
    let message = error.detail.isEmpty ? (auth?.rawValue ?? join?.rawValue ?? "") : error.detail
    return JoinRoomError(message: message, authReason: auth, joinReason: join)
}

func reconnectionStatusUpdate(_ event: CoreEvent) -> ReconnectionStatus? {
    guard case let .reconnectionStatusChanged(status) = event else {
        return nil
    }
    switch status {
    case .reconnecting:
        return .reconnecting
    case .error:
        return .error
    case .idle:
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

extension CoreError {
    var detail: String {
        switch self {
        case let .TrackType(detail), let .Failed(detail, _, _):
            return detail
        }
    }
}

func authReason(of error: CoreError) -> AuthErrorReason? {
    guard case let .Failed(_, reason, _) = error, let reason else { return nil }
    switch reason {
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
    }
}

func joinReason(of error: CoreError) -> JoinErrorReason? {
    guard case let .Failed(_, _, reason) = error, let reason else { return nil }
    switch reason {
    case .reachedPeersLimit:
        return .reachedPeersLimit
    case .roomNotFound:
        return .roomNotFound
    case .nodeNotFound:
        return .nodeNotFound
    case .invalidSdkVersion:
        return .invalidSdkVersion
    }
}
