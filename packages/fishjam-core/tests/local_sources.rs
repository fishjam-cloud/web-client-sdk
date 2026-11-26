//! Covers the local source list (`set_local_source`, `remove_local_source`,
//! `mute_local_source`): when a track is published, replaced, muted,
//! unpublished, or rejected, and how the list survives leave and reconnect.
//! Each rule runs for every local track type (camera, microphone, custom
//! video, custom audio) unless the rule only applies to one kind.

mod common;

use std::collections::HashMap;

use common::{connected, harness, harness_with_config, join_and_connect, Harness};
use fishjam_core::fishjam::media_events::{peer, server};
use fishjam_core::fishjam::{peer_message, PeerMessage};
use fishjam_core::sdk::{
    ClientConfig, CoreError, ReconnectConfig as ReconnectConfigProto, SdkEvent, TrackKind,
    TrackType,
};

const FISHJAM_ID: &str = "https://example.com/api/v1/connect/abc";
const OFFER_SDP: &str = "v=0\r\noffer";
const ANSWER_SDP: &str = "v=0\r\nanswer";

/// Every local track type, with the kind it needs.
const CASES: [(TrackKind, TrackType); 4] = [
    (TrackKind::Video, TrackType::Camera),
    (TrackKind::Audio, TrackType::Microphone),
    (TrackKind::Video, TrackType::CustomVideo),
    (TrackKind::Audio, TrackType::CustomAudio),
];

/// Authenticates and connects without the `join_and_connect` helper, which
/// discards the events. Used when a test needs the events of the join.
fn join_manually(h: &Harness, metadata: &str, room_type: peer_message::RoomType) {
    h.client.join_room("token", metadata).unwrap();
    h.socket.open();
    h.socket.receive(PeerMessage {
        content: Some(peer_message::Content::Authenticated(
            peer_message::Authenticated {
                room_type: room_type as i32,
                sdk_deprecation: None,
            },
        )),
    });
    h.socket.receive_server_event(connected("local-id"));
}

fn offer_data(audio: i32, video: i32) -> server::media_event::Content {
    server::media_event::Content::OfferData(server::media_event::OfferData {
        tracks_types: Some(server::media_event::offer_data::TrackTypes { audio, video }),
    })
}

fn config_without_kept_tracks() -> ClientConfig {
    ClientConfig {
        fishjam_id: FISHJAM_ID.to_owned(),
        debug: false,
        client_type: "android".to_owned(),
        reconnect_config: Some(ReconnectConfigProto {
            enabled: true,
            max_attempts: 3,
            initial_delay_ms: 500,
            delay_ms: 500,
            add_tracks_on_reconnect: false,
            offline_timeout_ms: 60_000,
        }),
        ..Default::default()
    }
}

/// `(source_id, media_id, track_id)` of each `LocalSourcePublished`.
fn published(events: &[SdkEvent]) -> Vec<(String, String, String)> {
    events
        .iter()
        .filter_map(|event| match event {
            SdkEvent::LocalSourcePublished {
                source_id,
                media_id,
                track_id,
            } => Some((source_id.clone(), media_id.clone(), track_id.clone())),
            _ => None,
        })
        .collect()
}

fn replaced(events: &[SdkEvent]) -> Vec<(String, String, String)> {
    events
        .iter()
        .filter_map(|event| match event {
            SdkEvent::LocalSourceReplaced {
                source_id,
                media_id,
                track_id,
            } => Some((source_id.clone(), media_id.clone(), track_id.clone())),
            _ => None,
        })
        .collect()
}

fn unpublished(events: &[SdkEvent]) -> Vec<(String, String, String)> {
    events
        .iter()
        .filter_map(|event| match event {
            SdkEvent::LocalSourceUnpublished {
                source_id,
                media_id,
                track_id,
            } => Some((source_id.clone(), media_id.clone(), track_id.clone())),
            _ => None,
        })
        .collect()
}

/// `(source_id, media_id)` of each `LocalSourceRejected`.
fn rejected(events: &[SdkEvent]) -> Vec<(String, String)> {
    events
        .iter()
        .filter_map(|event| match event {
            SdkEvent::LocalSourceRejected {
                source_id,
                media_id,
            } => Some((source_id.clone(), media_id.clone())),
            _ => None,
        })
        .collect()
}

