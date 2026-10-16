use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard, Weak};

use prost::Message;

use crate::auth::{is_auth_error, is_join_error, normalize_close_reason};
use crate::fishjam::media_events::{peer, server};
use crate::fishjam::{peer_message, PeerMessage};
use crate::negotiation::{self, LocalTrack, RemotePeer};
use crate::sdk::{
    sdk_event, AddIceCandidate, AddSendonlyTransceiver, ClientConfig, ClosePeerConnection,
    CreateOffer, CreatePeerConnection, Error, IceServer, NegotiationStatus, PeerStatus,
    PeerStatusChanged, RemoveSendTrack, RoomState, RoomStateChanged, SdkEvent, SdpType,
    SetLocalDescription, SetRemoteDescription, TrackKind, TrackMetadata,
    UpdateRecvonlyTransceivers,
};
use crate::signaling::{SignalingSocket, SocketConnector, SocketListener, TungsteniteConnector};
use crate::url::websocket_url;

/// Sent in `authRequest`, same shape as `${clientType}-${packageVersion}` in ts-client.
pub fn sdk_version() -> String {
    format!("mobile-{}", env!("CARGO_PKG_VERSION"))
}

type EventCallback = Box<dyn Fn(SdkEvent) + Send + Sync>;

pub struct FishjamClient {
    inner: Arc<Inner>,
}

struct Inner {
    /// Held while events are delivered, so `on_event` sees them in the order they happened.
    emit_lock: Mutex<()>,
    state: Mutex<State>,
    connector: Box<dyn SocketConnector>,
    on_event: EventCallback,
}

struct State {
    config: ClientConfig,
    peer_status: PeerStatus,
    socket: Option<Box<dyn SignalingSocket>>,
    socket_open: bool,
    /// Incremented for every socket, so callbacks from an old socket are ignored.
    generation: u64,
    peer_token: String,
    peer_metadata_json: String,
    local_endpoint_id: Option<String>,
    local_metadata_json: String,
    is_audio_only: bool,
    ice_servers: Vec<IceServer>,
    peer_connection_open: bool,
    ongoing_renegotiation: bool,
    recv_video: i32,
    recv_audio: i32,
    recv_video_mids: Vec<String>,
    recv_audio_mids: Vec<String>,
    local_tracks: Vec<LocalTrack>,
    remote_peers: Vec<RemotePeer>,
    mid_to_track_id: HashMap<String, String>,
    pending_offer_sdp: String,
}

impl FishjamClient {
    pub fn new(config: ClientConfig, on_event: impl Fn(SdkEvent) + Send + Sync + 'static) -> Self {
        Self::with_connector(config, Box::new(TungsteniteConnector), on_event)
    }

    pub fn with_connector(
        config: ClientConfig,
        connector: Box<dyn SocketConnector>,
        on_event: impl Fn(SdkEvent) + Send + Sync + 'static,
    ) -> Self {
        Self {
            inner: Arc::new(Inner {
                emit_lock: Mutex::new(()),
                state: Mutex::new(State {
                    config,
                    peer_status: PeerStatus::Idle,
                    socket: None,
                    socket_open: false,
                    generation: 0,
                    peer_token: String::new(),
                    peer_metadata_json: String::new(),
                    local_endpoint_id: None,
                    local_metadata_json: String::new(),
                    is_audio_only: false,
                    ice_servers: Vec::new(),
                    peer_connection_open: false,
                    ongoing_renegotiation: false,
                    recv_video: 0,
                    recv_audio: 0,
                    recv_video_mids: Vec::new(),
                    recv_audio_mids: Vec::new(),
                    local_tracks: Vec::new(),
                    remote_peers: Vec::new(),
                    mid_to_track_id: HashMap::new(),
                    pending_offer_sdp: String::new(),
                }),
                connector,
                on_event: Box::new(on_event),
            }),
        }
    }

