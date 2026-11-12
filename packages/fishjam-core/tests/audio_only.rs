mod common;

use common::{connected, harness, Harness};
use fishjam_core::fishjam::peer_message;
use fishjam_core::fishjam::PeerMessage;
use fishjam_core::sdk::{sdk_event, CallErrorReason, TrackKind, TrackMetadata, TrackType};

fn metadata(track_type: TrackType) -> TrackMetadata {
    TrackMetadata {
        r#type: track_type as i32,
        paused: false,
        display_name: None,
    }
}

fn authenticated(room_type: peer_message::RoomType) -> PeerMessage {
    PeerMessage {
        content: Some(peer_message::Content::Authenticated(
            peer_message::Authenticated {
                room_type: room_type as i32,
                sdk_deprecation: None,
            },
        )),
    }
}

/// Joins and connects. Returns the events emitted for the auth message.
fn join(h: &Harness, room_type: peer_message::RoomType) -> Vec<sdk_event::Content> {
    h.client.join_room("token", r#"{"name":"me"}"#).unwrap();
    h.socket.open();
    h.socket.receive(authenticated(room_type));
    let auth_events = h.events.take();
    h.socket.receive_server_event(connected("local-id"));
    h.events.take();
    auth_events
}

fn renegotiate_count(h: &Harness) -> usize {
    h.socket
        .sent_peer_events()
        .into_iter()
        .filter(|event| {
            matches!(
                event,
                fishjam_core::fishjam::media_events::peer::media_event::Content::RenegotiateTracks(
                    _
                )
            )
        })
        .count()
}

#[test]
fn auth_reports_an_audio_only_room() {
    let h = harness("https://example.com");
    let events = join(&h, peer_message::RoomType::AudioOnly);
    let audio_only = events.iter().any(|event| {
        matches!(
            event,
            sdk_event::Content::Authenticated(auth) if auth.audio_only
        )
    });
    assert!(audio_only, "auth event reports the audio-only room");
}

#[test]
fn audio_only_room_rejects_a_video_track() {
    let h = harness("https://example.com");
    join(&h, peer_message::RoomType::AudioOnly);
    let before = renegotiate_count(&h);

    let error = h
        .client
        .add_track(TrackKind::Video, metadata(TrackType::Camera))
        .unwrap_err();

    assert_eq!(error.call_error_reason, CallErrorReason::TrackType as i32);
    assert!(error.message.contains("audio-only"));
    assert_eq!(renegotiate_count(&h), before);
    let tracks = h.client.room_state().local_peer.expect("local peer").tracks;
    assert!(tracks.is_empty());
}

#[test]
fn audio_only_room_accepts_an_audio_track() {
    let h = harness("https://example.com");
    join(&h, peer_message::RoomType::AudioOnly);
    let before = renegotiate_count(&h);

    let track_id = h
        .client
        .add_track(TrackKind::Audio, metadata(TrackType::Microphone))
        .unwrap();

    assert!(track_id.starts_with("local-id:"));
    assert_eq!(renegotiate_count(&h), before + 1);
}

#[test]
fn conference_room_accepts_a_video_track() {
    let h = harness("https://example.com");
    let events = join(&h, peer_message::RoomType::Conference);
    let reported = events.iter().find_map(|event| match event {
        sdk_event::Content::Authenticated(auth) => Some(auth.audio_only),
        _ => None,
    });
    assert_eq!(reported, Some(false));
    h.client
        .add_track(TrackKind::Video, metadata(TrackType::Camera))
        .unwrap();
}

#[test]
fn livestream_room_accepts_a_video_track() {
    let h = harness("https://example.com");
    join(&h, peer_message::RoomType::Livestream);
    h.client
        .add_track(TrackKind::Video, metadata(TrackType::Camera))
        .unwrap();
}

#[test]
fn video_before_the_peer_is_accepted_keeps_the_existing_error() {
    let h = harness("https://example.com");
    let error = h
        .client
        .add_track(TrackKind::Video, metadata(TrackType::Camera))
        .unwrap_err();
    assert!(error.message.contains("accepted"));
    assert_eq!(error.call_error_reason, CallErrorReason::Unspecified as i32);
}
