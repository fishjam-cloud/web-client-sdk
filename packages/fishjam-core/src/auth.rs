use crate::sdk::{AuthErrorReason, JoinErrorReason};

pub fn normalize_close_reason(reason: &str) -> String {
    reason.trim().to_lowercase()
}

pub fn auth_error_reason(reason: &str) -> Option<AuthErrorReason> {
    match reason {
        "missing token" => Some(AuthErrorReason::MissingToken),
        "invalid token" => Some(AuthErrorReason::InvalidToken),
        "expired token" => Some(AuthErrorReason::ExpiredToken),
        "room not found" => Some(AuthErrorReason::RoomNotFound),
        "peer not found" => Some(AuthErrorReason::PeerNotFound),
        _ => None,
    }
}

pub fn join_error_reason(reason: &str) -> Option<JoinErrorReason> {
    match reason {
        "reached peers limit" => Some(JoinErrorReason::ReachedPeersLimit),
        "room not found" => Some(JoinErrorReason::RoomNotFound),
        "node not found" => Some(JoinErrorReason::NodeNotFound),
        "invalid sdk version" => Some(JoinErrorReason::InvalidSdkVersion),
        _ => None,
    }
}
