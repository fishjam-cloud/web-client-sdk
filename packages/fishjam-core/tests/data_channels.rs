mod common;

use std::collections::HashMap;

use common::{harness, join_and_connect};
use fishjam_core::fishjam::media_events::{channel_message, peer, server, ChannelMessage};
use fishjam_core::sdk::{SdkEvent, TrackKind, TrackMetadata, TrackType};
use fishjam_core::{decode_data_message, FishjamClient};
use prost::Message;

fn renegotiate_count(h: &common::Harness) -> usize {
    h.socket
        .sent_peer_events()
        .into_iter()
        .filter(|event| matches!(event, peer::media_event::Content::RenegotiateTracks(_)))
        .count()
}

fn offer_data() -> server::media_event::Content {
    server::media_event::Content::OfferData(server::media_event::OfferData {
        tracks_types: Some(server::media_event::offer_data::TrackTypes { audio: 0, video: 0 }),
    })
}

fn answer() -> server::media_event::Content {
    server::media_event::Content::SdpAnswer(server::media_event::SdpAnswer {
        sdp: "v=0\r\nanswer".to_owned(),
        mid_to_track_id: HashMap::new(),
    })
}

fn complete_offer(client: &FishjamClient, events: &common::Events) {
    for event in events.take() {
        if matches!(event, SdkEvent::CreateOffer) {
            client.create_offer_result("v=0\r\noffer");
        }
    }
    for event in events.take() {
        if matches!(event, SdkEvent::SetLocalDescription { .. }) {
            client.set_local_description_result(HashMap::new());
        }
    }
}

#[test]
fn create_data_channels_before_join_fails() {
    let h = harness("https://example.com");
    assert!(h.client.create_data_channels().is_err());
    assert_eq!(renegotiate_count(&h), 0);
}

#[test]
fn create_data_channels_asks_the_server_to_renegotiate() {
    let h = harness("https://example.com");
    join_and_connect(&h, "token", r#"{"name":"me"}"#, "local-id");

    h.client.create_data_channels().unwrap();

    assert_eq!(renegotiate_count(&h), 1);
}

#[test]
fn create_data_channels_during_a_renegotiation_asks_again_after_the_answer() {
    let h = harness("https://example.com");
    join_and_connect(&h, "token", r#"{"name":"me"}"#, "local-id");
    h.client
        .add_track(
            TrackKind::Audio,
            TrackMetadata {
                track_type: TrackType::Microphone,
                paused: false,
                display_name: None,
            },
        )
        .unwrap();
    h.socket.receive_server_event(offer_data());
    complete_offer(&h.client, &h.events);

    h.client.create_data_channels().unwrap();
    assert_eq!(renegotiate_count(&h), 1);

    h.socket.receive_server_event(answer());
    assert_eq!(renegotiate_count(&h), 2);
}

#[test]
fn encoded_message_is_a_broadcast_channel_message_from_the_local_peer() {
    let h = harness("https://example.com");
    join_and_connect(&h, "token", r#"{"name":"me"}"#, "local-id");

    let bytes = h.client.encode_data_message(vec![1, 2, 3]);

    let message = ChannelMessage::decode(bytes.as_slice()).unwrap();
    assert_eq!(message.source, "local-id");
    assert_eq!(message.destinations, vec!["*".to_owned()]);
    match message.payload {
        Some(channel_message::Payload::Binary(binary)) => assert_eq!(binary.data, vec![1, 2, 3]),
        other => panic!("unexpected payload {other:?}"),
    }
    assert_eq!(decode_data_message(&bytes), Some(vec![1, 2, 3]));
}

#[test]
fn decode_rejects_invalid_bytes_and_messages_without_binary_payload() {
    assert_eq!(decode_data_message(&[0xff, 0xff, 0xff]), None);
    let empty = ChannelMessage {
        source: "x".to_owned(),
        destinations: vec!["*".to_owned()],
        payload: None,
    }
    .encode_to_vec();
    assert_eq!(decode_data_message(&empty), None);
}
