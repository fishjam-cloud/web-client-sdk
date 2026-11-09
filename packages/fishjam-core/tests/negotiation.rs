mod common;

use std::collections::HashMap;

use common::{authenticated, connected, harness, harness_with_config};
use fishjam_core::fishjam::media_events::Variant as MediaVariant;
use fishjam_core::fishjam::media_events::{peer, server};
use fishjam_core::sdk::{
    sdk_event, BandwidthLimits, ClientConfig, NegotiationStatus, SdpType, SendEncoding, TrackKind,
    TrackMetadata, TrackType, Variant, VideoConfig, VideoSendMode,
};
use fishjam_core::FishjamClient;

const OFFER_SDP: &str = "v=0\r\noffer";
const ANSWER_SDP: &str = "v=0\r\nanswer";

fn metadata(track_type: TrackType) -> TrackMetadata {
    TrackMetadata {
        r#type: track_type as i32,
        paused: false,
        display_name: None,
    }
}

fn pump(
    client: &FishjamClient,
    events: &common::Events,
    mids: HashMap<String, String>,
) -> Vec<sdk_event::Content> {
    let mut seen = Vec::new();
    for _ in 0..16 {
        let batch = events.take();
        if batch.is_empty() {
            break;
        }
        for event in batch {
            let reply_offer = matches!(event, sdk_event::Content::CreateOffer(_));
            let reply_local = matches!(event, sdk_event::Content::SetLocalDescription(_));
            seen.push(event);
            if reply_offer {
                client.create_offer_result(OFFER_SDP);
            }
            if reply_local {
                client.set_local_description_result(mids.clone());
            }
        }
    }
    seen
}