fn room_tracks(h: &Harness) -> Vec<fishjam_core::sdk::TrackState> {
    h.client
        .room_state()
        .local_peer
        .map(|peer| peer.tracks)
        .unwrap_or_default()
}

fn room_track_ids(h: &Harness) -> Vec<String> {
    room_tracks(h)
        .into_iter()
        .map(|track| track.track_id)
        .collect()
}

fn transceiver_count(events: &[SdkEvent], track_id: &str) -> usize {
    events
        .iter()
        .filter(|event| {
            matches!(
                event,
                SdkEvent::AddSendonlyTransceiver { track_id: id, .. } if id == track_id
            )
        })
        .count()
}

#[test]
fn set_before_joining_publishes_once_on_connect() {
    for (kind, track_type) in CASES {
        let h = harness(FISHJAM_ID);
        h.client
            .set_local_source("source", "media-1", kind, track_type)
            .unwrap();
        assert!(
            h.events.take().is_empty(),
            "nothing is published before the peer is connected"
        );

        join_manually(&h, "{}", peer_message::RoomType::Conference);
        let events = h.events.take();

        let published = published(&events);
        assert_eq!(published.len(), 1, "{track_type:?}");
        assert_eq!(published[0].0, "source", "{track_type:?}");
        assert_eq!(published[0].1, "media-1", "{track_type:?}");
        assert_eq!(room_track_ids(&h), vec![published[0].2.clone()]);
    }
}

#[test]
fn set_while_connected_publishes_at_once() {
    for (kind, track_type) in CASES {
        let h = harness(FISHJAM_ID);
        join_and_connect(&h, "token", "{}", "local-id");

        h.client
            .set_local_source("source", "media-1", kind, track_type)
            .unwrap();
        let events = h.events.take();

        let published = published(&events);
        assert_eq!(published.len(), 1, "{track_type:?}");
        assert_eq!(room_track_ids(&h), vec![published[0].2.clone()]);
    }
}

#[test]
fn replacing_a_live_source_keeps_the_track_id() {
    for (kind, track_type) in CASES {
        let h = harness(FISHJAM_ID);
        join_and_connect(&h, "token", "{}", "local-id");
        h.client
            .set_local_source("source", "media-1", kind, track_type)
            .unwrap();
        let track_id = published(&h.events.take())[0].2.clone();

        h.client
            .set_local_source("source", "media-2", kind, track_type)
            .unwrap();
        let events = h.events.take();

        assert_eq!(
            replaced(&events),
            vec![("source".to_owned(), "media-2".to_owned(), track_id.clone())],
            "{track_type:?}"
        );
        assert!(
            published(&events).is_empty(),
            "no new track: {track_type:?}"
        );
        assert!(unpublished(&events).is_empty(), "{track_type:?}");
        assert_eq!(room_track_ids(&h), vec![track_id], "{track_type:?}");
    }
}

#[test]
fn replacing_with_another_type_is_rejected() {
    let h = harness(FISHJAM_ID);
    join_and_connect(&h, "token", "{}", "local-id");
    h.client
        .set_local_source("source", "media-1", TrackKind::Video, TrackType::Camera)
        .unwrap();
    h.events.take();

    let error = h
        .client
        .set_local_source(
            "source",
            "media-2",
            TrackKind::Video,
            TrackType::CustomVideo,
        )
        .unwrap_err();

    assert!(matches!(error, CoreError::Failed { .. }), "{error:?}");
    assert_eq!(room_track_ids(&h).len(), 1);
}

#[test]
fn remove_unpublishes_and_takes_the_track_out_of_the_room() {
    for (kind, track_type) in CASES {
        let h = harness(FISHJAM_ID);
        join_and_connect(&h, "token", "{}", "local-id");
        h.client
            .set_local_source("source", "media-1", kind, track_type)
            .unwrap();
        let track_id = published(&h.events.take())[0].2.clone();

        h.client.remove_local_source("source");
        let events = h.events.take();

        assert_eq!(
            unpublished(&events),
            vec![("source".to_owned(), "media-1".to_owned(), track_id)],
            "{track_type:?}"
        );
        assert!(room_track_ids(&h).is_empty(), "{track_type:?}");

        h.client.remove_local_source("source");
        assert!(h.events.take().is_empty(), "a second remove does nothing");
    }
}

