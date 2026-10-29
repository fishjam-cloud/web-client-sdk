mod common;

use common::{authenticated, capture_logs, connected, harness, logs};
use fishjam_core::fishjam::media_events::{peer, server};
use fishjam_core::fishjam::peer_message;
use fishjam_core::sdk::{sdk_event, PeerStatus};

const FISHJAM_ID: &str = "https://example.com/api/v1/connect/abc";
const METADATA: &str = r#"{"name":"Alice"}"#;

#[test]
fn successful_join_sends_auth_and_connect_then_becomes_connected() {
    let h = harness(FISHJAM_ID);
    assert_eq!(h.client.peer_status(), PeerStatus::Idle);

    h.client.join_room("token-123", METADATA).unwrap();
    assert_eq!(
        h.socket.state.lock().unwrap().url.as_deref(),
        Some("wss://example.com/api/v1/connect/abc/socket/peer/websocket")
    );
    assert_eq!(h.client.peer_status(), PeerStatus::Connecting);
    assert_eq!(h.events.statuses(), vec![PeerStatus::Connecting]);

    h.socket.open();
    let sent = h.socket.sent();
    assert_eq!(sent.len(), 1);
    match &sent[0].content {
        Some(peer_message::Content::AuthRequest(auth)) => {
            assert_eq!(auth.token, "token-123");
            assert_eq!(auth.sdk_version, "mobile-0.31.0");
        }
        other => panic!("expected auth request, got {other:?}"),
    }

    h.socket.receive(authenticated(None));
    let peer_events = h.socket.sent_peer_events();
    assert_eq!(
        peer_events,
        vec![peer::media_event::Content::Connect(
            peer::media_event::Connect {
                metadata_json: METADATA.to_owned(),
            }
        )]
    );
    assert_eq!(h.client.peer_status(), PeerStatus::Connecting);

    h.socket.receive_server_event(connected("local-id"));
    assert_eq!(h.client.peer_status(), PeerStatus::Connected);
    assert_eq!(h.events.statuses(), vec![PeerStatus::Connected]);
}

#[test]
fn sdk_version_is_mobile_and_package_version() {
    assert_eq!(fishjam_core::sdk_version(), "mobile-0.31.0");
}

#[test]
fn each_auth_error_sets_error_with_auth_reason() {
    for reason in [
        "missing token",
        "invalid token",
        "expired token",
        "room not found",
        "peer not found",
    ] {
        let h = harness(FISHJAM_ID);
        h.client.join_room("bad", "{}").unwrap();
        h.socket.open();
        h.events.take();

        h.socket.close(&format!("  {}  ", reason.to_uppercase()));

        assert_eq!(h.client.peer_status(), PeerStatus::Error, "{reason}");
        let events = h.events.take();
        let error = events
            .iter()
            .find_map(|event| match event {
                sdk_event::Content::PeerStatusChanged(changed) => changed.error.clone(),
                _ => None,
            })
            .unwrap_or_else(|| panic!("no error event for {reason}"));
        assert_eq!(error.auth_reason, reason);
        assert_eq!(error.join_reason, "");
    }
}

#[test]
fn each_join_error_sets_error_with_join_reason() {
    for reason in [
        "reached peers limit",
        "node not found",
        "invalid sdk version",
    ] {
        let h = harness(FISHJAM_ID);
        h.client.join_room("token", "{}").unwrap();
        h.socket.open();
        h.socket.receive(authenticated(None));
        h.events.take();

        h.socket.close(reason);

        assert_eq!(h.client.peer_status(), PeerStatus::Error, "{reason}");
        let error = h
            .events
            .take()
            .into_iter()
            .find_map(|event| match event {
                sdk_event::Content::PeerStatusChanged(changed) => changed.error,
                _ => None,
            })
            .unwrap_or_else(|| panic!("no error event for {reason}"));
        assert_eq!(error.join_reason, reason);
        assert_eq!(error.auth_reason, "");
    }
}

