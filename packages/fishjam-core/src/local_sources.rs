//! The list of local sources an app wants published: camera, microphone,
//! screen share, custom video and custom audio.
//!
//! Platform-independent. This module only holds the entry type and the pure
//! rules (which kind a track type needs, where the display name comes from).
//! `client.rs` owns the list and decides when to add, replace, and remove the
//! tracks. The platform makes the media and binds it to the track id it gets
//! in the events.

use serde_json::Value;

use crate::sdk::{TrackKind, TrackType};

/// One local source. It survives leave, reconnect, and final failure. Only
/// `remove_local_source` removes it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LocalSource {
    pub source_id: String,
    /// Chosen by the platform on each call and echoed in the events, so a
    /// stale event can be told apart from the current media.
    pub media_id: String,
    pub kind: TrackKind,
    pub track_type: TrackType,
    /// `Some` while the source has a track in the room.
    pub track_id: Option<String>,
}

/// The kind a track type needs. `None` for `Unspecified`, which is not a
/// local type.
pub(crate) fn kind_for(track_type: TrackType) -> Option<TrackKind> {
    match track_type {
        TrackType::Camera | TrackType::ScreenShareVideo | TrackType::CustomVideo => {
            Some(TrackKind::Video)
        }
        TrackType::Microphone | TrackType::ScreenShareAudio | TrackType::CustomAudio => {
            Some(TrackKind::Audio)
        }
        TrackType::Unspecified => None,
    }
}

/// Rejects a track type that is not local, or a kind that does not match it.
pub(crate) fn validate(kind: TrackKind, track_type: TrackType) -> Result<(), String> {
    match kind_for(track_type) {
        None => Err(format!("{track_type:?} is not a local track type")),
        Some(expected) if expected != kind => Err(format!(
            "{track_type:?} needs an {expected:?} track, got {kind:?}"
        )),
        Some(_) => Ok(()),
    }
}

/// `displayName` from the peer metadata JSON (the peer part, not the server
/// part). `None` when it is missing, not a string, or empty. Same key React
/// Native and the native SDKs read.
pub(crate) fn display_name(peer_metadata_json: &str) -> Option<String> {
    let value: Value = serde_json::from_str(peer_metadata_json).ok()?;
    value
        .get("displayName")?
        .as_str()
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_type_needs_its_own_kind() {
        assert_eq!(kind_for(TrackType::Camera), Some(TrackKind::Video));
        assert_eq!(kind_for(TrackType::Microphone), Some(TrackKind::Audio));
        assert_eq!(kind_for(TrackType::CustomVideo), Some(TrackKind::Video));
        assert_eq!(kind_for(TrackType::CustomAudio), Some(TrackKind::Audio));
        assert_eq!(kind_for(TrackType::Unspecified), None);
    }

    #[test]
    fn mismatched_kind_is_rejected() {
        assert!(validate(TrackKind::Audio, TrackType::Camera).is_err());
        assert!(validate(TrackKind::Video, TrackType::Microphone).is_err());
        assert!(validate(TrackKind::Video, TrackType::Unspecified).is_err());
        assert!(validate(TrackKind::Audio, TrackType::CustomAudio).is_ok());
    }

    #[test]
    fn display_name_is_read_from_the_peer_part_only() {
        assert_eq!(
            display_name(r#"{"displayName":"Ana"}"#).as_deref(),
            Some("Ana")
        );
        assert_eq!(display_name(r#"{"displayName":""}"#), None);
        assert_eq!(display_name(r#"{"displayName":3}"#), None);
        assert_eq!(display_name("{}"), None);
        assert_eq!(display_name("not json"), None);
    }
}
