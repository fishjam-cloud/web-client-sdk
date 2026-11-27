//! Types the iOS and Android SDKs see through UniFFI.
//!
//! Exported names start with `Core` so they do not clash with the public
//! types of the same name in the SDKs (`RoomState`, `Variant`, ...).

use std::collections::HashMap;
use std::fmt;

#[derive(Debug, Clone, PartialEq, Default, uniffi::Record)]
#[uniffi(name = "CoreClientConfig")]
pub struct ClientConfig {
    pub fishjam_id: String,
    pub debug: bool,
    /// "android" or "ios". Auth sends "<client_type>-<fishjam-core version>".
    pub client_type: String,
    /// `None` for defaults (enabled, 3 attempts, 500ms/500ms delays, offline
    /// timeout 60s, tracks republished). Set `enabled = false` to turn it off.
    pub reconnect_config: Option<ReconnectConfig>,
    /// `None` for the caps below. Each value is kbps, where 1 kbps = 1024 bps.
    /// 0 means that cap. A higher value is clamped to the cap.
    pub bandwidth_limits: Option<BandwidthLimits>,
    /// `None` for three camera layers. `Single` sends the camera as one encoding.
    pub video_config: Option<VideoConfig>,
}

/// App limits for outgoing video. 0 uses the cap: 1500 kbps for one encoding,
/// and 150 / 500 / 1500 kbps for the low / medium / high layers.
/// `single_stream_kbps` applies to a non-simulcast video track other than
/// screen share. Screen share starts at the 1500 kbps cap.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, uniffi::Record)]
#[uniffi(name = "CoreBandwidthLimits")]
pub struct BandwidthLimits {
    pub single_stream_kbps: u32,
    pub low_kbps: u32,
    pub medium_kbps: u32,
    pub high_kbps: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, uniffi::Enum)]
#[uniffi(name = "CoreVideoSendMode")]
pub enum VideoSendMode {
    #[default]
    Simulcast,
    Single,
}

/// Which camera layers to send. An empty `sent_qualities` list means low,
/// medium, and high. A layer left out stays in the offer with
/// `active = false`. Other video tracks ignore this and send one encoding.
#[derive(Debug, Clone, PartialEq, Eq, Default, uniffi::Record)]
#[uniffi(name = "CoreVideoConfig")]
pub struct VideoConfig {
    pub mode: VideoSendMode,
    pub sent_qualities: Vec<Variant>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, uniffi::Record)]
#[uniffi(name = "CoreReconnectConfig")]
pub struct ReconnectConfig {
    pub enabled: bool,
    pub max_attempts: u32,
    pub initial_delay_ms: u32,
    pub delay_ms: u32,
    pub add_tracks_on_reconnect: bool,
    pub offline_timeout_ms: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Record)]
#[uniffi(name = "CoreLayerBandwidth")]
pub struct LayerBandwidth {
    pub variant: Variant,
    pub kbps: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, uniffi::Enum)]
#[uniffi(name = "CoreAuthErrorReason")]
pub enum AuthErrorReason {
    MissingToken,
    InvalidToken,
    ExpiredToken,
    RoomNotFound,
    PeerNotFound,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, uniffi::Enum)]
#[uniffi(name = "CoreJoinErrorReason")]
pub enum JoinErrorReason {
    ReachedPeersLimit,
    RoomNotFound,
    NodeNotFound,
    InvalidSdkVersion,
}

/// "room not found" is both an auth and a join reason, so `Failed` can carry both.
/// The text is in `detail`: Kotlin's generated exception already uses `message`.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Error)]
pub enum CoreError {
    /// A video track was added in an audio-only room.
    TrackType { detail: String },
    Failed {
        detail: String,
        auth_reason: Option<AuthErrorReason>,
        join_reason: Option<JoinErrorReason>,
    },
}

impl CoreError {
    pub fn message(&self) -> &str {
        match self {
            CoreError::TrackType { detail } | CoreError::Failed { detail, .. } => detail,
        }
    }