#[test]
fn leave_then_join_unpublishes_then_publishes_a_new_track() {
    for (kind, track_type) in CASES {
        let h = harness(FISHJAM_ID);
        join_and_connect(&h, "token", "{}", "local-id");
        h.client
            .set_local_source("source", "media-1", kind, track_type)
            .unwrap();
        let first = published(&h.events.take())[0].2.clone();

        h.client.leave_room();
        let left = h.events.take();
        assert_eq!(
            unpublished(&left),
            vec![("source".to_owned(), "media-1".to_owned(), first.clone())],
            "{track_type:?}"
        );

        join_manually(&h, "{}", peer_message::RoomType::Conference);
        let joined = h.events.take();
        let again = published(&joined);
        assert_eq!(again.len(), 1, "{track_type:?}");
        assert_ne!(again[0].2, first, "a new track after rejoining");
        assert_eq!(room_track_ids(&h), vec![again[0].2.clone()]);
    }
}

#[test]
fn reconnect_that_keeps_tracks_publishes_nothing_again() {
    for (kind, track_type) in CASES {
        let h = harness(FISHJAM_ID); // add_tracks_on_reconnect defaults to true
        join_and_connect(&h, "token", "{}", "local-id");
        h.client
            .set_local_source("source", "media-1", kind, track_type)
            .unwrap();
        let track_id = published(&h.events.take())[0].2.clone();

        h.socket.close("going away");
        h.scheduler.fire_next();
        h.socket.open();
        h.socket.receive(common::authenticated(None));
        h.socket.receive_server_event(connected("local-id"));
        let events = h.events.take();

        assert!(published(&events).is_empty(), "{track_type:?}");
        assert!(unpublished(&events).is_empty(), "{track_type:?}");
        assert_eq!(room_track_ids(&h), vec![track_id], "{track_type:?}");
    }
}

#[test]
fn reconnect_without_kept_tracks_republishes_with_a_new_track_id() {
    for (kind, track_type) in CASES {
        let h = harness_with_config(config_without_kept_tracks());
        join_and_connect(&h, "token", "{}", "local-id");
        h.client
            .set_local_source("source", "media-1", kind, track_type)
            .unwrap();
        let first = published(&h.events.take())[0].2.clone();

        h.socket.close("going away");
        h.scheduler.fire_next();
        let mut events = h.events.take();
        h.socket.open();
        h.socket.receive(common::authenticated(None));
        h.socket.receive_server_event(connected("local-id"));
        events.extend(h.events.take());

        let unpublished_at = events
            .iter()
            .position(|event| matches!(event, SdkEvent::LocalSourceUnpublished { .. }))
            .expect("unpublished on reconnect");
        let published_at = events
            .iter()
            .position(|event| matches!(event, SdkEvent::LocalSourcePublished { .. }))
            .expect("published again after reconnect");
        assert!(unpublished_at < published_at, "{track_type:?}");

        let again = published(&events);
        assert_eq!(again.len(), 1, "{track_type:?}");
        assert_ne!(again[0].2, first, "{track_type:?}");
        assert_eq!(room_track_ids(&h), vec![again[0].2.clone()]);
    }
}

#[test]
fn audio_only_room_rejects_video_and_publishes_audio() {
    let h = harness(FISHJAM_ID);
    h.client
        .set_local_source("camera", "m1", TrackKind::Video, TrackType::Camera)
        .unwrap();
    h.client
        .set_local_source("mic", "m2", TrackKind::Audio, TrackType::Microphone)
        .unwrap();

    join_manually(&h, "{}", peer_message::RoomType::AudioOnly);
    let events = h.events.take();

    assert_eq!(
        rejected(&events),
        vec![("camera".to_owned(), "m1".to_owned())]
    );
    let published = published(&events);
    assert_eq!(published.len(), 1);
    assert_eq!(published[0].0, "mic");
    assert_eq!(room_track_ids(&h).len(), 1, "only the microphone");
}