    pub fn join_room(&self, peer_token: &str, peer_metadata_json: &str) -> Result<(), Error> {
        let fishjam_id = self.inner.lock_state().config.fishjam_id.clone();
        let url = websocket_url(&fishjam_id).map_err(|message| Error {
            message,
            ..Default::default()
        })?;

        let weak = Arc::downgrade(&self.inner);
        self.inner.process(|state, events| {
            if state.socket.is_some() {
                state.disconnect(events);
            }
            state.generation += 1;
            state.peer_token = peer_token.to_owned();
            state.peer_metadata_json = peer_metadata_json.to_owned();
            state.set_status(PeerStatus::Connecting, None, events);

            let listener = Arc::new(Listener {
                inner: weak,
                generation: state.generation,
            });
            state.socket = Some(self.inner.connector.connect(&url, listener));
        });
        Ok(())
    }

    pub fn leave_room(&self) {
        self.inner.process(|state, events| state.disconnect(events));
    }

    pub fn peer_status(&self) -> PeerStatus {
        self.inner.lock_state().peer_status
    }

    pub fn room_state(&self) -> RoomState {
        let state = self.inner.lock_state();
        state.room_snapshot()
    }

    pub fn add_track(&self, kind: TrackKind, metadata: TrackMetadata) -> Result<String, Error> {
        let mut result = Err(error("add track failed"));
        self.inner.process(|state, events| {
            result = state.add_track(kind, metadata.clone(), events);
        });
        result
    }

    pub fn remove_track(&self, track_id: &str) -> Result<(), Error> {
        let mut result = Err(error("remove track failed"));
        self.inner.process(|state, events| {
            result = state.remove_track(track_id, events);
        });
        result
    }

    pub fn create_offer_result(&self, sdp: &str) {
        let sdp = sdp.to_owned();
        self.inner
            .process(|state, events| state.create_offer_result(sdp.clone(), events));
    }

    pub fn set_local_description_result(&self, mid_to_track_id: HashMap<String, String>) {
        self.inner.process(|state, events| {
            state.set_local_description_result(mid_to_track_id.clone(), events)
        });
    }

    pub fn set_remote_description_result(&self) {}

    pub fn add_ice_candidate_result(&self) {}

    pub fn local_ice_candidate(
        &self,
        candidate: &str,
        sdp_mid: &str,
        sdp_m_line_index: i32,
        username_fragment: &str,
    ) {
        if candidate.is_empty() {
            return;
        }
        let candidate = candidate.to_owned();
        let sdp_mid = sdp_mid.to_owned();
        let username_fragment = username_fragment.to_owned();
        self.inner.process(|state, _events| {
            state.send_media_event(peer::media_event::Content::Candidate(
                crate::fishjam::media_events::Candidate {
                    candidate,
                    sdp_m_line_index,
                    sdp_mid,
                    username_fragment,
                },
            ));
        });
    }

    pub fn remote_track_ready(&self, mid: &str) {
        let mid = mid.to_owned();
        self.inner
            .process(|state, events| state.remote_track_ready(&mid, events));
    }

    pub fn peer_connection_state_changed(
        &self,
        connection_state: &str,
        ice_connection_state: &str,
    ) {
        let connection_state = connection_state.to_owned();
        let ice_connection_state = ice_connection_state.to_owned();
        self.inner.process(|state, events| {
            state.peer_connection_state_changed(&connection_state, &ice_connection_state, events);
        });
    }
}

fn error(message: &str) -> Error {
    Error {
        message: message.to_owned(),
        ..Default::default()
    }
}

impl Drop for FishjamClient {
    fn drop(&mut self) {
        // Hold the event lock so a callback cannot run after this returns.
        self.inner.process(|state, _events| {
            if let Some(socket) = state.socket.take() {
                socket.close();
            }
            state.socket_open = false;
            state.generation += 1;
        });
    }
}

