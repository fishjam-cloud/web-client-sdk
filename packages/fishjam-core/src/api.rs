use std::collections::HashMap;
use std::sync::Arc;

use crate::client::FishjamClient;
use crate::sdk::{
    ClientConfig, CoreError, LayerBandwidth, RoomState, SdkEvent, TrackKind, TrackMetadata, Variant,
};

/// Implemented by the SDK. Called on a core thread, never while a core lock is held.
#[uniffi::export(with_foreign)]
pub trait CoreEventListener: Send + Sync {
    fn on_event(&self, event: SdkEvent);
}

/// Sends warn and error logs to Logcat on Android and the Xcode console on iOS.
#[uniffi::export]
pub fn install_logger(debug: bool) {
    crate::platform_log::install(debug);
}

/// The client the iOS and Android SDKs drive. Every SDK-side WebRTC result is
/// reported back through the `*_result` methods.
#[derive(uniffi::Object)]
pub struct FishjamCoreClient {
    client: FishjamClient,
}

#[uniffi::export]
impl FishjamCoreClient {
    #[uniffi::constructor]
    pub fn new(config: ClientConfig, listener: Arc<dyn CoreEventListener>) -> Self {
        Self {
            client: FishjamClient::new(config, move |event| listener.on_event(event)),
        }
    }

    pub fn join_room(
        &self,
        peer_token: String,
        peer_metadata_json: String,
    ) -> Result<(), CoreError> {
        self.client.join_room(&peer_token, &peer_metadata_json)
    }

    pub fn leave_room(&self) {
        self.client.leave_room();
    }

    pub fn room_state(&self) -> RoomState {
        self.client.room_state()
    }

    /// The peer part only. The server wraps it as `{"peer": …, "server": …}`.
    pub fn update_peer_metadata(&self, peer_metadata_json: String) -> Result<(), CoreError> {
        self.client.update_peer_metadata(&peer_metadata_json)
    }

    /// Returns the new track id.
    pub fn add_track(&self, kind: TrackKind, metadata: TrackMetadata) -> Result<String, CoreError> {
        self.client.add_track(kind, metadata)
    }

    pub fn remove_track(&self, track_id: String) -> Result<(), CoreError> {
        self.client.remove_track(&track_id)
    }

    /// One number, or one number per layer. 0 means the cap for that video limit.
    /// A per-layer list on an audio track is an error. Audio keeps the number as given.
    pub fn set_track_bandwidth(
        &self,
        track_id: String,
        single_kbps: Option<u32>,
        layers: Vec<LayerBandwidth>,
    ) -> Result<(), CoreError> {
        self.client.set_track_bandwidth(
            &track_id,
            single_kbps,
            layers
                .into_iter()
                .map(|layer| (layer.variant, layer.kbps))
                .collect(),
        )
    }

    pub fn set_encoding_bandwidth(
        &self,
        track_id: String,
        variant: Variant,
        kbps: u32,
    ) -> Result<(), CoreError> {
        self.client.set_encoding_bandwidth(&track_id, variant, kbps)
    }

    pub fn set_target_track_variant(
        &self,
        track_id: String,
        variant: Variant,
    ) -> Result<(), CoreError> {
        self.client.set_target_track_variant(&track_id, variant)
    }

    pub fn create_offer_result(&self, sdp: String) {
        self.client.create_offer_result(&sdp);
    }

    pub fn set_local_description_result(&self, mid_to_track_id: HashMap<String, String>) {
        self.client.set_local_description_result(mid_to_track_id);
    }

    pub fn set_remote_description_result(&self) {
        self.client.set_remote_description_result();
    }

    pub fn add_ice_candidate_result(&self) {
        self.client.add_ice_candidate_result();
    }

    pub fn local_ice_candidate(
        &self,
        candidate: String,
        sdp_mid: String,
        sdp_m_line_index: i32,
        username_fragment: String,
    ) {
        self.client
            .local_ice_candidate(&candidate, &sdp_mid, sdp_m_line_index, &username_fragment);
    }

    pub fn remote_track_ready(&self, mid: String) {
        self.client.remote_track_ready(&mid);
    }

    pub fn peer_connection_state_changed(
        &self,
        connection_state: String,
        ice_connection_state: String,
    ) {
        self.client
            .peer_connection_state_changed(&connection_state, &ice_connection_state);
    }

    /// Reported when the OS's default network path changes. `network_id`
    /// identifies the current network (opaque, e.g. interface type); empty
    /// when offline.
    pub fn network_status_changed(&self, online: bool, network_id: String) {
        self.client.network_status_changed(online, &network_id);
    }
}