    pub fn auth_reason(&self) -> Option<AuthErrorReason> {
        match self {
            CoreError::Failed { auth_reason, .. } => *auth_reason,
            CoreError::TrackType { .. } => None,
        }
    }

    pub fn join_reason(&self) -> Option<JoinErrorReason> {
        match self {
            CoreError::Failed { join_reason, .. } => *join_reason,
            CoreError::TrackType { .. } => None,
        }
    }
}

impl fmt::Display for CoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.message())
    }
}

impl std::error::Error for CoreError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, uniffi::Enum)]
#[uniffi(name = "CoreTrackKind")]
pub enum TrackKind {
    Audio,
    Video,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, uniffi::Enum)]
#[uniffi(name = "CoreTrackType")]
pub enum TrackType {
    /// A remote track whose metadata has no known `type`.
    #[default]
    Unspecified,
    Camera,
    Microphone,
    ScreenShareVideo,
    ScreenShareAudio,
    CustomVideo,
    CustomAudio,
}

/// Same values as `fishjam.media_events.Variant`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Default, uniffi::Enum)]
#[uniffi(name = "CoreVariant")]
pub enum Variant {
    #[default]
    Unspecified,
    Low,
    Medium,
    High,
}

impl Variant {
    /// Reads a `fishjam.media_events.Variant` number. Unknown numbers are `Unspecified`.
    pub fn from_media(value: i32) -> Self {
        match value {
            1 => Variant::Low,
            2 => Variant::Medium,
            3 => Variant::High,
            _ => Variant::Unspecified,
        }
    }

    pub fn to_media(self) -> i32 {
        self as i32
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default, uniffi::Record)]
#[uniffi(name = "CoreTrackMetadata")]
pub struct TrackMetadata {
    pub track_type: TrackType,
    pub paused: bool,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, uniffi::Enum)]
#[uniffi(name = "CorePeerStatus")]
pub enum PeerStatus {
    #[default]
    Idle,
    Connecting,
    Connected,
    Error,
}

/// Separate from `PeerStatus`: a reconnect attempt in progress does not flip
/// `PeerStatus` away from its last good value until it either succeeds or the
/// whole reconnection gives up.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, uniffi::Enum)]
#[uniffi(name = "CoreReconnectionStatus")]
pub enum ReconnectionStatus {
    #[default]
    Idle,
    Reconnecting,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, uniffi::Enum)]
#[uniffi(name = "CoreNegotiationStatus")]
pub enum NegotiationStatus {
    #[default]
    Awaiting,
    Offered,
    Done,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, uniffi::Record)]
#[uniffi(name = "CoreSimulcastConfig")]
pub struct SimulcastConfig {
    pub enabled: bool,
    pub enabled_variants: Vec<Variant>,
    pub disabled_variants: Vec<Variant>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, uniffi::Enum)]
#[uniffi(name = "CoreVadStatus")]
pub enum VadStatus {
    #[default]
    Silence,
    Speech,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, uniffi::Record)]
#[uniffi(name = "CoreTrackState")]
pub struct TrackState {
    pub track_id: String,
    pub metadata: TrackMetadata,
    pub simulcast_config: SimulcastConfig,
    pub negotiation_status: NegotiationStatus,
    /// `Unspecified` until the server reports which layer it sends.
    pub encoding: Variant,
    pub ready: bool,
    pub vad_status: VadStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, uniffi::Record)]
#[uniffi(name = "CorePeerState")]
pub struct PeerState {
    pub id: String,
    pub metadata_json: String,
    pub tracks: Vec<TrackState>,
    pub camera_track: Option<TrackState>,
    pub microphone_track: Option<TrackState>,
    pub screen_share_video_track: Option<TrackState>,
    pub screen_share_audio_track: Option<TrackState>,
    pub custom_video_tracks: Vec<TrackState>,
    pub custom_audio_tracks: Vec<TrackState>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, uniffi::Record)]