impl Inner {
    fn lock_state(&self) -> MutexGuard<'_, State> {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn process(&self, f: impl FnOnce(&mut State, &mut Vec<SdkEvent>)) {
        let _emit = self
            .emit_lock
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut events = Vec::new();
        {
            let mut state = self.lock_state();
            f(&mut state, &mut events);
        }
        for event in events {
            (self.on_event)(event);
        }
    }

    fn process_socket(&self, generation: u64, f: impl FnOnce(&mut State, &mut Vec<SdkEvent>)) {
        self.process(|state, events| {
            if state.generation == generation && state.socket.is_some() {
                f(state, events);
            }
        });
    }
}

struct Listener {
    inner: Weak<Inner>,
    generation: u64,
}

impl SocketListener for Listener {
    fn on_open(&self) {
        if let Some(inner) = self.inner.upgrade() {
            inner.process_socket(self.generation, |state, _| state.on_socket_open());
        }
    }

    fn on_message(&self, data: Vec<u8>) {
        if let Some(inner) = self.inner.upgrade() {
            inner.process_socket(self.generation, |state, events| {
                state.on_socket_message(&data, events)
            });
        }
    }

    fn on_close(&self, reason: String) {
        if let Some(inner) = self.inner.upgrade() {
            inner.process_socket(self.generation, |state, events| {
                state.on_socket_close(&reason, events)
            });
        }
    }
}

impl State {
    fn set_status(&mut self, status: PeerStatus, error: Option<Error>, events: &mut Vec<SdkEvent>) {
        if self.peer_status == status && error.is_none() {
            return;
        }
        self.peer_status = status;
        events.push(SdkEvent {
            content: Some(sdk_event::Content::PeerStatusChanged(PeerStatusChanged {
                peer_status: status as i32,
                error,
            })),
        });
    }

    fn send(&self, content: peer_message::Content) {
        if let Some(socket) = &self.socket {
            socket.send(
                PeerMessage {
                    content: Some(content),
                }
                .encode_to_vec(),
            );
        }
    }

    fn send_media_event(&self, content: peer::media_event::Content) {
        self.send(peer_message::Content::PeerMediaEvent(peer::MediaEvent {
            content: Some(content),
        }));
    }

    /// Same as `client.disconnect()`: send `disconnect` when the socket is open, then close it.
    fn disconnect(&mut self, events: &mut Vec<SdkEvent>) {
        if self.socket_open {
            self.send_media_event(peer::media_event::Content::Disconnect(
                peer::media_event::Disconnect {},
            ));
        }
        if let Some(socket) = self.socket.take() {
            socket.close();
        }
        self.socket_open = false;
        self.generation += 1;
        let had_session = self.local_endpoint_id.is_some() || self.peer_connection_open;
        self.reset_media(events);
        if had_session {
            self.emit_room(events);
        }
        self.set_status(PeerStatus::Idle, None, events);
    }

    fn on_socket_open(&mut self) {
        self.socket_open = true;
        self.send(peer_message::Content::AuthRequest(
            peer_message::AuthRequest {
                token: self.peer_token.clone(),
                sdk_version: sdk_version(),
            },
        ));
    }

    fn on_socket_message(&mut self, data: &[u8], events: &mut Vec<SdkEvent>) {
        let message = match PeerMessage::decode(data) {
            Ok(message) => message,
            Err(error) => {
                log::warn!("Received invalid control message, error: {error}");
                return;
            }
        };
        match message.content {
            Some(peer_message::Content::Authenticated(authenticated)) => {
                self.on_authenticated(authenticated)
            }
            Some(peer_message::Content::AuthRequest(_)) => {
                log::warn!("Received unexpected control message: authRequest");
            }
            Some(peer_message::Content::ServerMediaEvent(event)) => {
                if let Some(content) = event.content {
                    self.on_server_event(content, events);
                }
            }
            _ => {}
        }
    }