fn join(client: &FishjamClient, socket: &common::MockConnector, events: &common::Events) {
    client.join_room("token", r#"{"name":"me"}"#).unwrap();
    socket.open();
    socket.receive(authenticated(None));
    socket.receive_server_event(connected("local-id"));
    events.take();
}

fn offer_data(audio: i32, video: i32) -> server::media_event::Content {
    server::media_event::Content::OfferData(server::media_event::OfferData {
        tracks_types: Some(server::media_event::offer_data::TrackTypes { audio, video }),
    })
}

fn send_encodings(events: &[sdk_event::Content], track_id: &str) -> Vec<SendEncoding> {
    events
        .iter()
        .find_map(|event| match event {
            sdk_event::Content::AddSendonlyTransceiver(transceiver)
                if transceiver.track_id == track_id =>
            {
                Some(transceiver.send_encodings.clone())
            }
            _ => None,
        })
        .unwrap_or_else(|| panic!("no transceiver for {track_id}"))
}

fn configured(limits: BandwidthLimits, video: VideoConfig) -> common::Harness {
    harness_with_config(ClientConfig {
        fishjam_id: "https://example.com".to_owned(),
        client_type: "android".to_owned(),
        bandwidth_limits: Some(limits),
        video_config: Some(video),
        ..Default::default()
    })
}

fn offer_bitrates(h: &common::Harness, track_id: &str) -> Vec<peer::media_event::VariantBitrate> {
    h.socket
        .sent_peer_events()
        .into_iter()
        .find_map(|event| match event {
            peer::media_event::Content::SdpOffer(offer) => {
                offer.track_id_to_bitrates.get(track_id).cloned()
            }
            _ => None,
        })
        .expect("offer bitrates")
        .variant_bitrates
}

fn bitrate_pairs(bitrates: &[peer::media_event::VariantBitrate]) -> Vec<(i32, i32)> {
    bitrates
        .iter()
        .map(|entry| (entry.variant, entry.bitrate))
        .collect()
}

fn latest_track_bitrates(h: &common::Harness, track_id: &str) -> Vec<(i32, i32)> {
    let bitrates = h
        .socket
        .sent_peer_events()
        .into_iter()
        .rev()
        .find_map(|event| match event {
            peer::media_event::Content::TrackBitrates(bitrates)
                if bitrates.track_id == track_id =>
            {
                Some(bitrates.variant_bitrates)
            }
            _ => None,
        })
        .expect("track bitrates");
    bitrate_pairs(&bitrates)
}

fn updated_encodings(events: &[sdk_event::Content], track_id: &str) -> Vec<SendEncoding> {
    events
        .iter()
        .rev()
        .find_map(|event| match event {
            sdk_event::Content::UpdateSendEncodings(update) if update.track_id == track_id => {
                Some(update.send_encodings.clone())
            }
            _ => None,
        })
        .unwrap_or_else(|| panic!("no encoding update for {track_id}"))
}

#[test]
fn offer_with_no_local_tracks_sets_the_offer_sdp() {
    let h = harness("https://example.com");
    join(&h.client, &h.socket, &h.events);
    h.socket.receive_server_event(offer_data(0, 0));

    let events = pump(&h.client, &h.events, HashMap::new());

    assert!(events
        .iter()
        .any(|event| matches!(event, sdk_event::Content::CreatePeerConnection(_))));
    assert!(events
        .iter()
        .any(|event| matches!(event, sdk_event::Content::CreateOffer(_))));
    let local = events.iter().find_map(|event| match event {
        sdk_event::Content::SetLocalDescription(description) => Some(description),
        _ => None,
    });
    let local = local.expect("set local description");
    assert_eq!(local.r#type(), SdpType::Offer);
    assert_eq!(local.sdp, OFFER_SDP);
}

#[test]
fn audio_track_has_no_simulcast_encodings() {
    let h = harness("https://example.com");
    join(&h.client, &h.socket, &h.events);
    let track_id = h
        .client
        .add_track(TrackKind::Audio, metadata(TrackType::Microphone))
        .unwrap();
    h.socket.receive_server_event(offer_data(0, 0));

    let events = pump(
        &h.client,
        &h.events,
        HashMap::from([("0".into(), track_id.clone())]),
    );
    assert!(send_encodings(&events, &track_id).is_empty());
}

#[test]
fn video_without_simulcast_has_one_encoding() {
    let h = harness("https://example.com");
    join(&h.client, &h.socket, &h.events);
    let track_id = h
        .client
        .add_track(TrackKind::Video, metadata(TrackType::CustomVideo))
        .unwrap();
    h.socket.receive_server_event(offer_data(0, 0));

    let encodings = send_encodings(
        &pump(
            &h.client,
            &h.events,
            HashMap::from([("0".into(), track_id.clone())]),
        ),
        &track_id,
    );
    assert_eq!(encodings.len(), 1);
    assert_eq!(encodings[0].max_bitrate, 1_500 * 1024);
}

#[test]
fn camera_video_uses_low_medium_and_high_encodings() {
    let h = harness("https://example.com");
    join(&h.client, &h.socket, &h.events);
    let track_id = h
        .client
        .add_track(TrackKind::Video, metadata(TrackType::Camera))
        .unwrap();
    h.socket.receive_server_event(offer_data(0, 0));

    let encodings = send_encodings(
        &pump(
            &h.client,
            &h.events,
            HashMap::from([("0".into(), track_id.clone())]),
        ),
        &track_id,
    );
    assert_eq!(
        encodings
            .iter()
            .map(|encoding| encoding.rid.as_str())
            .collect::<Vec<_>>(),
        vec!["l", "m", "h"]
    );
    assert_eq!(encodings[0].scale_resolution_down_by, 4.0);
    assert_eq!(encodings[1].scale_resolution_down_by, 2.0);
    assert_eq!(encodings[2].scale_resolution_down_by, 1.0);
    assert_eq!(encodings[0].max_bitrate, 150 * 1024);
    assert_eq!(encodings[1].max_bitrate, 500 * 1024);
    assert_eq!(encodings[2].max_bitrate, 1_500 * 1024);
    assert!(encodings.iter().all(|encoding| encoding.active));
    assert_eq!(
        bitrate_pairs(&offer_bitrates(&h, &track_id)),
        vec![
            (MediaVariant::Low as i32, 150 * 1024),
            (MediaVariant::Medium as i32, 500 * 1024),
            (MediaVariant::High as i32, 1_500 * 1024),
        ]
    );
}

#[test]
fn both_audio_and_video_are_in_one_offer() {
    let h = harness("https://example.com");
    join(&h.client, &h.socket, &h.events);
    let audio = h
        .client
        .add_track(TrackKind::Audio, metadata(TrackType::Microphone))
        .unwrap();
    let video = h
        .client
        .add_track(TrackKind::Video, metadata(TrackType::Camera))
        .unwrap();
    h.events.take();
    h.socket.receive_server_event(offer_data(1, 1));

    let events = pump(
        &h.client,
        &h.events,
        HashMap::from([("0".into(), audio.clone()), ("1".into(), video.clone())]),
    );
    let track_ids: Vec<_> = events
        .iter()
        .filter_map(|event| match event {
            sdk_event::Content::AddSendonlyTransceiver(transceiver) => {
                Some(transceiver.track_id.clone())
            }
            _ => None,
        })
        .collect();
    assert_eq!(track_ids, vec![audio, video]);
    let update = events.iter().find_map(|event| match event {
        sdk_event::Content::UpdateRecvonlyTransceivers(update) => Some(update),
        _ => None,
    });
    let update = update.expect("recv transceivers");
    assert_eq!(update.audio_to_add, 1);
    assert_eq!(update.video_to_add, 1);
}

#[test]
fn sdp_answer_becomes_set_remote_description() {
    let h = harness("https://example.com");
    join(&h.client, &h.socket, &h.events);
    let track_id = h
        .client
        .add_track(TrackKind::Audio, metadata(TrackType::Microphone))
        .unwrap();
    h.socket.receive_server_event(offer_data(0, 0));
    pump(
        &h.client,
        &h.events,
        HashMap::from([("0".into(), track_id.clone())]),
    );

    let mut mid_to_track_id = HashMap::new();
    mid_to_track_id.insert("0".to_owned(), track_id);
    h.socket
        .receive_server_event(server::media_event::Content::SdpAnswer(
            server::media_event::SdpAnswer {
                sdp: ANSWER_SDP.to_owned(),
                mid_to_track_id: mid_to_track_id.clone(),
            },
        ));

    let remote = h.events.take().into_iter().find_map(|event| match event {
        sdk_event::Content::SetRemoteDescription(description) => Some(description),
        _ => None,
    });
    let remote = remote.expect("set remote description");
    assert_eq!(remote.r#type(), SdpType::Answer);
    assert_eq!(remote.sdp, ANSWER_SDP);
    assert_eq!(remote.mid_to_track_id, mid_to_track_id);
}

#[test]
fn negotiation_status_moves_from_awaiting_to_offered_to_done() {
    let h = harness("https://example.com");
    join(&h.client, &h.socket, &h.events);
    let track_id = h
        .client
        .add_track(TrackKind::Audio, metadata(TrackType::Microphone))
        .unwrap();
    let local = h.client.room_state().local_peer.expect("local peer");
    assert_eq!(
        local.microphone_track.unwrap().negotiation_status(),
        NegotiationStatus::Awaiting
    );

    h.socket.receive_server_event(offer_data(0, 0));
    pump(
        &h.client,
        &h.events,
        HashMap::from([("0".into(), track_id.clone())]),
    );
    let local = h.client.room_state().local_peer.expect("local peer");
    assert_eq!(
        local.microphone_track.unwrap().negotiation_status(),
        NegotiationStatus::Offered
    );

    h.socket
        .receive_server_event(server::media_event::Content::SdpAnswer(
            server::media_event::SdpAnswer {
                sdp: ANSWER_SDP.to_owned(),
                mid_to_track_id: HashMap::from([("0".into(), track_id)]),
            },
        ));
    h.events.take();
    let local = h.client.room_state().local_peer.expect("local peer");
    assert_eq!(
        local.microphone_track.unwrap().negotiation_status(),
        NegotiationStatus::Done
    );
}

#[test]
fn remote_peer_arriving_during_negotiation_updates_room_state_without_another_renegotiate() {
    let h = harness("https://example.com");
    join(&h.client, &h.socket, &h.events);
    h.client
        .add_track(TrackKind::Audio, metadata(TrackType::Microphone))
        .unwrap();
    let sent_before = h.socket.sent_peer_events().len();

    h.socket
        .receive_server_event(server::media_event::Content::EndpointAdded(
            server::media_event::EndpointAdded {
                endpoint_id: "remote-id".to_owned(),
                metadata_json: r#"{"peer":{"name":"bob"},"server":{}}"#.to_owned(),
            },
        ));
    h.socket
        .receive_server_event(server::media_event::Content::TracksAdded(
            server::media_event::TracksAdded {
                endpoint_id: "remote-id".to_owned(),
                track_id_to_track: HashMap::from([(
                    "remote-id:track".to_owned(),
                    server::media_event::Track {
                        metadata_json: r#"{"type":"camera","paused":false}"#.to_owned(),
                        simulcast_config: None,
                    },
                )]),
            },
        ));

    let room = h.client.room_state();
    assert_eq!(room.remote_peers.len(), 1);
    assert_eq!(room.remote_peers[0].id, "remote-id");
    assert!(room.remote_peers[0].camera_track.is_some());
    let renegotiates = h
        .socket
        .sent_peer_events()
        .into_iter()
        .skip(sent_before)
        .filter(|event| matches!(event, peer::media_event::Content::RenegotiateTracks(_)))
        .count();
    assert_eq!(renegotiates, 0);
}

#[test]
fn removing_a_remote_peer_and_track_updates_room_state() {
    let h = harness("https://example.com");
    join(&h.client, &h.socket, &h.events);
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
                    (
                        "remote-id:cam".to_owned(),
                        server::media_event::Track {
                            metadata_json: r#"{"type":"camera","paused":false}"#.to_owned(),
                            simulcast_config: None,
                        },
                    ),
                    (
                        "remote-id:mic".to_owned(),
                        server::media_event::Track {
                            metadata_json: r#"{"type":"microphone","paused":false}"#.to_owned(),
                            simulcast_config: None,
                        },
                    ),
                ]),
            },
        ));
    let sent_before = h.socket.sent_peer_events().len();

    h.socket
        .receive_server_event(server::media_event::Content::TracksRemoved(
            server::media_event::TracksRemoved {
                endpoint_id: "remote-id".to_owned(),
                track_ids: vec!["remote-id:cam".to_owned()],
            },
        ));

    let room = h.client.room_state();
    assert_eq!(room.remote_peers.len(), 1);
    assert!(room.remote_peers[0].camera_track.is_none());
    assert!(room.remote_peers[0].microphone_track.is_some());

    h.socket
        .receive_server_event(server::media_event::Content::EndpointRemoved(
            server::media_event::EndpointRemoved {
                endpoint_id: "remote-id".to_owned(),
            },
        ));
    assert!(h.client.room_state().remote_peers.is_empty());
    let renegotiates = h
        .socket
        .sent_peer_events()
        .into_iter()
        .skip(sent_before)
        .filter(|event| matches!(event, peer::media_event::Content::RenegotiateTracks(_)))
        .count();
    assert_eq!(renegotiates, 0);
}

