pub const AUTH_ERROR_REASONS: [&str; 5] = [
    "missing token",
    "invalid token",
    "expired token",
    "room not found",
    "peer not found",
];

pub const JOIN_ERRORS: [&str; 4] = [
    "reached peers limit",
    "room not found",
    "node not found",
    "invalid sdk version",
];

pub fn normalize_close_reason(reason: &str) -> String {
    reason.trim().to_lowercase()
}

pub fn is_auth_error(reason: &str) -> bool {
    AUTH_ERROR_REASONS.contains(&reason)
}

pub fn is_join_error(reason: &str) -> bool {
    JOIN_ERRORS.contains(&reason)
}
