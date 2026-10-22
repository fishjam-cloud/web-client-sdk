use std::collections::HashMap;

use crate::fishjam::media_events::{peer, server, Variant as MediaVariant};
use crate::sdk::{
    NegotiationStatus, PeerState, RoomState, SendEncoding, SimulcastConfig, TrackKind,
    TrackMetadata, TrackState, TrackType, Variant,
};

const KBPS: u32 = 1024;

pub(crate) struct LocalTrack {
    pub id: String,
    pub kind: i32,
    pub metadata: TrackMetadata,
    pub negotiation: i32,
    pub sent_to_connection: bool,
}

pub(crate) struct RemoteTrack {
    pub id: String,
    pub metadata_json: String,
    pub simulcast: SimulcastConfig,
    pub encoding: i32,
    pub ready: bool,
}

pub(crate) struct RemotePeer {
    pub id: String,
    pub metadata_json: String,
    pub tracks: Vec<RemoteTrack>,
}

pub(crate) fn is_peer_type(endpoint_type: &str) -> bool {
    endpoint_type == "webrtc" || endpoint_type == "exwebrtc"
}

pub(crate) fn send_encodings(kind: TrackKind, metadata: &TrackMetadata) -> Vec<SendEncoding> {
    if kind != TrackKind::Video {
        return Vec::new();
    }
    if metadata.r#type() == TrackType::Camera {
        return vec![
            encoding("l", 4.0, 150 * KBPS),
            encoding("m", 2.0, 500 * KBPS),
            encoding("h", 1.0, 1_500 * KBPS),
        ];
    }
    vec![SendEncoding {
        rid: String::new(),
        active: true,
        scale_resolution_down_by: 0.0,
        max_bitrate: 1_500 * KBPS,
    }]
}

pub(crate) fn metadata_json(metadata: &TrackMetadata) -> String {
    let mut value = serde_json::Map::new();
    value.insert(
        "type".to_owned(),
        serde_json::Value::String(track_type_name(metadata.r#type()).to_owned()),
    );
    value.insert(
        "paused".to_owned(),
        serde_json::Value::Bool(metadata.paused),
    );
    if let Some(name) = metadata
        .display_name
        .as_ref()
        .filter(|name| !name.is_empty())
    {
        value.insert(
            "displayName".to_owned(),
            serde_json::Value::String(name.clone()),
        );
    }
    serde_json::Value::Object(value).to_string()
}

pub(crate) fn variant_bitrates(
    kind: TrackKind,
    metadata: &TrackMetadata,
) -> peer::media_event::TrackBitrates {
    let variant_bitrates = if kind == TrackKind::Audio {
        vec![variant_bitrate(MediaVariant::Unspecified, 50_000)]
    } else if metadata.r#type() == TrackType::Camera {
        vec![
            variant_bitrate(MediaVariant::Low, 150 * KBPS as i32),
            variant_bitrate(MediaVariant::Medium, 500 * KBPS as i32),
            variant_bitrate(MediaVariant::High, 1_500 * KBPS as i32),
        ]
    } else {
        vec![variant_bitrate(
            MediaVariant::Unspecified,
            1_500 * KBPS as i32,
        )]
    };
    peer::media_event::TrackBitrates {
        track_id: String::new(),
        variant_bitrates,
    }
}

pub(crate) fn local_simulcast(metadata: &TrackMetadata) -> SimulcastConfig {
    if metadata.r#type() == TrackType::Camera {
        SimulcastConfig {
            enabled: true,
            enabled_variants: vec![
                Variant::Low as i32,
                Variant::Medium as i32,
                Variant::High as i32,
            ],
            disabled_variants: Vec::new(),
        }
    } else {
        SimulcastConfig::default()
    }
}

pub(crate) fn remote_peer(
    id: String,
    metadata_json: String,
    tracks: HashMap<String, server::media_event::Track>,
) -> RemotePeer {
    let mut tracks: Vec<_> = tracks
        .into_iter()
        .map(|(id, track)| RemoteTrack {
            id,
            metadata_json: track.metadata_json,
            simulcast: simulcast_from_server(track.simulcast_config),
            encoding: Variant::Unspecified as i32,
            ready: false,
        })
        .collect();
    tracks.sort_by(|left, right| left.id.cmp(&right.id));
    RemotePeer {
        id,
        metadata_json,
        tracks,
    }
}

pub(crate) fn room_snapshot(
    local_endpoint_id: Option<&str>,
    local_metadata_json: &str,
    local_tracks: &[LocalTrack],
    remote_peers: &[RemotePeer],
) -> RoomState {
    RoomState {
        local_peer: local_endpoint_id.map(|id| {
            peer_state(
                id,
                local_metadata_json,
                local_tracks.iter().map(local_track_state).collect(),
            )
        }),
        remote_peers: remote_peers
            .iter()
            .map(|peer| {
                peer_state(
                    &peer.id,
                    &peer.metadata_json,
                    peer.tracks.iter().map(remote_track_state).collect(),
                )
            })
            .collect(),
    }
}

