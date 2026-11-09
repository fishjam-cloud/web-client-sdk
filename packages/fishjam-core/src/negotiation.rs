use std::collections::HashMap;

use crate::fishjam::media_events::{peer, server, Variant as MediaVariant};
use crate::sdk::{
    BandwidthLimits, NegotiationStatus, PeerState, RoomState, SendEncoding, SimulcastConfig,
    TrackKind, TrackMetadata, TrackState, TrackType, Variant, VideoConfig, VideoSendMode,
};

const KBPS: u32 = 1024;
const SINGLE_STREAM_CAP_KBPS: u32 = 1500;
const LOW_CAP_KBPS: u32 = 150;
const MEDIUM_CAP_KBPS: u32 = 500;
const HIGH_CAP_KBPS: u32 = 1500;
const AUDIO_DEFAULT_BPS: i32 = 50_000;

/// Resolved outgoing limit. A single `0` on audio means "report the default".
/// Video values are already clamped to the caps, in kbps.
#[derive(Clone, Copy)]
pub(crate) enum TrackBandwidth {
    Single(u32),
    Layers { low: u32, medium: u32, high: u32 },
}

pub(crate) struct LocalTrack {
    pub id: String,
    pub kind: i32,
    pub metadata: TrackMetadata,
    pub negotiation: i32,
    pub sent_to_connection: bool,
    pub simulcast: bool,
    /// Layers with `active = true`, in low, medium, high order. Empty when
    /// `simulcast` is false.
    pub active_variants: Vec<i32>,
    pub bandwidth: TrackBandwidth,
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

pub(crate) fn new_local_track(
    id: String,
    kind: TrackKind,
    metadata: TrackMetadata,
    limits: &BandwidthLimits,
    video: &VideoConfig,
) -> LocalTrack {
    let (simulcast, active_variants, bandwidth) = initial_bandwidth(kind, &metadata, limits, video);
    LocalTrack {
        id,
        kind: kind as i32,
        metadata,
        negotiation: NegotiationStatus::Awaiting as i32,
        sent_to_connection: false,
        simulcast,
        active_variants,
        bandwidth,
    }
}

pub(crate) fn send_encodings(track: &LocalTrack) -> Vec<SendEncoding> {
    let kind = TrackKind::try_from(track.kind).unwrap_or(TrackKind::Unspecified);
    if kind != TrackKind::Video {
        return Vec::new();
    }
    if let TrackBandwidth::Layers { low, medium, high } = track.bandwidth {
        if track.simulcast {
            return vec![
                encoding(
                    "l",
                    4.0,
                    low,
                    track.active_variants.contains(&(Variant::Low as i32)),
                ),
                encoding(
                    "m",
                    2.0,
                    medium,
                    track.active_variants.contains(&(Variant::Medium as i32)),
                ),
                encoding(
                    "h",
                    1.0,
                    high,
                    track.active_variants.contains(&(Variant::High as i32)),
                ),
            ];
        }
    }
    let kbps = match track.bandwidth {
        TrackBandwidth::Single(kbps) => kbps,
        TrackBandwidth::Layers { high, .. } => high,
    };
    vec![SendEncoding {
        rid: String::new(),
        active: true,
        scale_resolution_down_by: 0.0,
        max_bitrate: kbps.saturating_mul(KBPS),
    }]
}

/// Writes a track-wide limit. A per-layer list on audio, or on a track that
/// sends one encoding, is an error. `0` on video means that limit's cap.
pub(crate) fn apply_track_bandwidth(
    track: &mut LocalTrack,
    single_kbps: Option<u32>,
    layers: &[(i32, u32)],
) -> Result<(), String> {
    let kind = TrackKind::try_from(track.kind).unwrap_or(TrackKind::Unspecified);
    if kind != TrackKind::Video {
        if !layers.is_empty() {
            return Err("An audio track expects a single bandwidth limit".to_owned());
        }
        track.bandwidth = TrackBandwidth::Single(single_kbps.unwrap_or(0));
        return Ok(());
    }
    if track.simulcast {
        track.bandwidth = if layers.is_empty() {
            split_or_caps(single_kbps.unwrap_or(0))
        } else {
            TrackBandwidth::Layers {
                low: layer_limit(layers, Variant::Low),
                medium: layer_limit(layers, Variant::Medium),
                high: layer_limit(layers, Variant::High),
            }
        };
        return Ok(());
    }
    if !layers.is_empty() {
        return Err("A non-simulcast track expects a single bandwidth limit".to_owned());
    }
    track.bandwidth = TrackBandwidth::Single(resolve_against_cap(
        single_kbps.unwrap_or(0),
        SINGLE_STREAM_CAP_KBPS,
        "single stream",
    ));
    Ok(())
}

/// Writes one simulcast layer. `0` means that layer's cap.
pub(crate) fn apply_encoding_bandwidth(
    track: &mut LocalTrack,
    variant: i32,
    kbps: u32,
) -> Result<(), String> {
    let variant = Variant::try_from(variant).unwrap_or(Variant::Unspecified);
    let name = variant_name(variant);
    let Some(cap) = layer_cap(variant) else {
        return Err(format!("{name} is not a simulcast variant"));
    };
    if !track.simulcast {
        return Err(format!("{name} is not a simulcast variant"));
    }
    let TrackBandwidth::Layers { low, medium, high } = &mut track.bandwidth else {
        return Err(format!("{name} is not a simulcast variant"));
    };
    let resolved = resolve_against_cap(kbps, cap, name);
    match variant {
        Variant::Low => *low = resolved,
        Variant::Medium => *medium = resolved,
        Variant::High => *high = resolved,
        Variant::Unspecified => unreachable!("layer_cap rejected unspecified"),
    }
    Ok(())
}

pub(crate) fn set_variant_enabled(config: &mut SimulcastConfig, variant: i32, enabled: bool) {
    config.enabled_variants.retain(|value| *value != variant);
    config.disabled_variants.retain(|value| *value != variant);
    if enabled {
        config.enabled_variants.push(variant);
    } else {
        config.disabled_variants.push(variant);
    }
    config.enabled_variants.sort_unstable();
    config.disabled_variants.sort_unstable();
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

pub(crate) fn variant_bitrates(track: &LocalTrack) -> peer::media_event::TrackBitrates {
    let kind = TrackKind::try_from(track.kind).unwrap_or(TrackKind::Unspecified);
    let variant_bitrates = if kind != TrackKind::Video {
        let kbps = match track.bandwidth {
            TrackBandwidth::Single(kbps) => kbps,
            TrackBandwidth::Layers { .. } => 0,
        };
        let bitrate = if kbps == 0 {
            AUDIO_DEFAULT_BPS
        } else {
            kbps_to_bps_i32(kbps)
        };
        vec![variant_bitrate(MediaVariant::Unspecified, bitrate)]
    } else if let TrackBandwidth::Layers { low, medium, high } = track.bandwidth {
        vec![
            variant_bitrate(MediaVariant::Low, kbps_to_bps_i32(low)),
            variant_bitrate(MediaVariant::Medium, kbps_to_bps_i32(medium)),
            variant_bitrate(MediaVariant::High, kbps_to_bps_i32(high)),
        ]
    } else {
        let TrackBandwidth::Single(kbps) = track.bandwidth else {
            unreachable!("video layers are handled above")
        };
        let kbps = if kbps == 0 {
            SINGLE_STREAM_CAP_KBPS
        } else {
            kbps
        };
        vec![variant_bitrate(
            MediaVariant::Unspecified,
            kbps_to_bps_i32(kbps),
        )]
    };
    peer::media_event::TrackBitrates {
        track_id: track.id.clone(),
        variant_bitrates,
    }
}

pub(crate) fn local_simulcast(track: &LocalTrack) -> SimulcastConfig {
    if !track.simulcast {
        return SimulcastConfig::default();
    }
    let all = [
        Variant::Low as i32,
        Variant::Medium as i32,
        Variant::High as i32,
    ];
    SimulcastConfig {
        enabled: true,
        enabled_variants: all
            .into_iter()
            .filter(|variant| track.active_variants.contains(variant))
            .collect(),
        disabled_variants: all
            .into_iter()
            .filter(|variant| !track.active_variants.contains(variant))
            .collect(),
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

fn encoding(rid: &str, scale: f64, max_bitrate_kbps: u32, active: bool) -> SendEncoding {
    SendEncoding {
        rid: rid.to_owned(),
        active,
        scale_resolution_down_by: scale,
        max_bitrate: max_bitrate_kbps.saturating_mul(KBPS),
    }
}

fn initial_bandwidth(
    kind: TrackKind,
    metadata: &TrackMetadata,
    limits: &BandwidthLimits,
    video: &VideoConfig,
) -> (bool, Vec<i32>, TrackBandwidth) {
    if kind != TrackKind::Video {
        return (false, Vec::new(), TrackBandwidth::Single(0));
    }
    let simulcast = metadata.r#type() == TrackType::Camera && video.mode() != VideoSendMode::Single;
    if !simulcast {
        return (
            false,
            Vec::new(),
            TrackBandwidth::Single(resolve_against_cap(
                limits.single_stream_kbps,
                SINGLE_STREAM_CAP_KBPS,
                "single stream",
            )),
        );
    }
    (
        true,
        active_variants(video),
        TrackBandwidth::Layers {
            low: resolve_against_cap(limits.low_kbps, LOW_CAP_KBPS, variant_name(Variant::Low)),
            medium: resolve_against_cap(
                limits.medium_kbps,
                MEDIUM_CAP_KBPS,
                variant_name(Variant::Medium),
            ),
            high: resolve_against_cap(limits.high_kbps, HIGH_CAP_KBPS, variant_name(Variant::High)),
        },
    )
}

fn active_variants(video: &VideoConfig) -> Vec<i32> {
    let all = [
        Variant::Low as i32,
        Variant::Medium as i32,
        Variant::High as i32,
    ];
    if video.mode() != VideoSendMode::Simulcast {
        return all.to_vec();
    }
    let listed: Vec<i32> = all
        .into_iter()
        .filter(|variant| video.sent_qualities.contains(variant))
        .collect();
    if listed.is_empty() {
        all.to_vec()
    } else {
        listed
    }
}

/// A positive budget is split by pixel count (weights 1 : 4 : 16 for scales
/// 4, 2, 1) and then each layer is clamped. `0` uses each layer's cap.
fn split_or_caps(budget_kbps: u32) -> TrackBandwidth {
    if budget_kbps == 0 {
        return TrackBandwidth::Layers {
            low: LOW_CAP_KBPS,
            medium: MEDIUM_CAP_KBPS,
            high: HIGH_CAP_KBPS,
        };
    }
    let split = split_simulcast_budget(budget_kbps);
    TrackBandwidth::Layers {
        low: resolve_against_cap(split[0], LOW_CAP_KBPS, variant_name(Variant::Low)),
        medium: resolve_against_cap(split[1], MEDIUM_CAP_KBPS, variant_name(Variant::Medium)),
        high: resolve_against_cap(split[2], HIGH_CAP_KBPS, variant_name(Variant::High)),
    }
}

fn split_simulcast_budget(budget_kbps: u32) -> [u32; 3] {
    let scales = [4.0_f64, 2.0, 1.0];
    let first = scales[0];
    let parts: f64 = scales.iter().map(|scale| (first / scale).powi(2)).sum();
    let share = (budget_kbps as f64 * KBPS as f64) / parts;
    let mut out = [0_u32; 3];
    for (index, scale) in scales.iter().enumerate() {
        let bps = share * (first / scale).powi(2);
        out[index] = (bps / KBPS as f64).round() as u32;
    }
    out
}

fn layer_limit(layers: &[(i32, u32)], variant: Variant) -> u32 {
    let requested = layers
        .iter()
        .find(|(value, _)| *value == variant as i32)
        .map(|(_, kbps)| *kbps)
        .unwrap_or(0);
    resolve_against_cap(
        requested,
        layer_cap(variant).unwrap_or(0),
        variant_name(variant),
    )
}

fn layer_cap(variant: Variant) -> Option<u32> {
    match variant {
        Variant::Low => Some(LOW_CAP_KBPS),
        Variant::Medium => Some(MEDIUM_CAP_KBPS),
        Variant::High => Some(HIGH_CAP_KBPS),
        Variant::Unspecified => None,
    }
}

fn resolve_against_cap(limit: u32, cap: u32, label: &str) -> u32 {
    if limit == 0 {
        return cap;
    }
    if limit > cap {
        log::warn!("Desired {label} bandwidth of {limit} kbps exceeds the cap of {cap} kbps");
        return cap;
    }
    limit
}

fn kbps_to_bps_i32(kbps: u32) -> i32 {
    i32::try_from(kbps.saturating_mul(KBPS)).unwrap_or(i32::MAX)
}

fn variant_name(variant: Variant) -> &'static str {
    match variant {
        Variant::Low => "VARIANT_LOW",
        Variant::Medium => "VARIANT_MEDIUM",
        Variant::High => "VARIANT_HIGH",
        Variant::Unspecified => "VARIANT_UNSPECIFIED",
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
        simulcast_config: Some(local_simulcast(track)),
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

pub(crate) fn remote_peer_state(peer: &RemotePeer) -> PeerState {
    peer_state(
        &peer.id,
        &peer.metadata_json,
        peer.tracks.iter().map(remote_track_state).collect(),
    )
}

pub(crate) fn remote_track_state(track: &RemoteTrack) -> TrackState {
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