    fn on_authenticated(&mut self, authenticated: peer_message::Authenticated) {
        self.is_audio_only = authenticated.room_type() == peer_message::RoomType::AudioOnly;
        if let Some(deprecation) = &authenticated.sdk_deprecation {
            match deprecation.status() {
                peer_message::sdk_deprecation::Status::Unsupported => {
                    log::error!("{}", deprecation.message)
                }
                peer_message::sdk_deprecation::Status::Deprecated => {
                    log::warn!("{}", deprecation.message)
                }
                _ => {}
            }
        }
        self.send_media_event(peer::media_event::Content::Connect(
            peer::media_event::Connect {
                metadata_json: self.peer_metadata_json.clone(),
            },
        ));
    }

    fn on_server_event(
        &mut self,
        content: server::media_event::Content,
        events: &mut Vec<SdkEvent>,
    ) {
        if self.local_endpoint_id.is_none() {
            match content {
                server::media_event::Content::Connected(connected) => {
                    self.on_connected(connected, events)
                }
                server::media_event::Content::Error(server_error) => {
                    self.set_status(
                        PeerStatus::Error,
                        Some(error(&server_error.message)),
                        events,
                    );
                }
                _ => {}
            }
            return;
        }
        match content {
            server::media_event::Content::Connected(connected) => {
                self.on_connected(connected, events)
            }
            server::media_event::Content::OfferData(offer) => self.on_offer_data(offer, events),
            server::media_event::Content::SdpAnswer(answer) => self.on_sdp_answer(answer, events),
            server::media_event::Content::Candidate(candidate) => {
                self.emit(
                    sdk_event::Content::AddIceCandidate(AddIceCandidate {
                        candidate: candidate.candidate,
                        sdp_mid: candidate.sdp_mid,
                        sdp_m_line_index: candidate.sdp_m_line_index,
                        username_fragment: candidate.username_fragment,
                    }),
                    events,
                );
            }
            server::media_event::Content::EndpointAdded(added) => {
                if added.endpoint_id == self.local_id() {
                    return;
                }
                self.upsert_remote_peer(added.endpoint_id, added.metadata_json);
                self.emit_room(events);
            }
            server::media_event::Content::EndpointRemoved(removed) => {
                self.on_endpoint_removed(&removed.endpoint_id, events);
            }
            server::media_event::Content::EndpointUpdated(updated) => {
                if updated.endpoint_id == self.local_id() {
                    return;
                }
                if let Some(peer) = self
                    .remote_peers
                    .iter_mut()
                    .find(|peer| peer.id == updated.endpoint_id)
                {
                    peer.metadata_json = updated.metadata_json;
                } else {
                    return;
                }
                self.emit_room(events);
            }
            server::media_event::Content::TracksAdded(added) => {
                self.ongoing_renegotiation = true;
                if added.endpoint_id == self.local_id() {
                    return;
                }
                self.add_remote_tracks(added.endpoint_id, added.track_id_to_track);
                self.emit_room(events);
            }
            server::media_event::Content::TracksRemoved(removed) => {
                if removed.endpoint_id == self.local_id() {
                    return;
                }
                self.remove_remote_tracks(&removed.track_ids);
                self.emit_room(events);
            }
            server::media_event::Content::TrackUpdated(updated) => {
                if updated.endpoint_id == self.local_id() {
                    return;
                }
                self.update_remote_track(&updated.track_id, updated.metadata_json);
                self.emit_room(events);
            }
            server::media_event::Content::TrackVariantSwitched(switched) => {
                self.set_remote_encoding(&switched.track_id, switched.variant);
                self.emit_room(events);
            }
            server::media_event::Content::Error(server_error) => {
                self.set_status(
                    PeerStatus::Error,
                    Some(error(&server_error.message)),
                    events,
                );
            }
            _ => {}
        }
    }