#[test]
fn video_set_while_connected_in_audio_only_room_is_refused() {
    let h = harness(FISHJAM_ID);
    join_manually(&h, "{}", peer_message::RoomType::AudioOnly);
    h.events.take();

    let error = h
        .client
        .set_local_source(
            "screen",
            "m3",
            TrackKind::Video,
            TrackType::ScreenShareVideo,
        )
        .unwrap_err();

    assert!(matches!(error, CoreError::TrackType { .. }), "{error:?}");
    assert!(room_track_ids(&h).is_empty());
}

#[test]
fn a_published_track_is_announced_before_its_transceiver() {
    let h = harness(FISHJAM_ID);
    join_and_connect(&h, "token", "{}", "local-id");

    h.client
        .set_local_source("camera", "m1", TrackKind::Video, TrackType::Camera)
        .unwrap();
    let set_events = h.events.take();
    let track_id = published(&set_events)[0].2.clone();
    assert_eq!(
        transceiver_count(&set_events, &track_id),
        0,
        "the transceiver is offered later, after the app has been told"
    );

    h.socket.receive_server_event(offer_data(0, 1));
    let offer_events = h.events.take();
    assert_eq!(transceiver_count(&offer_events, &track_id), 1);
}

#[test]
fn every_type_carries_the_peer_display_name() {
    for (kind, track_type) in CASES {
        let h = harness(FISHJAM_ID);
        join_and_connect(&h, "token", r#"{"displayName":"Ana"}"#, "local-id");
        h.client
            .set_local_source("source", "media-1", kind, track_type)
            .unwrap();
        let track_id = published(&h.events.take())[0].2.clone();

        let track = room_tracks(&h)
            .into_iter()
            .find(|track| track.track_id == track_id)
            .expect("published track is in the room");
        assert_eq!(
            track.metadata.display_name.as_deref(),
            Some("Ana"),
            "{track_type:?}"
        );
    }
}

#[test]
fn display_name_is_absent_when_the_peer_has_none() {
    for (kind, track_type) in CASES {
        let h = harness(FISHJAM_ID);
        join_and_connect(&h, "token", r#"{"name":"me"}"#, "local-id");
        h.client
            .set_local_source("source", "media-1", kind, track_type)
            .unwrap();
        h.events.take();

        let track = room_tracks(&h).into_iter().next().expect("track");
        assert_eq!(track.metadata.display_name, None, "{track_type:?}");
    }
}

#[test]
fn a_kind_that_does_not_match_the_type_is_rejected() {
    let h = harness(FISHJAM_ID);
    join_and_connect(&h, "token", "{}", "local-id");

    let mismatches = [
        (TrackKind::Audio, TrackType::Camera),
        (TrackKind::Video, TrackType::Microphone),
        (TrackKind::Video, TrackType::CustomAudio),
        (TrackKind::Video, TrackType::Unspecified),
    ];
    for (kind, track_type) in mismatches {
        assert!(
            h.client
                .set_local_source("source", "media-1", kind, track_type)
                .is_err(),
            "{kind:?} with {track_type:?}"
        );
    }
    assert!(room_track_ids(&h).is_empty());
    assert!(h.events.take().is_empty(), "nothing is published");
}

/// `(source_id, media_id, track_id)` of each `LocalSourceMuted`.
fn muted(events: &[SdkEvent]) -> Vec<(String, String, String)> {
    events
        .iter()
        .filter_map(|event| match event {
            SdkEvent::LocalSourceMuted {
                source_id,
                media_id,
                track_id,
            } => Some((source_id.clone(), media_id.clone(), track_id.clone())),
            _ => None,
        })
        .collect()
}

/// `(track_id, paused)` of each `UpdateTrackMetadata` in `sent`.
fn metadata_updates(sent: &[peer::media_event::Content]) -> Vec<(String, bool)> {
    sent.iter()
        .filter_map(|content| match content {
            peer::media_event::Content::UpdateTrackMetadata(update) => {
                let value: serde_json::Value = serde_json::from_str(&update.metadata_json).unwrap();
                Some((update.track_id.clone(), value["paused"].as_bool().unwrap()))
            }
            _ => None,
        })
        .collect()
}

/// Track ids of each `UnmuteTrack` in `sent`.
fn unmutes(sent: &[peer::media_event::Content]) -> Vec<String> {
    sent.iter()
        .filter_map(|content| match content {
            peer::media_event::Content::UnmuteTrack(unmute) => Some(unmute.track_id.clone()),
            _ => None,
        })
        .collect()
}

/// Gets the offer for `track_id` through `set_local_description_result`, so
/// the track is `Offered`. Stops before the answer.
fn offer(h: &Harness, kind: TrackKind, track_id: &str) {
    let (audio, video) = match kind {
        TrackKind::Audio => (1, 0),
        TrackKind::Video => (0, 1),
    };
    h.socket.receive_server_event(offer_data(audio, video));
    let mids = HashMap::from([("0".to_owned(), track_id.to_owned())]);
    loop {
        let batch = h.events.take();
        if batch.is_empty() {
            break;
        }
        for event in batch {
            match event {
                SdkEvent::CreateOffer => h.client.create_offer_result(OFFER_SDP),
                SdkEvent::SetLocalDescription { .. } => {
                    h.client.set_local_description_result(mids.clone())
                }
                _ => {}
            }
        }
    }
}

/// Sends the answer that covers `track_id`, so the track is `Done`.
fn answer(h: &Harness, track_id: &str) {
    h.socket
        .receive_server_event(server::media_event::Content::SdpAnswer(
            server::media_event::SdpAnswer {
                sdp: ANSWER_SDP.to_owned(),
                mid_to_track_id: HashMap::from([("0".to_owned(), track_id.to_owned())]),
            },
        ));
    h.events.take();
}

/// Publishes a source on a connected peer and gets its track answered.
/// Returns the track id.
fn publish_answered(h: &Harness, kind: TrackKind, track_type: TrackType) -> String {
    join_and_connect(h, "token", "{}", "local-id");
    h.client
        .set_local_source("source", "media-1", kind, track_type)
        .unwrap();
    let track_id = published(&h.events.take())[0].2.clone();
    offer(h, kind, &track_id);
    answer(h, &track_id);
    track_id
}

fn paused(h: &Harness, track_id: &str) -> bool {
    room_tracks(h)
        .into_iter()
        .find(|track| track.track_id == track_id)
        .expect("track is in the room")
        .metadata
        .paused
}

#[test]
fn mute_keeps_the_track_and_sends_paused_metadata() {
    for (kind, track_type) in CASES {
        let h = harness(FISHJAM_ID);
        let track_id = publish_answered(&h, kind, track_type);
        let sent_before = h.socket.sent_peer_events().len();

        h.client.mute_local_source("source");
        let events = h.events.take();

        assert_eq!(
            muted(&events),
            vec![("source".to_owned(), "media-1".to_owned(), track_id.clone())],
            "{track_type:?}"
        );
        assert!(unpublished(&events).is_empty(), "the track is kept");
        assert_eq!(room_track_ids(&h), vec![track_id.clone()], "{track_type:?}");
        assert!(paused(&h, &track_id), "{track_type:?}");

        let sent = h.socket.sent_peer_events();
        let new = &sent[sent_before..];
        assert_eq!(
            metadata_updates(new),
            vec![(track_id.clone(), true)],
            "{track_type:?}"
        );

        h.client.mute_local_source("source");
        assert!(h.events.take().is_empty(), "muting twice does nothing");
    }
}

#[test]
fn mute_while_offered_waits_for_the_answer() {
    for (kind, track_type) in CASES {
        let h = harness(FISHJAM_ID);
        join_and_connect(&h, "token", "{}", "local-id");
        h.client
            .set_local_source("source", "media-1", kind, track_type)
            .unwrap();
        let track_id = published(&h.events.take())[0].2.clone();
        offer(&h, kind, &track_id);
        let sent_before = h.socket.sent_peer_events().len();

        h.client.mute_local_source("source");
        h.events.take();
        let sent = h.socket.sent_peer_events();
        assert!(
            metadata_updates(&sent[sent_before..]).is_empty(),
            "no update before the answer: {track_type:?}"
        );

        answer(&h, &track_id);
        let sent = h.socket.sent_peer_events();
        assert_eq!(
            metadata_updates(&sent[sent_before..]),
            vec![(track_id, true)],
            "{track_type:?}"
        );
    }
}

#[test]
fn setting_a_muted_source_unmutes_the_same_track() {
    for (kind, track_type) in CASES {
        let h = harness(FISHJAM_ID);
        let track_id = publish_answered(&h, kind, track_type);
        h.client.mute_local_source("source");
        h.events.take();
        let sent_before = h.socket.sent_peer_events().len();

        h.client
            .set_local_source("source", "media-2", kind, track_type)
            .unwrap();
        let events = h.events.take();

        assert_eq!(
            replaced(&events),
            vec![("source".to_owned(), "media-2".to_owned(), track_id.clone())],
            "{track_type:?}"
        );
        assert!(published(&events).is_empty(), "{track_type:?}");
        assert!(unpublished(&events).is_empty(), "{track_type:?}");
        assert_eq!(room_track_ids(&h), vec![track_id.clone()], "{track_type:?}");
        assert!(!paused(&h, &track_id), "{track_type:?}");

        let sent = h.socket.sent_peer_events();
        let new = &sent[sent_before..];
        assert_eq!(
            metadata_updates(new),
            vec![(track_id.clone(), false)],
            "{track_type:?}"
        );
        assert_eq!(unmutes(new), vec![track_id], "{track_type:?}");
    }
}

#[test]
fn muted_source_is_not_published_again_after_leave_and_join() {
    for (kind, track_type) in CASES {
        let h = harness(FISHJAM_ID);
        let track_id = publish_answered(&h, kind, track_type);
        h.client.mute_local_source("source");
        h.events.take();

        h.client.leave_room();
        let left = h.events.take();
        assert_eq!(
            unpublished(&left),
            vec![("source".to_owned(), "media-1".to_owned(), track_id)],
            "{track_type:?}"
        );

        join_manually(&h, "{}", peer_message::RoomType::Conference);
        let joined = h.events.take();
        assert!(published(&joined).is_empty(), "{track_type:?}");
        assert!(room_track_ids(&h).is_empty(), "{track_type:?}");

        h.client
            .set_local_source("source", "media-2", kind, track_type)
            .unwrap();
        let again = published(&h.events.take());
        assert_eq!(again.len(), 1, "{track_type:?}");
        assert_eq!(room_track_ids(&h), vec![again[0].2.clone()]);
    }
}

#[test]
fn muted_source_is_dropped_on_reconnect_and_not_published_until_set() {
    for (kind, track_type) in CASES {
        let h = harness(FISHJAM_ID); // add_tracks_on_reconnect defaults to true
        let track_id = publish_answered(&h, kind, track_type);
        h.client.mute_local_source("source");
        h.events.take();

        h.socket.close("going away");
        h.scheduler.fire_next();
        h.socket.open();
        h.socket.receive(common::authenticated(None));
        h.socket.receive_server_event(connected("local-id"));
        let events = h.events.take();

        assert_eq!(
            unpublished(&events),
            vec![("source".to_owned(), "media-1".to_owned(), track_id)],
            "{track_type:?}"
        );
        assert!(published(&events).is_empty(), "{track_type:?}");
        assert!(room_track_ids(&h).is_empty(), "{track_type:?}");
    }
}

#[test]
fn muting_a_waiting_source_forgets_it() {
    for (kind, track_type) in CASES {
        let h = harness(FISHJAM_ID);
        h.client
            .set_local_source("source", "media-1", kind, track_type)
            .unwrap();
        h.client.mute_local_source("source");

        join_manually(&h, "{}", peer_message::RoomType::Conference);
        let events = h.events.take();

        assert!(published(&events).is_empty(), "{track_type:?}");
        assert!(room_track_ids(&h).is_empty(), "{track_type:?}");
    }
}