fn encoding(rid: &str, scale: f64, max_bitrate: u32) -> SendEncoding {
    SendEncoding {
        rid: rid.to_owned(),
        active: true,
        scale_resolution_down_by: scale,
        max_bitrate,
    }
}

fn variant_bitrate(variant: MediaVariant, bitrate: i32) -> peer::media_event::VariantBitrate {
    peer::media_event::VariantBitrate {
        variant: variant as i32,
        bitrate,
    }
}

fn simulcast_from_server(
    config: Option<server::media_event::track::SimulcastConfig>,
) -> SimulcastConfig {
    let Some(config) = config else {
        return SimulcastConfig::default();
    };
    SimulcastConfig {
        enabled: config.enabled,
        enabled_variants: config.enabled_variants,
        disabled_variants: config.disabled_variants,
    }
}

fn local_track_state(track: &LocalTrack) -> TrackState {
    TrackState {
        track_id: track.id.clone(),
        metadata: Some(track.metadata.clone()),
        simulcast_config: Some(local_simulcast(&track.metadata)),
        negotiation_status: track.negotiation,
        encoding: Variant::Unspecified as i32,
        ready: false,
    }
}

pub(crate) fn media_kind(metadata_json: &str) -> Option<TrackKind> {
    match metadata_from_json(metadata_json).r#type() {
        TrackType::Camera | TrackType::ScreenShareVideo | TrackType::CustomVideo => {
            Some(TrackKind::Video)
        }
        TrackType::Microphone | TrackType::ScreenShareAudio | TrackType::CustomAudio => {
            Some(TrackKind::Audio)
        }
        _ => None,
    }
}

fn remote_track_state(track: &RemoteTrack) -> TrackState {
    TrackState {
        track_id: track.id.clone(),
        metadata: Some(metadata_from_json(&track.metadata_json)),
        simulcast_config: Some(track.simulcast.clone()),
        negotiation_status: NegotiationStatus::Done as i32,
        encoding: track.encoding,
        ready: track.ready,
    }
}

fn peer_state(id: &str, metadata_json: &str, tracks: Vec<TrackState>) -> PeerState {
    let mut peer = PeerState {
        id: id.to_owned(),
        metadata_json: metadata_json.to_owned(),
        tracks: tracks.clone(),
        ..Default::default()
    };
    for track in tracks {
        match track.metadata.as_ref().map(|metadata| metadata.r#type()) {
            Some(TrackType::Camera) => peer.camera_track = Some(track),
            Some(TrackType::Microphone) => peer.microphone_track = Some(track),
            Some(TrackType::ScreenShareVideo) => peer.screen_share_video_track = Some(track),
            Some(TrackType::ScreenShareAudio) => peer.screen_share_audio_track = Some(track),
            Some(TrackType::CustomVideo) => peer.custom_video_tracks.push(track),
            Some(TrackType::CustomAudio) => peer.custom_audio_tracks.push(track),
            _ => {}
        }
    }
    peer
}

fn metadata_from_json(json: &str) -> TrackMetadata {
    let value: serde_json::Value = serde_json::from_str(json).unwrap_or_default();
    TrackMetadata {
        r#type: track_type_from_name(
            value
                .get("type")
                .and_then(|value| value.as_str())
                .unwrap_or(""),
        )
        .into(),
        paused: value
            .get("paused")
            .and_then(|value| value.as_bool())
            .unwrap_or(false),
        display_name: value
            .get("displayName")
            .and_then(|value| value.as_str())
            .map(str::to_owned),
    }
}

fn track_type_from_name(name: &str) -> TrackType {
    match name {
        "camera" => TrackType::Camera,
        "microphone" => TrackType::Microphone,
        "screenShareVideo" => TrackType::ScreenShareVideo,
        "screenShareAudio" => TrackType::ScreenShareAudio,
        "customVideo" => TrackType::CustomVideo,
        "customAudio" => TrackType::CustomAudio,
        _ => TrackType::Unspecified,
    }
}

fn track_type_name(track_type: TrackType) -> &'static str {
    match track_type {
        TrackType::Camera => "camera",
        TrackType::Microphone => "microphone",
        TrackType::ScreenShareVideo => "screenShareVideo",
        TrackType::ScreenShareAudio => "screenShareAudio",
        TrackType::CustomVideo => "customVideo",
        TrackType::CustomAudio => "customAudio",
        TrackType::Unspecified => "",
    }
}