#[test]
fn second_local_track_during_negotiation_does_not_send_another_renegotiate() {
    let h = harness("https://example.com");
    join(&h.client, &h.socket, &h.events);
    h.client
        .add_track(TrackKind::Audio, metadata(TrackType::Microphone))
        .unwrap();
    h.client
        .add_track(TrackKind::Video, metadata(TrackType::Camera))
        .unwrap();

    let renegotiates = h
        .socket
        .sent_peer_events()
        .into_iter()
        .filter(|event| matches!(event, peer::media_event::Content::RenegotiateTracks(_)))
        .count();
    assert_eq!(renegotiates, 1);
}

#[test]
fn local_track_added_after_the_offer_gets_its_own_renegotiation() {
    let h = harness("https://example.com");
    join(&h.client, &h.socket, &h.events);
    // A peer who publishes right after joining can land here: the server already started a
    // cycle so the room's existing tracks can be received, and the offer is gone by now.
    h.socket
        .receive_server_event(server::media_event::Content::TracksAdded(
            server::media_event::TracksAdded {
                endpoint_id: "remote-id".to_owned(),
                track_id_to_track: HashMap::from([(
                    "remote-id:track".to_owned(),
                    server::media_event::Track {
                        metadata_json: r#"{"type":"camera","paused":false}"#.to_owned(),
                        simulcast_config: None,
                    },
                )]),
            },
        ));
    h.socket.receive_server_event(offer_data(0, 1));
    pump(&h.client, &h.events, HashMap::new());
    let track_id = h
        .client
        .add_track(TrackKind::Video, metadata(TrackType::Camera))
        .unwrap();
    let sent_before = h.socket.sent_peer_events().len();

    h.socket
        .receive_server_event(server::media_event::Content::SdpAnswer(
            server::media_event::SdpAnswer {
                sdp: ANSWER_SDP.to_owned(),
                mid_to_track_id: HashMap::from([("0".to_owned(), "remote-id:track".to_owned())]),
            },
        ));

    let renegotiates = h
        .socket
        .sent_peer_events()
        .into_iter()
        .skip(sent_before)
        .filter(|event| matches!(event, peer::media_event::Content::RenegotiateTracks(_)))
        .count();
    assert_eq!(renegotiates, 1);

    h.socket.receive_server_event(offer_data(0, 1));
    let added = h.events.take().into_iter().any(|event| match event {
        sdk_event::Content::AddSendonlyTransceiver(request) => request.track_id == track_id,
        _ => false,
    });
    assert!(added, "the stranded track is offered in the next cycle");
}

