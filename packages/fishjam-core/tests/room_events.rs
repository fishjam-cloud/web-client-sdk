mod common;

use std::collections::HashMap;

use common::{authenticated, connected, harness};
use fishjam_core::fishjam::media_events::server;
use fishjam_core::sdk::{sdk_event, TrackType};

fn track(type_name: &str) -> server::media_event::Track {
    server::media_event::Track {
        metadata_json: format!(r#"{{"type":"{type_name}","paused":false}}"#),
        simulcast_config: None,
    }
}

fn join(h: &common::Harness) {
    h.client.join_room("token", "{}").unwrap();
    h.socket.open();
    h.socket.receive(authenticated(None));
    h.socket.receive_server_event(connected("local-id"));
    h.events.take();
}

fn event_names(events: &[sdk_event::Content]) -> Vec<&'static str> {
    events
        .iter()
        .map(|event| match event {
            sdk_event::Content::PeerJoined(_) => "peerJoined",
            sdk_event::Content::PeerLeft(_) => "peerLeft",
            sdk_event::Content::PeerUpdated(_) => "peerUpdated",
            sdk_event::Content::TrackAdded(_) => "trackAdded",
            sdk_event::Content::TrackReady(_) => "trackReady",
            sdk_event::Content::TrackRemoved(_) => "trackRemoved",
            sdk_event::Content::TrackUpdated(_) => "trackUpdated",
            sdk_event::Content::RoomStateChanged(_) => "roomState",
            sdk_event::Content::PeerStatusChanged(_) => "peerStatus",
            _ => "other",
        })
        .collect()
}

#[test]
fn peers_already_in_the_room_emit_track_added_then_peer_joined() {
    let h = harness("https://example.com");
    h.client.join_room("token", "{}").unwrap();
    h.socket.open();
    h.socket.receive(authenticated(None));
    h.events.take();

    let mut endpoints = HashMap::new();
    endpoints.insert(
        "local-id".to_owned(),
        server::media_event::Endpoint {
            endpoint_type: "webrtc".to_owned(),
            metadata_json: "{}".to_owned(),
            track_id_to_track: HashMap::new(),
        },
    );
    endpoints.insert(
        "remote-id".to_owned(),
        server::media_event::Endpoint {
            endpoint_type: "webrtc".to_owned(),
            metadata_json: r#"{"peer":{"name":"bob"}}"#.to_owned(),
            track_id_to_track: HashMap::from([
                ("remote-id:camera".to_owned(), track("camera")),
                ("remote-id:microphone".to_owned(), track("microphone")),
                (
                    "remote-id:screen-video".to_owned(),
                    track("screenShareVideo"),
                ),
                (
                    "remote-id:screen-audio".to_owned(),
                    track("screenShareAudio"),
                ),
                ("remote-id:custom-video".to_owned(), track("customVideo")),
                ("remote-id:custom-audio".to_owned(), track("customAudio")),
            ]),
        },
    );
    h.socket
        .receive_server_event(server::media_event::Content::Connected(
            server::media_event::Connected {
                endpoint_id: "local-id".to_owned(),
                endpoint_id_to_endpoint: endpoints,
                ice_servers: vec![],
            },
        ));

    let events = h.events.take();
    let names = event_names(&events);
    assert_eq!(
        names,
        vec![
            "trackAdded",
            "trackAdded",
            "trackAdded",
            "trackAdded",
            "trackAdded",
            "trackAdded",
            "peerJoined",
            "roomState",
            "peerStatus",
        ]
    );
    let sdk_event::Content::PeerJoined(joined) = &events[6] else {
        panic!("expected peerJoined");
    };
    let peer = joined.peer.as_ref().unwrap();
    assert_eq!(peer.id, "remote-id");
    assert!(peer.camera_track.is_some());
    assert!(peer.microphone_track.is_some());
    assert!(peer.screen_share_video_track.is_some());
    assert!(peer.screen_share_audio_track.is_some());
    assert_eq!(peer.custom_video_tracks.len(), 1);
    assert_eq!(peer.custom_audio_tracks.len(), 1);
    assert_eq!(
        peer.camera_track
            .as_ref()
            .unwrap()
            .metadata
            .as_ref()
            .unwrap()
            .r#type(),
        TrackType::Camera
    );
}