#[uniffi(name = "CoreRoomState")]
pub struct RoomState {
    pub local_peer: Option<PeerState>,
    pub remote_peers: Vec<PeerState>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, uniffi::Record)]
#[uniffi(name = "CoreIceServer")]
pub struct IceServer {
    pub credential: String,
    pub urls: Vec<String>,
    pub username: String,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
#[uniffi(name = "CoreSendEncoding")]
pub struct SendEncoding {
    pub rid: String,
    pub active: bool,
    pub scale_resolution_down_by: f64,
    pub max_bitrate: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
#[uniffi(name = "CoreSdpType")]
pub enum SdpType {
    Offer,
    Answer,
}

/// Everything the core tells the SDK, in the order it happened.
#[derive(Debug, Clone, PartialEq, uniffi::Enum)]
#[uniffi(name = "CoreEvent")]
pub enum SdkEvent {
    PeerStatusChanged {
        peer_status: PeerStatus,
        error: Option<CoreError>,
    },
    RoomStateChanged {
        room_state: RoomState,
    },
    CreatePeerConnection {
        ice_servers: Vec<IceServer>,
    },
    UpdateRecvonlyTransceivers {
        video_to_add: i32,
        audio_to_add: i32,
        mids_to_stop: Vec<String>,
    },
    AddSendonlyTransceiver {
        track_id: String,
        kind: TrackKind,
        send_encodings: Vec<SendEncoding>,
    },
    RemoveSendTrack {
        track_id: String,
    },
    CreateOffer,
    SetLocalDescription {
        sdp_type: SdpType,
        sdp: String,
    },
    SetRemoteDescription {
        sdp_type: SdpType,
        sdp: String,
        mid_to_track_id: HashMap<String, String>,
    },
    AddIceCandidate {
        candidate: String,
        sdp_mid: String,
        sdp_m_line_index: i32,
        username_fragment: String,
    },
    ClosePeerConnection,
    PeerJoined {
        peer: PeerState,
    },
    PeerLeft {
        peer: PeerState,
    },
    PeerUpdated {
        peer: PeerState,
    },
    TrackAdded {
        peer_id: String,
        track: TrackState,
    },
    TrackReady {
        peer_id: String,
        track: TrackState,
    },
    TrackRemoved {
        peer_id: String,
        track: TrackState,
    },
    TrackUpdated {
        peer_id: String,
        track: TrackState,
    },
    ReconnectionStatusChanged {
        status: ReconnectionStatus,
    },
    UpdateSendEncodings {
        track_id: String,
        send_encodings: Vec<SendEncoding>,
    },
    /// Sent when auth succeeds, before the peer is connected.
    /// `audio_only` is true for an audio-only room.
    Authenticated {
        audio_only: bool,
    },
    VoiceActivityChanged {
        peer_id: String,
        track_id: String,
        vad_status: VadStatus,
    },
    /// A local source got a track. Bind the media with `media_id` to `track_id`
    /// before the `AddSendonlyTransceiver` for that track.
    LocalSourcePublished {
        source_id: String,
        media_id: String,
        track_id: String,
    },
    /// A live local source got new media. The track id stays the same, so put
    /// the media with `media_id` on that track's sender.
    LocalSourceReplaced {
        source_id: String,
        media_id: String,
        track_id: String,
    },
    /// A live source was muted. Its track stays in the room with `paused` set.
    /// Take the media with `media_id` off the sender of `track_id`.
    LocalSourceMuted {
        source_id: String,
        media_id: String,
        track_id: String,
    },
    /// The track of a local source is gone (removed, left, or failed).
    LocalSourceUnpublished {
        source_id: String,
        media_id: String,
        track_id: String,
    },
    /// A video source cannot publish in an audio-only room. It stays waiting.
    LocalSourceRejected {
        source_id: String,
        media_id: String,
    },
}