#[test]
fn add_track_before_connected_returns_an_error() {
    let h = harness("https://example.com");
    let error = h
        .client
        .add_track(TrackKind::Audio, metadata(TrackType::Microphone))
        .unwrap_err();
    assert!(error.message.contains("accepted"));
}

#[test]
fn sdp_offer_includes_the_mid_map_from_the_sdk() {
    let h = harness("https://example.com");
    join(&h.client, &h.socket, &h.events);
    let track_id = h
        .client
        .add_track(TrackKind::Audio, metadata(TrackType::Microphone))
        .unwrap();
    h.socket.receive_server_event(offer_data(0, 0));
    let mids = HashMap::from([("0".to_owned(), track_id.clone())]);
    pump(&h.client, &h.events, mids.clone());

    let offer = h
        .socket
        .sent_peer_events()
        .into_iter()
        .find_map(|event| match event {
            peer::media_event::Content::SdpOffer(offer) => Some(offer),
            _ => None,
        });
    let offer = offer.expect("sdp offer");
    assert_eq!(offer.sdp, OFFER_SDP);
    assert_eq!(offer.mid_to_track_id, mids);
    assert!(offer.track_id_to_metadata_json.contains_key(&track_id));
    assert!(offer.track_id_to_bitrates.contains_key(&track_id));
}

