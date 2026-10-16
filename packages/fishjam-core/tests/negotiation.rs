mod common;

use std::collections::HashMap;

use common::{authenticated, connected, harness};
use fishjam_core::fishjam::media_events::{peer, server};
use fishjam_core::sdk::{
    sdk_event, NegotiationStatus, SdpType, SendEncoding, TrackKind, TrackMetadata, TrackType,
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