#[test]
fn server_error_media_event_sets_error() {
    let h = harness(FISHJAM_ID);
    h.client.join_room("token", "{}").unwrap();
    h.socket.open();
    h.socket.receive(authenticated(None));
    h.events.take();

    h.socket
        .receive_server_event(server::media_event::Content::Error(
            server::media_event::Error {
                message: "boom".to_owned(),
            },
        ));

    assert_eq!(h.client.peer_status(), PeerStatus::Error);
}

#[test]
fn unsupported_sdk_logs_error_and_stays_connected() {
    capture_logs();
    let h = harness(FISHJAM_ID);
    h.client.join_room("token", "{}").unwrap();
    h.socket.open();

    h.socket.receive(authenticated(Some((
        peer_message::sdk_deprecation::Status::Unsupported,
        "sdk unsupported",
    ))));

    assert!(logs().contains(&(log::Level::Error, "sdk unsupported".to_owned())));
    assert!(!h.socket.is_closed());
    assert_eq!(h.socket.sent_peer_events().len(), 1);
}

#[test]
fn deprecated_sdk_logs_warning() {
    capture_logs();
    let h = harness(FISHJAM_ID);
    h.client.join_room("token", "{}").unwrap();
    h.socket.open();

    h.socket.receive(authenticated(Some((
        peer_message::sdk_deprecation::Status::Deprecated,
        "sdk deprecated",
    ))));

    assert!(logs().contains(&(log::Level::Warn, "sdk deprecated".to_owned())));
    assert!(!h.socket.is_closed());
}

#[test]
fn leave_room_sends_disconnect_and_returns_to_idle() {
    let h = harness(FISHJAM_ID);
    h.client.join_room("token", "{}").unwrap();
    h.socket.open();
    h.socket.receive(authenticated(None));
    h.socket.receive_server_event(connected("local-id"));
    h.events.take();

    h.client.leave_room();

    assert_eq!(
        h.socket.sent_peer_events().last(),
        Some(&peer::media_event::Content::Disconnect(
            peer::media_event::Disconnect {}
        ))
    );
    assert!(h.socket.is_closed());
    assert_eq!(h.client.peer_status(), PeerStatus::Idle);
    assert_eq!(h.events.statuses(), vec![PeerStatus::Idle]);

    h.socket.close("");
    assert_eq!(h.client.peer_status(), PeerStatus::Idle);
    assert!(h.events.take().is_empty());
}

#[test]
fn leave_room_before_socket_opens_does_not_send_disconnect() {
    let h = harness(FISHJAM_ID);
    h.client.join_room("token", "{}").unwrap();

    h.client.leave_room();

    assert!(h.socket.sent().is_empty());
    assert!(h.socket.is_closed());
    assert_eq!(h.client.peer_status(), PeerStatus::Idle);
}

#[test]
fn unexpected_socket_close_sets_error() {
    let h = harness(FISHJAM_ID);
    h.client.join_room("token", "{}").unwrap();
    h.socket.open();
    h.socket.receive(authenticated(None));
    h.socket.receive_server_event(connected("local-id"));

    h.socket.close("going away");

    assert_eq!(h.client.peer_status(), PeerStatus::Error);
}

#[test]
fn join_room_again_closes_previous_socket() {
    let h = harness(FISHJAM_ID);
    h.client.join_room("token", "{}").unwrap();
    h.socket.open();
    h.socket.receive(authenticated(None));
    h.socket.receive_server_event(connected("local-id"));
    h.events.take();

    h.client.join_room("token-2", "{}").unwrap();

    assert_eq!(h.socket.state.lock().unwrap().connect_count, 2);
    assert_eq!(
        h.events.statuses(),
        vec![PeerStatus::Idle, PeerStatus::Connecting]
    );
}

#[test]
fn websocket_url_follows_fishjam_url_rules() {
    use fishjam_core::websocket_url;

    assert_eq!(
        websocket_url("abc").unwrap(),
        "wss://fishjam.io/api/v1/connect/abc/socket/peer/websocket"
    );
    assert_eq!(
        websocket_url("http://localhost:5002").unwrap(),
        "ws://localhost:5002/socket/peer/websocket"
    );
    assert_eq!(
        websocket_url("https://example.com/api/").unwrap(),
        "wss://example.com/api/socket/peer/websocket"
    );
    assert!(websocket_url("").is_err());
}