#[test]
fn rejoining_remote_peer_gets_a_new_recv_transceiver() {
    let h = harness("https://example.com");
    join(&h.client, &h.socket, &h.events);
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
                    "remote-id:cam".to_owned(),
                    server::media_event::Track {
                        metadata_json: r#"{"type":"camera","paused":false}"#.to_owned(),
                        simulcast_config: None,
                    },
                )]),
            },
        ));
    h.socket.receive_server_event(offer_data(0, 1));
    pump(&h.client, &h.events, HashMap::new());
    h.socket
        .receive_server_event(server::media_event::Content::SdpAnswer(
            server::media_event::SdpAnswer {
                sdp: ANSWER_SDP.to_owned(),
                mid_to_track_id: HashMap::from([("0".to_owned(), "remote-id:cam".to_owned())]),
            },
        ));
    h.events.take();

    h.socket
        .receive_server_event(server::media_event::Content::TracksRemoved(
            server::media_event::TracksRemoved {
                endpoint_id: "remote-id".to_owned(),
                track_ids: vec!["remote-id:cam".to_owned()],
            },
        ));
    h.socket
        .receive_server_event(server::media_event::Content::EndpointRemoved(
            server::media_event::EndpointRemoved {
                endpoint_id: "remote-id".to_owned(),
            },
        ));
    h.socket.receive_server_event(offer_data(0, 0));
    let stopped = pump(&h.client, &h.events, HashMap::new());
    let stopped = stopped.iter().find_map(|event| match event {
        sdk_event::Content::UpdateRecvonlyTransceivers(update) => Some(update),
        _ => None,
    });
    let stopped = stopped.expect("stop the old receive transceiver");
    assert_eq!(stopped.mids_to_stop, vec!["0".to_owned()]);
    assert_eq!(stopped.video_to_add, 0);

    h.socket
        .receive_server_event(server::media_event::Content::EndpointAdded(
            server::media_event::EndpointAdded {
                endpoint_id: "remote-id-2".to_owned(),
                metadata_json: "{}".to_owned(),
            },
        ));
    h.socket
        .receive_server_event(server::media_event::Content::TracksAdded(
            server::media_event::TracksAdded {
                endpoint_id: "remote-id-2".to_owned(),
                track_id_to_track: HashMap::from([(
                    "remote-id-2:cam".to_owned(),
                    server::media_event::Track {
                        metadata_json: r#"{"type":"camera","paused":false}"#.to_owned(),
                        simulcast_config: None,
                    },
                )]),
            },
        ));
    h.socket.receive_server_event(offer_data(0, 1));
    let rejoined = pump(&h.client, &h.events, HashMap::new());
    let rejoined = rejoined.iter().find_map(|event| match event {
        sdk_event::Content::UpdateRecvonlyTransceivers(update) => Some(update),
        _ => None,
    });
    let rejoined = rejoined.expect("add a receive transceiver for the new camera");
    assert_eq!(rejoined.video_to_add, 1);
    assert!(rejoined.mids_to_stop.is_empty());
    let room = h.client.room_state();
    assert_eq!(room.remote_peers.len(), 1);
    assert!(room.remote_peers[0].camera_track.is_some());
}