    fn on_socket_close(&mut self, reason: &str, events: &mut Vec<SdkEvent>) {
        log::warn!("Socket closed with reason: {reason}");
        self.socket = None;
        self.socket_open = false;

        let normalized = normalize_close_reason(reason);
        let error = if is_auth_error(&normalized) {
            Error {
                message: normalized.clone(),
                auth_reason: normalized,
                ..Default::default()
            }
        } else if is_join_error(&normalized) {
            Error {
                message: normalized.clone(),
                join_reason: normalized,
                ..Default::default()
            }
        } else {
            Error {
                message: format!("Socket closed: {reason}"),
                ..Default::default()
            }
        };
        let had_session = self.local_endpoint_id.is_some() || self.peer_connection_open;
        self.reset_media(events);
        if had_session {
            self.emit_room(events);
        }
        self.set_status(PeerStatus::Error, Some(error), events);
    }

    fn local_id(&self) -> String {
        self.local_endpoint_id.clone().unwrap_or_default()
    }

    fn room_snapshot(&self) -> RoomState {
        negotiation::room_snapshot(
            self.local_endpoint_id.as_deref(),
            &self.local_metadata_json,
            &self.local_tracks,
            &self.remote_peers,
        )
    }

    fn emit(&self, content: sdk_event::Content, events: &mut Vec<SdkEvent>) {
        events.push(SdkEvent {
            content: Some(content),
        });
    }

    fn emit_room(&self, events: &mut Vec<SdkEvent>) {
        self.emit(
            sdk_event::Content::RoomStateChanged(Box::new(RoomStateChanged {
                room_state: Some(self.room_snapshot()),
            })),
            events,
        );
    }

    fn reset_media(&mut self, events: &mut Vec<SdkEvent>) {
        if self.peer_connection_open {
            self.peer_connection_open = false;
            self.emit(
                sdk_event::Content::ClosePeerConnection(ClosePeerConnection {}),
                events,
            );
        }
        self.local_endpoint_id = None;
        self.local_metadata_json.clear();
        self.local_tracks.clear();
        self.remote_peers.clear();
        self.ice_servers.clear();
        self.ongoing_renegotiation = false;
        self.recv_video = 0;
        self.recv_audio = 0;
        self.recv_video_mids.clear();
        self.recv_audio_mids.clear();
        self.mid_to_track_id.clear();
        self.pending_offer_sdp.clear();
    }

    fn on_connected(
        &mut self,
        connected: server::media_event::Connected,
        events: &mut Vec<SdkEvent>,
    ) {
        let endpoint_id = connected.endpoint_id.clone();
        self.local_endpoint_id = Some(endpoint_id.clone());
        self.ice_servers = connected
            .ice_servers
            .into_iter()
            .map(|server| IceServer {
                credential: server.credential,
                urls: server.urls,
                username: server.username,
            })
            .collect();
        self.remote_peers.clear();
        self.local_metadata_json.clear();
        for (id, endpoint) in connected.endpoint_id_to_endpoint {
            if id == endpoint_id {
                self.local_metadata_json = endpoint.metadata_json;
            } else if negotiation::is_peer_type(&endpoint.endpoint_type) {
                self.remote_peers.push(negotiation::remote_peer(
                    id,
                    endpoint.metadata_json,
                    endpoint.track_id_to_track,
                ));
            }
        }
        self.emit_room(events);
        self.set_status(PeerStatus::Connected, None, events);
    }

