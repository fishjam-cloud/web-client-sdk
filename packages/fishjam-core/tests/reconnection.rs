//! Covers `fishjam-core`'s automatic reconnection (`src/reconnect.rs` wired
//! into `src/client.rs`): retry triggers, backoff timing, exhaustion,
//! cancellation, `add_tracks_on_reconnect`, the offline timeout, and the
//! per-network attempt budget.
//!
//! Tests never wait for a real delay: `harness`/`harness_with_config` use a
//! `MockScheduler` (see `tests/common/mod.rs`), so a reconnect attempt or
//! offline timeout only runs when a test calls `fire_next()`.

mod common;

use std::time::Duration;

use common::{authenticated, connected, harness, harness_with_config, join_and_connect};
use fishjam_core::fishjam::media_events::{peer, server};
use fishjam_core::fishjam::peer_message;
use fishjam_core::sdk::{
    sdk_event, ClientConfig, PeerStatus, ReconnectConfig as ReconnectConfigProto,
    ReconnectionStatus, TrackKind, TrackMetadata, TrackType,
};

const FISHJAM_ID: &str = "https://example.com/api/v1/connect/abc";

fn config_with_reconnect(reconnect: ReconnectConfigProto) -> ClientConfig {
    ClientConfig {
        fishjam_id: FISHJAM_ID.to_owned(),
        debug: false,
        client_type: "android".to_owned(),
        reconnect_config: Some(reconnect),
    }
}

fn offer_data(audio: i32, video: i32) -> server::media_event::Content {
    server::media_event::Content::OfferData(server::media_event::OfferData {
        tracks_types: Some(server::media_event::offer_data::TrackTypes { audio, video }),
    })
}

fn camera_metadata() -> TrackMetadata {
    TrackMetadata {
        r#type: TrackType::Camera as i32,
        paused: false,
        display_name: None,
    }
}

#[test]
fn unexpected_loss_schedules_first_attempt_and_emits_reconnecting() {
    let h = harness(FISHJAM_ID);
    join_and_connect(&h, "token", "{}", "local-id");

    h.socket.close("going away");

    assert_eq!(
        h.client.peer_status(),
        PeerStatus::Connected,
        "stays connected while quietly retrying"
    );
    assert_eq!(
        h.events.reconnection_statuses(),
        vec![ReconnectionStatus::Reconnecting]
    );
    assert_eq!(
        h.scheduler.pending_delays(),
        vec![Duration::from_millis(500)]
    );
}

#[test]
fn backoff_delay_grows_by_500ms_each_attempt() {
    let h = harness(FISHJAM_ID);
    join_and_connect(&h, "token", "{}", "local-id");

    h.socket.close("going away");
    assert_eq!(
        h.scheduler.pending_delays(),
        vec![Duration::from_millis(500)]
    );

    h.scheduler.fire_next(); // opens attempt 1's socket
    h.socket.close("going away"); // attempt 1 fails too
    assert_eq!(
        h.scheduler.pending_delays(),
        vec![Duration::from_millis(1_000)]
    );

    h.scheduler.fire_next(); // opens attempt 2's socket
    h.socket.close("going away"); // attempt 2 fails too
    assert_eq!(
        h.scheduler.pending_delays(),
        vec![Duration::from_millis(1_500)]
    );
}

#[test]
fn exhausting_max_attempts_on_one_network_gives_up() {
    let h = harness(FISHJAM_ID); // default max_attempts = 3
    join_and_connect(&h, "token", "{}", "local-id");

    h.socket.close("going away"); // loss #1: schedules attempt 1
    for _ in 0..3 {
        assert_eq!(h.client.peer_status(), PeerStatus::Connected);
        h.scheduler.fire_next();
        h.socket.close("going away"); // this attempt fails too
    }

    assert_eq!(h.client.peer_status(), PeerStatus::Error);
    assert_eq!(
        h.events.reconnection_statuses().last(),
        Some(&ReconnectionStatus::Error)
    );
    assert_eq!(
        h.scheduler.pending_count(),
        0,
        "gives up, nothing more scheduled"
    );
}