#[test]
fn a_lower_app_limit_is_encoded_and_reported() {
    let h = configured(
        BandwidthLimits {
            single_stream_kbps: 800,
            low_kbps: 100,
            ..Default::default()
        },
        VideoConfig::default(),
    );
    join(&h.client, &h.socket, &h.events);
    let camera = h
        .client
        .add_track(TrackKind::Video, metadata(TrackType::Camera))
        .unwrap();
    let custom = h
        .client
        .add_track(TrackKind::Video, metadata(TrackType::CustomVideo))
        .unwrap();
    h.socket.receive_server_event(offer_data(0, 0));
    let events = pump(
        &h.client,
        &h.events,
        HashMap::from([("0".into(), camera.clone()), ("1".into(), custom.clone())]),
    );

    let camera_encodings = send_encodings(&events, &camera);
    assert_eq!(camera_encodings[0].max_bitrate, 100 * 1024);
    assert_eq!(camera_encodings[1].max_bitrate, 500 * 1024);
    assert_eq!(camera_encodings[2].max_bitrate, 1_500 * 1024);
    assert_eq!(send_encodings(&events, &custom)[0].max_bitrate, 800 * 1024);
    assert_eq!(
        bitrate_pairs(&offer_bitrates(&h, &custom)),
        vec![(MediaVariant::Unspecified as i32, 800 * 1024)]
    );
    assert_eq!(
        bitrate_pairs(&offer_bitrates(&h, &camera)),
        vec![
            (MediaVariant::Low as i32, 100 * 1024),
            (MediaVariant::Medium as i32, 500 * 1024),
            (MediaVariant::High as i32, 1_500 * 1024),
        ]
    );
}

#[test]
fn a_limit_above_the_cap_is_clamped() {
    let h = configured(
        BandwidthLimits {
            single_stream_kbps: 2_000,
            medium_kbps: 900,
            ..Default::default()
        },
        VideoConfig::default(),
    );
    join(&h.client, &h.socket, &h.events);
    let camera = h
        .client
        .add_track(TrackKind::Video, metadata(TrackType::Camera))
        .unwrap();
    let custom = h
        .client
        .add_track(TrackKind::Video, metadata(TrackType::CustomVideo))
        .unwrap();
    h.socket.receive_server_event(offer_data(0, 0));
    let events = pump(
        &h.client,
        &h.events,
        HashMap::from([("0".into(), camera.clone()), ("1".into(), custom.clone())]),
    );

    let camera_encodings = send_encodings(&events, &camera);
    assert_eq!(camera_encodings[1].max_bitrate, 500 * 1024);
    assert_eq!(
        send_encodings(&events, &custom)[0].max_bitrate,
        1_500 * 1024
    );
}

#[test]
fn sent_qualities_leave_the_omitted_layer_inactive() {
    let h = configured(
        BandwidthLimits::default(),
        VideoConfig {
            mode: VideoSendMode::Simulcast as i32,
            sent_qualities: vec![Variant::Low as i32, Variant::High as i32],
        },
    );
    join(&h.client, &h.socket, &h.events);
    let track_id = h
        .client
        .add_track(TrackKind::Video, metadata(TrackType::Camera))
        .unwrap();
    let local = h.client.room_state().local_peer.expect("local peer");
    let simulcast = local.camera_track.unwrap().simulcast_config.unwrap();
    assert!(simulcast.enabled);
    assert_eq!(
        simulcast.enabled_variants,
        vec![Variant::Low as i32, Variant::High as i32]
    );
    assert_eq!(simulcast.disabled_variants, vec![Variant::Medium as i32]);

    h.socket.receive_server_event(offer_data(0, 0));
    let encodings = send_encodings(
        &pump(
            &h.client,
            &h.events,
            HashMap::from([("0".into(), track_id)]),
        ),
        &h.client
            .room_state()
            .local_peer
            .unwrap()
            .camera_track
            .unwrap()
            .track_id,
    );
    assert!(encodings[0].active);
    assert!(!encodings[1].active);
    assert!(encodings[2].active);
}

#[test]
fn single_mode_sends_the_camera_as_one_encoding() {
    let h = configured(
        BandwidthLimits::default(),
        VideoConfig {
            mode: VideoSendMode::Single as i32,
            sent_qualities: vec![],
        },
    );
    join(&h.client, &h.socket, &h.events);
    let track_id = h
        .client
        .add_track(TrackKind::Video, metadata(TrackType::Camera))
        .unwrap();
    h.socket.receive_server_event(offer_data(0, 0));
    let encodings = send_encodings(
        &pump(
            &h.client,
            &h.events,
            HashMap::from([("0".into(), track_id.clone())]),
        ),
        &track_id,
    );
    assert_eq!(encodings.len(), 1);
    assert_eq!(encodings[0].rid, "");
    assert_eq!(encodings[0].max_bitrate, 1_500 * 1024);
    assert_eq!(
        bitrate_pairs(&offer_bitrates(&h, &track_id)),
        vec![(MediaVariant::Unspecified as i32, 1_500 * 1024)]
    );
}