    fn on_offer_data(&mut self, offer: server::media_event::OfferData, events: &mut Vec<SdkEvent>) {
        if !self.peer_connection_open {
            self.peer_connection_open = true;
            self.emit(
                sdk_event::Content::CreatePeerConnection(CreatePeerConnection {
                    ice_servers: self.ice_servers.clone(),
                }),
                events,
            );
        }
        if let Some(tracks) = offer.tracks_types {
            let video_stop = self.take_recv_mids(TrackKind::Video, tracks.video);
            let audio_stop = self.take_recv_mids(TrackKind::Audio, tracks.audio);
            let video_to_add = (tracks.video - self.recv_video).max(0);
            let audio_to_add = (tracks.audio - self.recv_audio).max(0);
            self.recv_video += video_to_add;
            self.recv_audio += audio_to_add;
            let mut mids_to_stop = video_stop;
            mids_to_stop.extend(audio_stop);
            self.emit(
                sdk_event::Content::UpdateRecvonlyTransceivers(UpdateRecvonlyTransceivers {
                    video_to_add,
                    audio_to_add,
                    mids_to_stop,
                }),
                events,
            );
        }
        let queued: Vec<_> = self
            .local_tracks
            .iter_mut()
            .filter(|track| !track.sent_to_connection)
            .map(|track| {
                track.sent_to_connection = true;
                let kind = TrackKind::try_from(track.kind).unwrap_or(TrackKind::Unspecified);
                (
                    track.id.clone(),
                    track.kind,
                    negotiation::send_encodings(kind, &track.metadata),
                )
            })
            .collect();
        for (track_id, kind, send_encodings) in queued {
            self.emit(
                sdk_event::Content::AddSendonlyTransceiver(AddSendonlyTransceiver {
                    track_id,
                    kind,
                    send_encodings,
                }),
                events,
            );
        }
        self.emit(sdk_event::Content::CreateOffer(CreateOffer {}), events);
    }

    fn on_sdp_answer(
        &mut self,
        answer: server::media_event::SdpAnswer,
        events: &mut Vec<SdkEvent>,
    ) {
        self.ongoing_renegotiation = false;
        for (mid, track_id) in &answer.mid_to_track_id {
            self.mid_to_track_id.insert(mid.clone(), track_id.clone());
        }
        self.remember_recv_mids();
        for track in &mut self.local_tracks {
            if answer.mid_to_track_id.values().any(|id| id == &track.id) {
                track.negotiation = NegotiationStatus::Done as i32;
            }
        }
        self.emit(
            sdk_event::Content::SetRemoteDescription(SetRemoteDescription {
                r#type: SdpType::Answer as i32,
                sdp: answer.sdp,
                mid_to_track_id: answer.mid_to_track_id,
            }),
            events,
        );
        self.emit_room(events);
    }

    fn add_track(
        &mut self,
        kind: TrackKind,
        metadata: TrackMetadata,
        events: &mut Vec<SdkEvent>,
    ) -> Result<String, Error> {
        let Some(endpoint_id) = self.local_endpoint_id.clone() else {
            return Err(error(
                "Cannot add tracks before being accepted by the server",
            ));
        };
        let pending = self.ongoing_renegotiation;
        self.ongoing_renegotiation = true;
        let id = format!("{endpoint_id}:{}", uuid::Uuid::new_v4());
        self.local_tracks.push(LocalTrack {
            id: id.clone(),
            kind: kind as i32,
            metadata,
            negotiation: NegotiationStatus::Awaiting as i32,
            sent_to_connection: false,
        });
        self.emit_room(events);
        if !pending {
            self.send_media_event(peer::media_event::Content::RenegotiateTracks(
                peer::media_event::RenegotiateTracks {},
            ));
        }
        Ok(id)
    }

    fn remove_track(&mut self, track_id: &str, events: &mut Vec<SdkEvent>) -> Result<(), Error> {
        if self.local_endpoint_id.is_none() {
            return Err(error(
                "Cannot remove tracks before being accepted by the server",
            ));
        }
        let Some(index) = self
            .local_tracks
            .iter()
            .position(|track| track.id == track_id)
        else {
            return Err(error("Cannot find track"));
        };
        let track = self.local_tracks.remove(index);
        self.ongoing_renegotiation = true;
        if track.sent_to_connection {
            self.emit(
                sdk_event::Content::RemoveSendTrack(RemoveSendTrack { track_id: track.id }),
                events,
            );
        }
        self.send_media_event(peer::media_event::Content::RenegotiateTracks(
            peer::media_event::RenegotiateTracks {},
        ));
        self.emit_room(events);
        Ok(())
    }