#[test]
fn leave_room_cancels_a_pending_reconnect_attempt() {
    let h = harness(FISHJAM_ID);
    join_and_connect(&h, "token", "{}", "local-id");

    h.socket.close("going away");
    assert_eq!(h.scheduler.pending_count(), 1);

    h.client.leave_room();
    assert_eq!(h.client.peer_status(), PeerStatus::Idle);

    // Nothing cancels the real timer underneath; its callback still runs,
    // but it's stale now (the generation it captured no longer matches)
    // and does nothing.
    let connect_count_before = h.socket.state.lock().unwrap().connect_count;
    h.scheduler.fire_next();
    assert_eq!(
        h.socket.state.lock().unwrap().connect_count,
        connect_count_before,
        "the cancelled attempt is a no-op"
    );
    assert_eq!(h.client.peer_status(), PeerStatus::Idle);
}

#[test]
fn reconnect_succeeds_rejoins_with_last_token_and_metadata_and_returns_to_idle() {
    let h = harness(FISHJAM_ID);
    join_and_connect(&h, "token-123", r#"{"name":"Alice"}"#, "local-id");

    h.socket.close("going away");
    h.scheduler.fire_next();
    h.socket.open();

    // The rejoin reuses the same token the room was originally joined with.
    let sent = h.socket.sent();
    match &sent[0].content {
        Some(peer_message::Content::AuthRequest(auth)) => assert_eq!(auth.token, "token-123"),
        other => panic!("expected auth request, got {other:?}"),
    }

    h.socket.receive(authenticated(None));
    // ...and the last peer metadata, not any default.
    assert_eq!(
        h.socket.sent_peer_events(),
        vec![peer::media_event::Content::Connect(
            peer::media_event::Connect {
                metadata_json: r#"{"name":"Alice"}"#.to_owned(),
            }
        )]
    );

    h.socket.receive_server_event(connected("local-id"));

    assert_eq!(h.client.peer_status(), PeerStatus::Connected);
    assert_eq!(
        h.events.reconnection_statuses(),
        vec![ReconnectionStatus::Reconnecting, ReconnectionStatus::Idle]
    );
}

#[test]
fn auth_and_join_errors_never_schedule_a_retry() {
    for (reason, after_auth) in [("invalid token", false), ("reached peers limit", true)] {
        let h = harness(FISHJAM_ID);
        h.client.join_room("token", "{}").unwrap();
        h.socket.open();
        if after_auth {
            h.socket.receive(authenticated(None));
        }

        h.socket.close(reason);

        assert_eq!(h.client.peer_status(), PeerStatus::Error, "{reason}");
        assert_eq!(
            h.scheduler.pending_count(),
            0,
            "{reason}: auth/join errors never retry"
        );
        assert!(
            h.events.reconnection_statuses().is_empty(),
            "{reason}: no reconnection ever started"
        );
    }
}

#[test]
fn reconnection_disabled_ends_session_immediately_without_retry() {
    let h = harness_with_config(config_with_reconnect(ReconnectConfigProto {
        enabled: false,
        max_attempts: 3,
        initial_delay_ms: 500,
        delay_ms: 500,
        add_tracks_on_reconnect: true,
        offline_timeout_ms: 60_000,
    }));
    join_and_connect(&h, "token", "{}", "local-id");

    h.socket.close("going away");

    assert_eq!(h.client.peer_status(), PeerStatus::Error);
    assert_eq!(h.scheduler.pending_count(), 0);
    assert!(
        h.events.reconnection_statuses().is_empty(),
        "disabled reconnection never reports reconnecting"
    );
}

#[test]
fn add_tracks_on_reconnect_true_keeps_and_republishes_local_tracks() {
    let h = harness(FISHJAM_ID); // default: add_tracks_on_reconnect = true
    join_and_connect(&h, "token", "{}", "local-id");

    let track_id = h
        .client
        .add_track(TrackKind::Video, camera_metadata())
        .unwrap();
    h.socket.receive_server_event(offer_data(0, 1));
    h.events.take(); // discard the pre-loss AddSendonlyTransceiver etc.

    h.socket.close("going away");
    h.scheduler.fire_next();
    h.socket.open();
    h.socket.receive(authenticated(None));
    h.socket.receive_server_event(connected("local-id"));

    // Still listed for the local peer right after rejoining, even though
    // not yet re-sent to the new peer connection.
    let room = h.client.room_state();
    let local = room.local_peer.expect("local peer");
    assert!(
        local.tracks.iter().any(|track| track.track_id == track_id),
        "track survives the reconnect"
    );

    // And actually re-offered on the next offer, with the same track id
    // (no new `AddTrack` call needed from the app).
    h.socket.receive_server_event(offer_data(0, 1));
    let events = h.events.take();
    assert!(
        events.iter().any(|event| matches!(
            event,
            sdk_event::Content::AddSendonlyTransceiver(transceiver)
                if transceiver.track_id == track_id
        )),
        "track is re-published on the next offer"
    );
}

#[test]
fn add_tracks_on_reconnect_false_clears_local_tracks_on_reconnect() {
    let h = harness_with_config(config_with_reconnect(ReconnectConfigProto {
        enabled: true,
        max_attempts: 3,
        initial_delay_ms: 500,
        delay_ms: 500,
        add_tracks_on_reconnect: false,
        offline_timeout_ms: 60_000,
    }));
    join_and_connect(&h, "token", "{}", "local-id");

    let track_id = h
        .client
        .add_track(TrackKind::Video, camera_metadata())
        .unwrap();
    h.socket.receive_server_event(offer_data(0, 1));
    h.events.take();

    h.socket.close("going away");
    h.scheduler.fire_next();
    h.socket.open();
    h.socket.receive(authenticated(None));
    h.socket.receive_server_event(connected("local-id"));

    let room = h.client.room_state();
    let local = room.local_peer.expect("local peer");
    assert!(
        !local.tracks.iter().any(|track| track.track_id == track_id),
        "track is dropped, matching a normal disconnect"
    );
}

#[test]
fn offline_timeout_gives_up_if_network_never_returns() {
    let h = harness(FISHJAM_ID);
    h.client.network_status_changed(true, "wifi"); // baseline report
    join_and_connect(&h, "token", "{}", "local-id");

    h.socket.close("going away"); // schedules attempt 1
    h.client.network_status_changed(false, ""); // network lost while reconnecting

    assert_eq!(
        h.client.peer_status(),
        PeerStatus::Connected,
        "still quietly waiting"
    );

    // Fires the (now stale) attempt timer and the offline timeout; only the
    // offline timeout's generation still matches.
    while h.scheduler.pending_count() > 0 {
        h.scheduler.fire_next();
    }

    assert_eq!(h.client.peer_status(), PeerStatus::Error);
    assert_eq!(
        h.events.reconnection_statuses().last(),
        Some(&ReconnectionStatus::Error)
    );
}

#[test]
fn network_change_resets_the_per_network_attempt_budget() {
    let h = harness(FISHJAM_ID); // default max_attempts = 3
    h.client.network_status_changed(true, "wifi"); // baseline report
    join_and_connect(&h, "token", "{}", "local-id");

    h.socket.close("going away"); // loss: schedules attempt 1 @ 500ms
    h.scheduler.fire_next();
    h.socket.close("going away"); // attempt 1 fails: attempts_on_this_network = 1
    h.scheduler.fire_next();
    h.socket.close("going away"); // attempt 2 fails: attempts_on_this_network = 2
    assert_eq!(
        h.scheduler.pending_delays(),
        vec![Duration::from_millis(1_500)]
    );
    let connect_count_before_change = h.socket.state.lock().unwrap().connect_count;

    // The network changes before attempt 3's timer fires: retries
    // immediately instead of waiting, and resets the per-network budget.
    h.client.network_status_changed(true, "wifi2");

    assert_eq!(
        h.socket.state.lock().unwrap().connect_count,
        connect_count_before_change + 1,
        "retries immediately on the new network"
    );
    assert_eq!(
        h.scheduler.pending_count(),
        1,
        "attempt 3's timer is still queued, but now stale"
    );
    h.scheduler.fire_next();
    assert_eq!(
        h.socket.state.lock().unwrap().connect_count,
        connect_count_before_change + 1,
        "the superseded timer is a no-op"
    );

    // This attempt fails too. If the per-network budget had kept counting
    // from 2 instead of resetting to 1, this would already be a give-up.
    h.socket.close("going away");
    assert_eq!(
        h.client.peer_status(),
        PeerStatus::Connected,
        "not given up yet"
    );
    assert_eq!(
        h.scheduler.pending_delays(),
        vec![Duration::from_millis(1_000)]
    );
}

#[test]
fn airplane_mode_waits_and_reconnects_when_the_network_returns() {
    let h = harness(FISHJAM_ID);
    h.client.network_status_changed(true, "wifi");
    join_and_connect(&h, "token-123", r#"{"name":"Alice"}"#, "local-id");
    let connects = h.socket.state.lock().unwrap().connect_count;

    h.client.network_status_changed(false, "");

    assert_eq!(
        h.events.reconnection_statuses(),
        vec![ReconnectionStatus::Reconnecting]
    );
    assert_eq!(
        h.socket.state.lock().unwrap().connect_count,
        connects,
        "no socket while the device is offline"
    );
    assert_eq!(h.scheduler.pending_delays(), vec![Duration::from_secs(60)]);

    // The old socket closing must not start an attempt either.
    h.socket.close("network down");
    assert_eq!(h.socket.state.lock().unwrap().connect_count, connects);
    assert_eq!(h.scheduler.pending_count(), 1);

    h.client.network_status_changed(true, "wifi");

    assert_eq!(h.socket.state.lock().unwrap().connect_count, connects + 1);
    h.socket.open();
    let sent = h.socket.sent();
    match &sent[0].content {
        Some(peer_message::Content::AuthRequest(auth)) => assert_eq!(auth.token, "token-123"),
        other => panic!("expected auth request, got {other:?}"),
    }
    h.socket.receive(authenticated(None));
    h.socket.receive_server_event(connected("local-id"));
    assert_eq!(h.client.peer_status(), PeerStatus::Connected);
    assert_eq!(
        h.events.reconnection_statuses().last(),
        Some(&ReconnectionStatus::Idle)
    );
}

#[test]
fn network_returning_retries_even_after_attempts_were_spent_offline() {
    let h = harness(FISHJAM_ID);
    h.client.network_status_changed(true, "wifi");
    join_and_connect(&h, "token", "{}", "local-id");

    // The socket dies before the platform reports that the network is gone,
    // so the retries run with nowhere to connect and then give up.
    h.socket.close("down");
    for _ in 0..3 {
        h.scheduler.fire_next();
        h.socket.close("down");
    }
    assert_eq!(h.client.peer_status(), PeerStatus::Error);
    let connects = h.socket.state.lock().unwrap().connect_count;

    h.client.network_status_changed(false, "");
    h.client.network_status_changed(true, "wifi");

    assert_eq!(h.socket.state.lock().unwrap().connect_count, connects + 1);
    assert_eq!(
        h.events.reconnection_statuses().last(),
        Some(&ReconnectionStatus::Reconnecting)
    );
}

#[test]
fn an_auth_error_does_not_reconnect_when_the_network_returns() {
    let h = harness(FISHJAM_ID);
    h.client.network_status_changed(true, "wifi");
    h.client.join_room("token", "{}").unwrap();
    h.socket.open();
    h.socket.close("invalid token");
    assert_eq!(h.client.peer_status(), PeerStatus::Error);
    let connects = h.socket.state.lock().unwrap().connect_count;

    h.client.network_status_changed(false, "");
    h.client.network_status_changed(true, "wifi");

    assert_eq!(h.socket.state.lock().unwrap().connect_count, connects);
}