#[test]
fn a_single_number_on_a_simulcast_camera_is_split_across_layers() {
    let h = harness("https://example.com");
    join(&h.client, &h.socket, &h.events);
    let track_id = h
        .client
        .add_track(TrackKind::Video, metadata(TrackType::Camera))
        .unwrap();
    h.client
        .set_track_bandwidth(&track_id, Some(1_500), Vec::new())
        .unwrap();
    h.socket.receive_server_event(offer_data(0, 0));
    let events = pump(
        &h.client,
        &h.events,
        HashMap::from([("0".into(), track_id.clone())]),
    );
    let encodings = send_encodings(&events, &track_id);
    assert!(
        !events
            .iter()
            .any(|event| matches!(event, sdk_event::Content::UpdateSendEncodings(_))),
        "the sender does not exist yet, so the next offer carries the limit"
    );
    assert_eq!(encodings[0].max_bitrate, 71 * 1024);
    assert_eq!(encodings[1].max_bitrate, 286 * 1024);
    assert_eq!(encodings[2].max_bitrate, 1_143 * 1024);
    assert_eq!(
        bitrate_pairs(&offer_bitrates(&h, &track_id)),
        vec![
            (MediaVariant::Low as i32, 71 * 1024),
            (MediaVariant::Medium as i32, 286 * 1024),
            (MediaVariant::High as i32, 1_143 * 1024),
        ]
    );
}

#[test]
fn changing_bandwidth_after_the_sender_exists_updates_it_and_reports_it() {
    let h = harness("https://example.com");
    join(&h.client, &h.socket, &h.events);
    let track_id = h
        .client
        .add_track(TrackKind::Video, metadata(TrackType::Camera))
        .unwrap();
    h.socket.receive_server_event(offer_data(0, 0));
    h.events.take();

    h.client
        .set_track_bandwidth(
            &track_id,
            None,
            vec![
                (Variant::Low as i32, 100),
                (Variant::Medium as i32, 900),
                (Variant::High as i32, 2_000),
            ],
        )
        .unwrap();
    let events = h.events.take();
    let encodings = updated_encodings(&events, &track_id);
    assert_eq!(encodings[0].max_bitrate, 100 * 1024);
    assert_eq!(encodings[1].max_bitrate, 500 * 1024);
    assert_eq!(encodings[2].max_bitrate, 1_500 * 1024);
    assert_eq!(
        latest_track_bitrates(&h, &track_id),
        vec![
            (MediaVariant::Low as i32, 100 * 1024),
            (MediaVariant::Medium as i32, 500 * 1024),
            (MediaVariant::High as i32, 1_500 * 1024),
        ]
    );

    h.client
        .set_encoding_bandwidth(&track_id, Variant::High as i32, 800)
        .unwrap();
    let encodings = updated_encodings(&h.events.take(), &track_id);
    assert_eq!(encodings[2].max_bitrate, 800 * 1024);
    assert_eq!(latest_track_bitrates(&h, &track_id)[2].1, 800 * 1024);
}

#[test]
fn a_layer_list_on_audio_is_rejected() {
    let h = harness("https://example.com");
    join(&h.client, &h.socket, &h.events);
    let track_id = h
        .client
        .add_track(TrackKind::Audio, metadata(TrackType::Microphone))
        .unwrap();
    let error = h
        .client
        .set_track_bandwidth(&track_id, None, vec![(Variant::Low as i32, 10)])
        .unwrap_err();
    assert!(error.message.contains("audio"));
}

#[test]
fn set_received_quality_sends_the_target_and_rejects_a_bad_choice() {
    let h = harness("https://example.com");
    join(&h.client, &h.socket, &h.events);
    let missing = h
        .client
        .set_target_track_variant("missing", Variant::Low as i32)
        .unwrap_err();
    assert!(missing.message.contains("Cannot find"));

    add_remote_camera(
        &h,
        "remote-id:mic",
        r#"{"type":"microphone","paused":false}"#,
        None,
    );
    let before = h.socket.sent_peer_events().len();
    let not_simulcast = h
        .client
        .set_target_track_variant("remote-id:mic", Variant::Low as i32)
        .unwrap_err();
    assert!(not_simulcast.message.contains("not simulcast"));
    assert_eq!(h.socket.sent_peer_events().len(), before);

    add_remote_camera(
        &h,
        "remote-id:cam",
        r#"{"type":"camera","paused":false}"#,
        Some(server::media_event::track::SimulcastConfig {
            enabled: true,
            enabled_variants: vec![Variant::Low as i32, Variant::Medium as i32],
            disabled_variants: vec![Variant::High as i32],
        }),
    );
    let disabled = h
        .client
        .set_target_track_variant("remote-id:cam", Variant::High as i32)
        .unwrap_err();
    assert!(disabled.message.contains("not enabled"));
    assert_eq!(h.socket.sent_peer_events().len(), before);

    h.client
        .set_target_track_variant("remote-id:cam", Variant::Low as i32)
        .unwrap();
    let sent = h
        .socket
        .sent_peer_events()
        .into_iter()
        .rev()
        .find_map(|event| match event {
            peer::media_event::Content::SetTargetTrackVariant(request) => Some(request),
            _ => None,
        });
    let sent = sent.expect("set target variant");
    assert_eq!(sent.track_id, "remote-id:cam");
    assert_eq!(sent.variant, Variant::Low as i32);
    let room = h.client.room_state();
    assert_eq!(
        room.remote_peers[0].camera_track.as_ref().unwrap().encoding(),
        Variant::Unspecified
    );
}