    fn create_offer_result(&mut self, sdp: String, events: &mut Vec<SdkEvent>) {
        self.pending_offer_sdp = sdp.clone();
        self.emit(
            sdk_event::Content::SetLocalDescription(SetLocalDescription {
                r#type: SdpType::Offer as i32,
                sdp,
            }),
            events,
        );
    }

    fn set_local_description_result(
        &mut self,
        mid_to_track_id: HashMap<String, String>,
        events: &mut Vec<SdkEvent>,
    ) {
        self.mid_to_track_id.extend(mid_to_track_id.clone());
        self.remember_recv_mids();
        let mut track_id_to_metadata_json = HashMap::new();
        let mut track_id_to_bitrates = HashMap::new();
        for track in &mut self.local_tracks {
            track.negotiation = NegotiationStatus::Offered as i32;
            let kind = TrackKind::try_from(track.kind).unwrap_or(TrackKind::Unspecified);
            track_id_to_metadata_json.insert(
                track.id.clone(),
                negotiation::metadata_json(&track.metadata),
            );
            let mut bitrates = negotiation::variant_bitrates(kind, &track.metadata);
            bitrates.track_id = track.id.clone();
            track_id_to_bitrates.insert(track.id.clone(), bitrates);
        }
        self.send_media_event(peer::media_event::Content::SdpOffer(
            peer::media_event::SdpOffer {
                sdp: self.pending_offer_sdp.clone(),
                track_id_to_metadata_json,
                track_id_to_bitrates,
                mid_to_track_id,
            },
        ));
        self.emit_room(events);
    }

    fn remote_track_ready(&mut self, mid: &str, events: &mut Vec<SdkEvent>) {
        let Some(track_id) = self.mid_to_track_id.get(mid).cloned() else {
            return;
        };
        let mut found = false;
        for peer in &mut self.remote_peers {
            if let Some(track) = peer.tracks.iter_mut().find(|track| track.id == track_id) {
                track.ready = true;
                found = true;
            }
        }
        if found {
            self.emit_room(events);
        }
    }

    fn peer_connection_state_changed(
        &mut self,
        connection_state: &str,
        ice_connection_state: &str,
        events: &mut Vec<SdkEvent>,
    ) {
        if connection_state == "failed" {
            self.set_status(
                PeerStatus::Error,
                Some(error("RTCPeerConnection failed")),
                events,
            );
        } else if ice_connection_state == "failed" {
            self.set_status(
                PeerStatus::Error,
                Some(error("ICE connection failed")),
                events,
            );
        }
        if ice_connection_state == "disconnected" {
            self.ongoing_renegotiation = true;
            self.send_media_event(peer::media_event::Content::RenegotiateTracks(
                peer::media_event::RenegotiateTracks {},
            ));
        }
    }

    fn remember_recv_mids(&mut self) {
        let local: std::collections::HashSet<_> = self
            .local_tracks
            .iter()
            .map(|track| track.id.clone())
            .collect();
        for (mid, track_id) in &self.mid_to_track_id {
            if local.contains(track_id) {
                continue;
            }
            let Some(kind) = self.remote_kind(track_id) else {
                continue;
            };
            let mids = match kind {
                TrackKind::Video => &mut self.recv_video_mids,
                TrackKind::Audio => &mut self.recv_audio_mids,
                _ => continue,
            };
            if !mids.iter().any(|known| known == mid) {
                mids.push(mid.clone());
            }
        }
    }

    fn remote_kind(&self, track_id: &str) -> Option<TrackKind> {
        self.remote_peers.iter().find_map(|peer| {
            peer.tracks
                .iter()
                .find(|track| track.id == track_id)
                .and_then(|track| negotiation::media_kind(&track.metadata_json))
        })
    }