#[test]
fn remote_peer_and_track_changes_emit_separate_events() {
    let h = harness("https://example.com");
    join(&h);

    h.socket
        .receive_server_event(server::media_event::Content::EndpointAdded(
            server::media_event::EndpointAdded {
                endpoint_id: "remote-id".to_owned(),
                metadata_json: r#"{"peer":{"name":"bob"}}"#.to_owned(),
            },
        ));
    assert_eq!(
        event_names(&h.events.take()),
        vec!["peerJoined", "roomState"]
    );

    h.socket
        .receive_server_event(server::media_event::Content::TracksAdded(
            server::media_event::TracksAdded {
                endpoint_id: "remote-id".to_owned(),
                track_id_to_track: HashMap::from([("remote-id:cam".to_owned(), track("camera"))]),
            },
        ));
    assert_eq!(
        event_names(&h.events.take()),
        vec!["trackAdded", "roomState"]
    );

    h.socket
        .receive_server_event(server::media_event::Content::EndpointUpdated(
            server::media_event::EndpointUpdated {
                endpoint_id: "remote-id".to_owned(),
                metadata_json: r#"{"peer":{"name":"bobby"}}"#.to_owned(),
            },
        ));
    assert_eq!(
        event_names(&h.events.take()),
        vec!["peerUpdated", "roomState"]
    );

    h.socket
        .receive_server_event(server::media_event::Content::TrackUpdated(
            server::media_event::TrackUpdated {
                endpoint_id: "remote-id".to_owned(),
                track_id: "remote-id:cam".to_owned(),
                metadata_json: r#"{"type":"camera","paused":true}"#.to_owned(),
            },
        ));
    let updated = h.events.take();
    assert_eq!(event_names(&updated), vec!["trackUpdated", "roomState"]);
    let sdk_event::Content::TrackUpdated(track_updated) = &updated[0] else {
        panic!("expected trackUpdated");
    };
    assert!(
        track_updated
            .track
            .as_ref()
            .unwrap()
            .metadata
            .as_ref()
            .unwrap()
            .paused
    );

    h.socket
        .receive_server_event(server::media_event::Content::SdpAnswer(
            server::media_event::SdpAnswer {
                sdp: "v=0".to_owned(),
                mid_to_track_id: HashMap::from([("0".to_owned(), "remote-id:cam".to_owned())]),
            },
        ));
    h.events.take();
    h.client.remote_track_ready("0");
    let ready = h.events.take();
    assert_eq!(event_names(&ready), vec!["trackReady", "roomState"]);
    let sdk_event::Content::TrackReady(track_ready) = &ready[0] else {
        panic!("expected trackReady");
    };
    assert!(track_ready.track.as_ref().unwrap().ready);
    assert_eq!(track_ready.peer_id, "remote-id");

    h.socket
        .receive_server_event(server::media_event::Content::TracksRemoved(
            server::media_event::TracksRemoved {
                endpoint_id: "remote-id".to_owned(),
                track_ids: vec!["remote-id:cam".to_owned()],
            },
        ));
    assert_eq!(
        event_names(&h.events.take()),
        vec!["trackRemoved", "roomState"]
    );

    h.socket
        .receive_server_event(server::media_event::Content::EndpointRemoved(
            server::media_event::EndpointRemoved {
                endpoint_id: "remote-id".to_owned(),
            },
        ));
    let left = h.events.take();
    assert_eq!(event_names(&left), vec!["peerLeft", "roomState"]);
    let sdk_event::Content::PeerLeft(peer_left) = &left[0] else {
        panic!("expected peerLeft");
    };
    assert_eq!(peer_left.peer.as_ref().unwrap().id, "remote-id");
}

#[test]
fn leaving_peer_emits_track_removed_before_peer_left() {
    let h = harness("https://example.com");
    join(&h);
    h.socket
        .receive_server_event(server::media_event::Content::EndpointAdded(
            server::media_event::EndpointAdded {
                endpoint_id: "remote-id".to_owned(),
                metadata_json: "{}".to_owned(),
            },
        ));
    h.socket
        .receive_server_event(server::media_event::Content::TracksAdded(
            server::media_event::TracksAdded {
                endpoint_id: "remote-id".to_owned(),
                track_id_to_track: HashMap::from([
                    ("remote-id:cam".to_owned(), track("camera")),
                    ("remote-id:mic".to_owned(), track("microphone")),
                ]),
            },
        ));
    h.events.take();

    h.socket
        .receive_server_event(server::media_event::Content::EndpointRemoved(
            server::media_event::EndpointRemoved {
                endpoint_id: "remote-id".to_owned(),
            },
        ));

    assert_eq!(
        event_names(&h.events.take()),
        vec!["trackRemoved", "trackRemoved", "peerLeft", "roomState"]
    );
}