#[test]
fn track_variant_switched_emits_track_updated_with_that_variant() {
    let h = harness("https://example.com");
    join(&h.client, &h.socket, &h.events);
    add_remote_camera(
        &h,
        "remote-id:cam",
        r#"{"type":"camera","paused":false}"#,
        Some(server::media_event::track::SimulcastConfig {
            enabled: true,
            enabled_variants: vec![
                Variant::Low as i32,
                Variant::Medium as i32,
                Variant::High as i32,
            ],
            disabled_variants: vec![],
        }),
    );
    h.socket
        .receive_server_event(server::media_event::Content::TrackVariantSwitched(
            server::media_event::TrackVariantSwitched {
                endpoint_id: "remote-id".to_owned(),
                track_id: "remote-id:cam".to_owned(),
                variant: MediaVariant::Medium as i32,
            },
        ));
    let updated = h.events.take().into_iter().find_map(|event| match event {
        sdk_event::Content::TrackUpdated(updated) => updated.track,
        _ => None,
    });
    let updated = updated.expect("track updated");
    assert_eq!(updated.encoding(), Variant::Medium);
    let room = h.client.room_state();
    assert_eq!(
        room.remote_peers[0].camera_track.as_ref().unwrap().encoding(),
        Variant::Medium
    );
}

#[test]
fn track_variant_disabled_moves_the_variant_to_the_disabled_list() {
    let h = harness("https://example.com");
    join(&h.client, &h.socket, &h.events);
    add_remote_camera(
        &h,
        "remote-id:cam",
        r#"{"type":"camera","paused":false}"#,
        Some(server::media_event::track::SimulcastConfig {
            enabled: true,
            enabled_variants: vec![
                Variant::Low as i32,
                Variant::Medium as i32,
                Variant::High as i32,
            ],
            disabled_variants: vec![],
        }),
    );
    h.socket
        .receive_server_event(server::media_event::Content::TrackVariantDisabled(
            server::media_event::TrackVariantDisabled {
                endpoint_id: "remote-id".to_owned(),
                track_id: "remote-id:cam".to_owned(),
                variant: MediaVariant::High as i32,
            },
        ));
    let updated = h.events.take().into_iter().find_map(|event| match event {
        sdk_event::Content::TrackUpdated(updated) => updated.track,
        _ => None,
    });
    let config = updated.expect("track updated").simulcast_config.unwrap();
    assert_eq!(
        config.enabled_variants,
        vec![Variant::Low as i32, Variant::Medium as i32]
    );
    assert_eq!(config.disabled_variants, vec![Variant::High as i32]);
    let error = h
        .client
        .set_target_track_variant("remote-id:cam", Variant::High as i32)
        .unwrap_err();
    assert!(error.message.contains("not enabled"));
}

fn add_remote_camera(
    h: &common::Harness,
    track_id: &str,
    metadata_json: &str,
    simulcast: Option<server::media_event::track::SimulcastConfig>,
) {
    let endpoint_id = track_id.split(':').next().unwrap();
    h.socket
        .receive_server_event(server::media_event::Content::EndpointAdded(
            server::media_event::EndpointAdded {
                endpoint_id: endpoint_id.to_owned(),
                metadata_json: "{}".to_owned(),
            },
        ));
    h.socket
        .receive_server_event(server::media_event::Content::TracksAdded(
            server::media_event::TracksAdded {
                endpoint_id: endpoint_id.to_owned(),
                track_id_to_track: HashMap::from([(
                    track_id.to_owned(),
                    server::media_event::Track {
                        metadata_json: metadata_json.to_owned(),
                        simulcast_config: simulcast,
                    },
                )]),
            },
        ));
    h.events.take();
}