    /// The web client stops receive transceivers when the server asks for fewer of them.
    /// Without that, a peer who leaves and rejoins is put back on the old transceiver,
    /// and the platform never gets a new track to render.
    fn take_recv_mids(&mut self, kind: TrackKind, wanted: i32) -> Vec<String> {
        let (count, mids) = match kind {
            TrackKind::Video => (&mut self.recv_video, &mut self.recv_video_mids),
            TrackKind::Audio => (&mut self.recv_audio, &mut self.recv_audio_mids),
            _ => return Vec::new(),
        };
        let excess = (*count - wanted).max(0) as usize;
        if excess == 0 {
            return Vec::new();
        }
        let present: std::collections::HashSet<_> = self
            .remote_peers
            .iter()
            .flat_map(|peer| peer.tracks.iter().map(|track| track.id.clone()))
            .collect();
        let mut stop = Vec::new();
        let mut index = 0;
        while index < mids.len() && stop.len() < excess {
            let track_id = self.mid_to_track_id.get(&mids[index]).cloned();
            let gone = track_id.as_ref().is_none_or(|id| !present.contains(id));
            if gone {
                stop.push(mids.remove(index));
            } else {
                index += 1;
            }
        }
        while stop.len() < excess && !mids.is_empty() {
            stop.push(mids.pop().expect("mid list is not empty"));
        }
        for mid in &stop {
            self.mid_to_track_id.remove(mid);
        }
        *count -= stop.len() as i32;
        stop
    }

    fn on_endpoint_removed(&mut self, endpoint_id: &str, events: &mut Vec<SdkEvent>) {
        if self.local_endpoint_id.as_deref() == Some(endpoint_id) {
            self.reset_media(events);
            self.emit_room(events);
            self.set_status(PeerStatus::Idle, None, events);
            return;
        }
        let before = self.remote_peers.len();
        self.remote_peers.retain(|peer| peer.id != endpoint_id);
        if self.remote_peers.len() != before {
            self.emit_room(events);
        }
    }

    fn upsert_remote_peer(&mut self, id: String, metadata_json: String) {
        if let Some(peer) = self.remote_peers.iter_mut().find(|peer| peer.id == id) {
            peer.metadata_json = metadata_json;
            return;
        }
        self.remote_peers.push(RemotePeer {
            id,
            metadata_json,
            tracks: Vec::new(),
        });
    }

    fn add_remote_tracks(
        &mut self,
        endpoint_id: String,
        tracks: HashMap<String, server::media_event::Track>,
    ) {
        if self.remote_peers.iter().all(|peer| peer.id != endpoint_id) {
            self.remote_peers.push(RemotePeer {
                id: endpoint_id.clone(),
                metadata_json: String::new(),
                tracks: Vec::new(),
            });
        }
        let incoming = negotiation::remote_peer(endpoint_id.clone(), String::new(), tracks);
        if let Some(peer) = self
            .remote_peers
            .iter_mut()
            .find(|peer| peer.id == endpoint_id)
        {
            for track in incoming.tracks {
                if let Some(existing) = peer
                    .tracks
                    .iter_mut()
                    .find(|current| current.id == track.id)
                {
                    *existing = track;
                } else {
                    peer.tracks.push(track);
                }
            }
        }
    }

    fn remove_remote_tracks(&mut self, track_ids: &[String]) {
        for peer in &mut self.remote_peers {
            peer.tracks
                .retain(|track| !track_ids.iter().any(|id| id == &track.id));
        }
    }

    fn update_remote_track(&mut self, track_id: &str, metadata_json: String) {
        for peer in &mut self.remote_peers {
            if let Some(track) = peer.tracks.iter_mut().find(|track| track.id == track_id) {
                track.metadata_json = metadata_json;
                return;
            }
        }
    }

    fn set_remote_encoding(&mut self, track_id: &str, variant: i32) {
        for peer in &mut self.remote_peers {
            if let Some(track) = peer.tracks.iter_mut().find(|track| track.id == track_id) {
                track.encoding = variant;
                return;
            }
        }
    }
}
