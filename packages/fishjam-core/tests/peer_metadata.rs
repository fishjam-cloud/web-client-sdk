mod common;

use std::collections::HashMap;

use common::{authenticated, harness, join_and_connect};
use fishjam_core::fishjam::media_events::{peer, server};
use fishjam_core::sdk::sdk_event;

const NOT_ACCEPTED: &str = "Cannot update peer metadata before being accepted by the server";

#[test]
fn update_peer_metadata_sends_the_peer_part_and_keeps_the_server_part() {
    let h = harness("https://example.com");
    h.client.join_room("token", r#"{"name":"Alice"}"#).unwrap();
    h.socket.open();
    h.socket.receive(authenticated(None));
    h.socket.receive_server_event(connected_with(
        "local-id",
        r#"{"peer":{"name":"Alice"},"server":{"role":"host"}}"#,
    ));
    h.events.take();

    h.client.update_peer_metadata(r#"{"name":"Bob"}"#).unwrap();

    assert!(h.socket.sent_peer_events().iter().any(|event| matches!(
        event,
        peer::media_event::Content::UpdateEndpointMetadata(update)
            if update.metadata_json == r#"{"name":"Bob"}"#
    )));
    assert_eq!(
        h.client.room_state().local_peer.unwrap().metadata_json,
        r#"{"peer":{"name":"Bob"},"server":{"role":"host"}}"#
    );
    assert!(h
        .events
        .take()
        .iter()
        .any(|event| matches!(event, sdk_event::Content::RoomStateChanged(_))));
}

#[test]
fn update_peer_metadata_is_sent_again_on_reconnect() {
    let h = harness("https://example.com");
    join_and_connect(&h, "token-123", r#"{"name":"Alice"}"#, "local-id");
    h.client.update_peer_metadata(r#"{"name":"Bob"}"#).unwrap();

    h.socket.close("going away");
    h.scheduler.fire_next();
    h.socket.open();
    h.socket.receive(authenticated(None));

    assert_eq!(
        h.socket.sent_peer_events(),
        vec![peer::media_event::Content::Connect(
            peer::media_event::Connect {
                metadata_json: r#"{"name":"Bob"}"#.to_owned(),
            }
        )]
    );
}

#[test]
fn update_peer_metadata_errors_before_the_server_accepts_the_peer() {
    let h = harness("https://example.com");
    let error = h.client.update_peer_metadata("{}").unwrap_err();
    assert_eq!(error.message, NOT_ACCEPTED);

    h.client.join_room("token", "{}").unwrap();
    h.socket.open();
    h.socket.receive(authenticated(None));
    let error = h.client.update_peer_metadata("{}").unwrap_err();
    assert_eq!(error.message, NOT_ACCEPTED);
    assert!(h
        .socket
        .sent_peer_events()
        .iter()
        .all(|event| { !matches!(event, peer::media_event::Content::UpdateEndpointMetadata(_)) }));
}

#[test]
fn update_peer_metadata_remote_endpoint_updated_carries_the_new_json() {
    let h = harness("https://example.com");
    join_and_connect(&h, "token", "{}", "local-id");
    h.socket
        .receive_server_event(server::media_event::Content::EndpointAdded(
            server::media_event::EndpointAdded {
                endpoint_id: "remote-id".to_owned(),
                metadata_json: r#"{"peer":{"name":"bob"}}"#.to_owned(),
            },
        ));
    h.events.take();

    let metadata_json = r#"{"peer":{"name":"bobby"},"server":{"role":"guest"}}"#;
    h.socket
        .receive_server_event(server::media_event::Content::EndpointUpdated(
            server::media_event::EndpointUpdated {
                endpoint_id: "remote-id".to_owned(),
                metadata_json: metadata_json.to_owned(),
            },
        ));

    let peer = h.events.take().into_iter().find_map(|event| match event {
        sdk_event::Content::PeerUpdated(updated) => updated.peer,
        _ => None,
    });
    assert_eq!(peer.unwrap().metadata_json, metadata_json);
}

fn connected_with(local_id: &str, metadata_json: &str) -> server::media_event::Content {
    let mut endpoints = HashMap::new();
    endpoints.insert(
        local_id.to_owned(),
        server::media_event::Endpoint {
            endpoint_type: "webrtc".to_owned(),
            metadata_json: metadata_json.to_owned(),
            track_id_to_track: HashMap::new(),
        },
    );
    server::media_event::Content::Connected(server::media_event::Connected {
        endpoint_id: local_id.to_owned(),
        endpoint_id_to_endpoint: endpoints,
        ice_servers: Vec::new(),
    })
}
