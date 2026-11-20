mod common;

use std::collections::HashMap;

use common::{authenticated, connected, harness};
use fishjam_core::fishjam::media_events::server;
use fishjam_core::sdk::{SdkEvent, TrackKind, TrackMetadata, TrackType, VadStatus};

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

fn event_names(events: &[SdkEvent]) -> Vec<&'static str> {
    events
        .iter()
        .map(|event| match event {
            SdkEvent::PeerJoined { .. } => "peerJoined",
            SdkEvent::PeerLeft { .. } => "peerLeft",
            SdkEvent::PeerUpdated { .. } => "peerUpdated",
            SdkEvent::TrackAdded { .. } => "trackAdded",
            SdkEvent::TrackReady { .. } => "trackReady",
            SdkEvent::TrackRemoved { .. } => "trackRemoved",
            SdkEvent::TrackUpdated { .. } => "trackUpdated",
            SdkEvent::VoiceActivityChanged { .. } => "voiceActivityChanged",
            SdkEvent::RoomStateChanged { .. } => "roomState",
            SdkEvent::PeerStatusChanged { .. } => "peerStatus",
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
    let SdkEvent::PeerJoined { peer } = &events[6] else {
        panic!("expected peerJoined");
    };
    assert_eq!(peer.id, "remote-id");
    assert!(peer.camera_track.is_some());
    assert!(peer.microphone_track.is_some());
    assert!(peer.screen_share_video_track.is_some());
    assert!(peer.screen_share_audio_track.is_some());
    assert_eq!(peer.custom_video_tracks.len(), 1);
    assert_eq!(peer.custom_audio_tracks.len(), 1);
    assert_eq!(
        peer.camera_track.as_ref().unwrap().metadata.track_type,
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
    let SdkEvent::TrackUpdated { track, .. } = &updated[0] else {
        panic!("expected trackUpdated");
    };
    assert!(track.metadata.paused);

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
    let SdkEvent::TrackReady { peer_id, track } = &ready[0] else {
        panic!("expected trackReady");
    };
    assert!(track.ready);
    assert_eq!(peer_id, "remote-id");

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
    let SdkEvent::PeerLeft { peer } = &left[0] else {
        panic!("expected peerLeft");
    };
    assert_eq!(peer.id, "remote-id");
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

fn vad(
    track_id: &str,
    status: server::media_event::vad_notification::Status,
) -> server::media_event::Content {
    server::media_event::Content::VadNotification(server::media_event::VadNotification {
        track_id: track_id.to_owned(),
        status: status as i32,
    })
}

#[test]
fn voice_activity_updates_the_remote_track_without_a_room_snapshot() {
    let h = harness("https://example.com");
    join(&h);
    let local_mic = h
        .client
        .add_track(
            TrackKind::Audio,
            TrackMetadata {
                track_type: TrackType::Microphone,
                paused: false,
                display_name: None,
            },
        )
        .unwrap();
    h.events.take();

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
                track_id_to_track: HashMap::from([(
                    "remote-id:mic".to_owned(),
                    track("microphone"),
                )]),
            },
        ));
    h.events.take();

    h.socket.receive_server_event(vad(
        "remote-id:mic",
        server::media_event::vad_notification::Status::Speech,
    ));
    let speech = h.events.take();
    assert_eq!(
        event_names(&speech),
        vec!["trackUpdated", "voiceActivityChanged"]
    );
    let SdkEvent::TrackUpdated { peer_id, track } = &speech[0] else {
        panic!("expected trackUpdated");
    };
    assert_eq!(peer_id, "remote-id");
    assert_eq!(track.vad_status, VadStatus::Speech);
    let SdkEvent::VoiceActivityChanged {
        peer_id,
        track_id,
        vad_status,
    } = &speech[1]
    else {
        panic!("expected voiceActivityChanged");
    };
    assert_eq!(peer_id, "remote-id");
    assert_eq!(track_id, "remote-id:mic");
    assert_eq!(*vad_status, VadStatus::Speech);
    assert_eq!(
        h.client
            .room_state()
            .remote_peers
            .iter()
            .find(|peer| peer.id == "remote-id")
            .unwrap()
            .microphone_track
            .as_ref()
            .unwrap()
            .vad_status,
        VadStatus::Speech
    );

    h.socket.receive_server_event(vad(
        "remote-id:mic",
        server::media_event::vad_notification::Status::Silence,
    ));
    let silence = h.events.take();
    assert_eq!(
        event_names(&silence),
        vec!["trackUpdated", "voiceActivityChanged"]
    );
    let SdkEvent::VoiceActivityChanged { vad_status, .. } = &silence[1] else {
        panic!("expected voiceActivityChanged");
    };
    assert_eq!(*vad_status, VadStatus::Silence);

    h.socket.receive_server_event(vad(
        "missing",
        server::media_event::vad_notification::Status::Speech,
    ));
    assert!(h.events.take().is_empty());

    h.socket.receive_server_event(vad(
        &local_mic,
        server::media_event::vad_notification::Status::Speech,
    ));
    assert!(h.events.take().is_empty());

    h.socket.receive_server_event(vad(
        "remote-id:mic",
        server::media_event::vad_notification::Status::Silence,
    ));
    assert!(h.events.take().is_empty());

    common::capture_logs();
    h.socket.receive_server_event(vad(
        "remote-id:mic",
        server::media_event::vad_notification::Status::Unspecified,
    ));
    assert!(h.events.take().is_empty());
    assert!(common::logs().iter().any(|(level, message)| {
        *level == log::Level::Warn && message.contains("unspecified voice activity")
    }));
    assert_eq!(
        h.client
            .room_state()
            .remote_peers
            .iter()
            .find(|peer| peer.id == "remote-id")
            .unwrap()
            .microphone_track
            .as_ref()
            .unwrap()
            .vad_status,
        VadStatus::Silence
    );
}
