use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard, Weak};
use std::time::Duration;

use prost::Message;

use crate::auth::{auth_error_reason, join_error_reason, normalize_close_reason};
use crate::fishjam::media_events::{peer, server};
use crate::fishjam::{peer_message, PeerMessage};
use crate::negotiation::{self, LocalTrack, RemotePeer};
use crate::platform_log;
use crate::reconnect::{
    classify_network_change, NetworkChange, ReconnectConfig, ReconnectManager, ReconnectOutcome,
};
use crate::sdk::{
    sdk_event, AddIceCandidate, AddSendonlyTransceiver, ClientConfig, ClosePeerConnection,
    CreateOffer, CreatePeerConnection, Error, IceServer, NegotiationStatus, PeerJoined, PeerLeft,
    PeerStatus, PeerStatusChanged, PeerUpdated, ReconnectionStatus, ReconnectionStatusChanged,
    RemoveSendTrack, RoomState, RoomStateChanged, SdkEvent, SdpType, SetLocalDescription,
    SetRemoteDescription, TrackAdded, TrackKind, TrackMetadata, TrackReady, TrackRemoved,
    TrackState, TrackUpdated, UpdateRecvonlyTransceivers,
};
use crate::signaling::{
    Scheduler, SignalingSocket, SocketConnector, SocketListener, TokioScheduler,
    TungsteniteConnector,
};
use crate::url::websocket_url;

/// `authRequest.sdk_version`, same shape as `${clientType}-${packageVersion}` in ts-client.
/// Android sends `android-<version>`. iOS sends `ios-<version>`.
/// An empty client type uses the build target (`android`, `ios`, or `mobile` on the host).
pub fn sdk_version(client_type: &str) -> String {
    let client_type = if client_type.is_empty() {
        default_client_type()
    } else {
        client_type
    };
    format!("{client_type}-{}", env!("CARGO_PKG_VERSION"))
}

fn default_client_type() -> &'static str {
    #[cfg(target_os = "android")]
    {
        "android"
    }
    #[cfg(target_os = "ios")]
    {
        "ios"
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        "mobile"
    }
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
    /// Runs reconnection backoff/offline timers; swapped for a fake in tests.
    scheduler: Box<dyn Scheduler>,
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
    reconnect: ReconnectManager,
    /// The OS's last-reported default network, as seen through
    /// `network_status_changed`. Used to classify the next report (lost,
    /// available, or changed to a different network).
    network_online: bool,
    network_id: String,
    /// Set by a reconnect decision for `Inner::apply_pending_schedule` to
    /// act on once the state lock is released.
    pending_schedule: Option<PendingSchedule>,
}

/// What `Inner::apply_pending_schedule` should do once a `State` method
/// (run while the lock was held) decided a reconnect attempt or offline
/// timeout needs to be scheduled.
enum PendingSchedule {
    /// Open a new socket, after an optional delay (`None` = immediately).
    /// `fresh_network` is passed through to
    /// `ReconnectManager::note_attempt_started` once it actually opens.
    Attempt {
        delay: Option<Duration>,
        fresh_network: bool,
    },
    /// If still offline after this long, give up.
    OfflineTimeout(Duration),
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
        Self::with_connector_and_scheduler(config, connector, Box::new(TokioScheduler), on_event)
    }

    /// Same as [`Self::with_connector`], with the scheduler used for
    /// reconnection backoff/offline timers also overridable — mainly for
    /// tests, so a fake scheduler can fire attempts on demand instead of
    /// waiting for real delays.
    pub fn with_connector_and_scheduler(
        config: ClientConfig,
        connector: Box<dyn SocketConnector>,
        scheduler: Box<dyn Scheduler>,
        on_event: impl Fn(SdkEvent) + Send + Sync + 'static,
    ) -> Self {
        platform_log::install(config.debug);
        let reconnect =
            ReconnectManager::new(ReconnectConfig::resolve(config.reconnect_config.as_ref()));
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
                    reconnect,
                    network_online: true,
                    network_id: String::new(),
                    pending_schedule: None,
                }),
                connector,
                scheduler,
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
            state.reset_reconnection(events);
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
        self.inner.apply_pending_schedule();
    }

    /// Reported by the native layer when the OS's default network path
    /// changes. `network_id` identifies which network is current (opaque,
    /// e.g. interface type); empty when offline.
    pub fn network_status_changed(&self, online: bool, network_id: &str) {
        let network_id = network_id.to_owned();
        self.inner.process(|state, events| {
            state.network_status_changed(online, &network_id, events);
        });
        self.inner.apply_pending_schedule();
    }
}

fn error(message: &str) -> Error {
    let normalized = normalize_close_reason(message);
    let auth = auth_error_reason(&normalized);
    let join = join_error_reason(&normalized);
    if auth.is_none() && join.is_none() {
        return Error {
            message: message.to_owned(),
            ..Default::default()
        };
    }
    Error {
        message: normalized.clone(),
        auth_reason: if auth.is_some() {
            normalized.clone()
        } else {
            String::new()
        },
        join_reason: if join.is_some() {
            normalized
        } else {
            String::new()
        },
        auth_error_reason: auth.map(|reason| reason as i32).unwrap_or(0),
        join_error_reason: join.map(|reason| reason as i32).unwrap_or(0),
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

    /// Runs whatever `State` asked for after a reconnect decision: opening a
    /// new socket (now or after a delay) or arming the offline timeout.
    /// Called after `process`/`process_socket` returns, never from inside
    /// it, so it never runs while the state lock is held.
    fn apply_pending_schedule(self: &Arc<Self>) {
        let pending = {
            let mut state = self.lock_state();
            state
                .pending_schedule
                .take()
                .map(|pending| (pending, state.reconnect.generation()))
        };
        let Some((pending, generation)) = pending else {
            return;
        };
        match pending {
            PendingSchedule::Attempt {
                delay: None,
                fresh_network,
            } => self.fire_attempt(generation, fresh_network),
            PendingSchedule::Attempt {
                delay: Some(delay),
                fresh_network,
            } => {
                let weak = Arc::downgrade(self);
                self.scheduler.schedule(
                    delay,
                    Box::new(move || {
                        if let Some(inner) = weak.upgrade() {
                            inner.fire_attempt(generation, fresh_network);
                        }
                    }),
                );
            }
            PendingSchedule::OfflineTimeout(timeout) => {
                let weak = Arc::downgrade(self);
                self.scheduler.schedule(
                    timeout,
                    Box::new(move || {
                        if let Some(inner) = weak.upgrade() {
                            inner.fire_offline_timeout(generation);
                        }
                    }),
                );
            }
        }
    }

    /// Opens a new socket for a reconnect attempt, reusing the stored
    /// `peer_token` (so the rejoin reuses the same auth) and
    /// `peer_metadata_json` (the last peer metadata). No-ops if
    /// `reconnect_generation` no longer matches — a `reset`, terminal
    /// close, or newer decision superseded this one in the meantime.
    fn fire_attempt(self: &Arc<Self>, reconnect_generation: u64, fresh_network: bool) {
        let weak = Arc::downgrade(self);
        self.process(|state, events| {
            if state.reconnect.generation() != reconnect_generation {
                return;
            }
            let url = match websocket_url(&state.config.fishjam_id) {
                Ok(url) => url,
                Err(message) => {
                    // Extremely unlikely: the same URL already worked for
                    // the original join. Treat it like another retryable
                    // loss of this attempt.
                    let outcome = state.reconnect.on_retryable_loss();
                    state.apply_reconnect_outcome(outcome, error(&message), events);
                    return;
                }
            };
            state.reconnect.note_attempt_started(fresh_network);
            state.generation += 1;
            let listener = Arc::new(Listener {
                inner: weak.clone(),
                generation: state.generation,
            });
            state.socket = Some(self.connector.connect(&url, listener));
        });
        self.apply_pending_schedule();
    }

    /// The device stayed offline past `offline_timeout`: give up.
    fn fire_offline_timeout(self: &Arc<Self>, reconnect_generation: u64) {
        self.process(|state, events| {
            if state.reconnect.generation() != reconnect_generation {
                return;
            }
            let outcome = state.reconnect.on_offline_timeout();
            state.apply_reconnect_outcome(
                outcome,
                error("Offline for too long while reconnecting"),
                events,
            );
        });
        self.apply_pending_schedule();
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
            inner.apply_pending_schedule();
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
        self.reset_reconnection(events);
        let had_session = self.local_endpoint_id.is_some() || self.peer_connection_open;
        self.reset_media(false, events);
        if had_session {
            self.emit_room(events);
        }
        self.set_status(PeerStatus::Idle, None, events);
    }

    /// Explicit `join_room`/`leave_room`: cancels any in-flight
    /// reconnection. Emits `ReconnectionStatusChanged(Idle)` if it wasn't
    /// already idle.
    fn reset_reconnection(&mut self, events: &mut Vec<SdkEvent>) {
        if self.reconnect.reset() {
            self.emit_reconnection_status(ReconnectionStatus::Idle, events);
        }
    }

    fn emit_reconnection_status(&self, status: ReconnectionStatus, events: &mut Vec<SdkEvent>) {
        self.emit(
            sdk_event::Content::ReconnectionStatusChanged(ReconnectionStatusChanged {
                status: status as i32,
            }),
            events,
        );
    }

    /// Applies what `ReconnectManager` decided after a retryable loss
    /// (socket close/error other than auth/join, an ICE/RTCPeerConnection
    /// failure, or the network dying/changing while connected): either
    /// ends the session for good, or tears the current one down and
    /// arranges the next attempt.
    fn apply_reconnect_outcome(
        &mut self,
        outcome: ReconnectOutcome,
        error: Error,
        events: &mut Vec<SdkEvent>,
    ) {
        match outcome {
            ReconnectOutcome::None => {}
            ReconnectOutcome::Disabled => self.end_session(Some(error), events),
            ReconnectOutcome::GiveUp => {
                self.emit_reconnection_status(ReconnectionStatus::Error, events);
                self.end_session(Some(error), events);
            }
            ReconnectOutcome::ScheduleAttempt {
                emit_started,
                delay,
            } => {
                self.teardown_for_retry(emit_started, events);
                self.pending_schedule = Some(PendingSchedule::Attempt {
                    delay: Some(delay),
                    fresh_network: false,
                });
            }
            ReconnectOutcome::StartAttemptNow { emit_started } => {
                // No `teardown_for_retry` here: a network change either (a)
                // arrives while already `Reconnecting` — the loss that
                // started it already tore things down — or (b) is reported
                // alongside a loss noted moments earlier in the same call
                // (see `network_status_changed`), which tears down itself.
                if emit_started {
                    self.emit_reconnection_status(ReconnectionStatus::Reconnecting, events);
                }
                self.pending_schedule = Some(PendingSchedule::Attempt {
                    delay: None,
                    fresh_network: true,
                });
            }
            ReconnectOutcome::WaitForNetwork { emit_started } => {
                self.teardown_for_retry(emit_started, events);
                self.pending_schedule = Some(PendingSchedule::OfflineTimeout(
                    self.reconnect.offline_timeout(),
                ));
            }
        }
    }

    /// Tears the current session down for a retry: closes the socket and
    /// peer connection (if any), keeps `local_tracks` pending re-publish
    /// when `add_tracks_on_reconnect` is set (otherwise clears them like a
    /// normal disconnect), and emits `ReconnectionStatusChanged(Reconnecting)`
    /// the first time this reconnection enters that state.
    fn teardown_for_retry(&mut self, emit_started: bool, events: &mut Vec<SdkEvent>) {
        if let Some(socket) = self.socket.take() {
            socket.close();
        }
        self.socket_open = false;
        let had_session = self.local_endpoint_id.is_some() || self.peer_connection_open;
        let keep_tracks = self.reconnect.add_tracks_on_reconnect();
        self.reset_media(keep_tracks, events);
        if had_session {
            self.emit_room(events);
        }
        if emit_started {
            self.emit_reconnection_status(ReconnectionStatus::Reconnecting, events);
        }
    }

    /// Final teardown, used both when reconnection is disabled/exhausted
    /// and for an auth/join error: closes the socket if any, tears media
    /// down for good (never keeps tracks pending), and sets
    /// `PeerStatus::Error`.
    fn end_session(&mut self, error: Option<Error>, events: &mut Vec<SdkEvent>) {
        if let Some(socket) = self.socket.take() {
            socket.close();
        }
        self.socket_open = false;
        let had_session = self.local_endpoint_id.is_some() || self.peer_connection_open;
        self.reset_media(false, events);
        if had_session {
            self.emit_room(events);
        }
        self.set_status(PeerStatus::Error, error, events);
    }

    fn on_socket_open(&mut self) {
        self.socket_open = true;
        self.send(peer_message::Content::AuthRequest(
            peer_message::AuthRequest {
                token: self.peer_token.clone(),
                sdk_version: sdk_version(&self.config.client_type),
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
                let endpoint_id = added.endpoint_id.clone();
                let existed = self.remote_peers.iter().any(|peer| peer.id == endpoint_id);
                self.upsert_remote_peer(added.endpoint_id, added.metadata_json);
                if let Some(peer) = self
                    .remote_peers
                    .iter()
                    .find(|peer| peer.id == endpoint_id)
                    .map(negotiation::remote_peer_state)
                {
                    if existed {
                        self.emit(
                            sdk_event::Content::PeerUpdated(PeerUpdated { peer: Some(peer) }),
                            events,
                        );
                    } else {
                        self.emit(
                            sdk_event::Content::PeerJoined(PeerJoined { peer: Some(peer) }),
                            events,
                        );
                    }
                }
                self.emit_room(events);
            }
            server::media_event::Content::EndpointRemoved(removed) => {
                self.on_endpoint_removed(&removed.endpoint_id, events);
            }
            server::media_event::Content::EndpointUpdated(updated) => {
                if updated.endpoint_id == self.local_id() {
                    return;
                }
                let endpoint_id = updated.endpoint_id.clone();
                if let Some(peer) = self
                    .remote_peers
                    .iter_mut()
                    .find(|peer| peer.id == updated.endpoint_id)
                {
                    peer.metadata_json = updated.metadata_json;
                } else {
                    return;
                }
                if let Some(peer) = self
                    .remote_peers
                    .iter()
                    .find(|peer| peer.id == endpoint_id)
                    .map(negotiation::remote_peer_state)
                {
                    self.emit(
                        sdk_event::Content::PeerUpdated(PeerUpdated { peer: Some(peer) }),
                        events,
                    );
                }
                self.emit_room(events);
            }
            server::media_event::Content::TracksAdded(added) => {
                self.ongoing_renegotiation = true;
                if added.endpoint_id == self.local_id() {
                    return;
                }
                self.add_remote_tracks(added.endpoint_id, added.track_id_to_track, events);
                self.emit_room(events);
            }
            server::media_event::Content::TracksRemoved(removed) => {
                if removed.endpoint_id == self.local_id() {
                    return;
                }
                for (peer_id, track) in self.take_remote_tracks(&removed.track_ids) {
                    self.emit_track_removed(&peer_id, track, events);
                }
                self.emit_room(events);
            }
            server::media_event::Content::TrackUpdated(updated) => {
                if updated.endpoint_id == self.local_id() {
                    return;
                }
                if let Some((peer_id, track)) =
                    self.update_remote_track(&updated.track_id, updated.metadata_json)
                {
                    self.emit(
                        sdk_event::Content::TrackUpdated(TrackUpdated {
                            peer_id,
                            track: Some(track),
                        }),
                        events,
                    );
                }
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
        if auth_error_reason(&normalized).is_some() || join_error_reason(&normalized).is_some() {
            self.fail_terminally(error(&normalized), events);
            return;
        }

        let error = Error {
            message: format!("Socket closed: {reason}"),
            ..Default::default()
        };
        let outcome = self.reconnect.on_retryable_loss();
        self.apply_reconnect_outcome(outcome, error, events);
    }

    /// An auth/join error: never retried, matching the user requirement
    /// that these two never trigger a reconnect attempt.
    fn fail_terminally(&mut self, error: Error, events: &mut Vec<SdkEvent>) {
        if self.reconnect.on_terminal_close() == ReconnectOutcome::GiveUp {
            self.emit_reconnection_status(ReconnectionStatus::Error, events);
        }
        self.end_session(Some(error), events);
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

    /// When `keep_local_tracks` is set, tracks are kept (marked pending
    /// re-publish on the next offer) instead of cleared — used for a
    /// retryable loss when `add_tracks_on_reconnect` is on. Every other
    /// caller (explicit disconnect, an auth/join error, or the final
    /// give-up) passes `false`.
    fn reset_media(&mut self, keep_local_tracks: bool, events: &mut Vec<SdkEvent>) {
        if self.peer_connection_open {
            self.peer_connection_open = false;
            self.emit(
                sdk_event::Content::ClosePeerConnection(ClosePeerConnection {}),
                events,
            );
        }
        self.local_endpoint_id = None;
        self.local_metadata_json.clear();
        if keep_local_tracks {
            for track in &mut self.local_tracks {
                track.sent_to_connection = false;
                track.negotiation = NegotiationStatus::Awaiting as i32;
            }
        } else {
            self.local_tracks.clear();
        }
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
        self.remote_peers
            .sort_by(|left, right| left.id.cmp(&right.id));
        let peers: Vec<_> = self
            .remote_peers
            .iter()
            .map(negotiation::remote_peer_state)
            .collect();
        for peer in peers {
            let peer_id = peer.id.clone();
            for track in peer.tracks.clone() {
                self.emit(
                    sdk_event::Content::TrackAdded(TrackAdded {
                        peer_id: peer_id.clone(),
                        track: Some(track),
                    }),
                    events,
                );
            }
            self.emit(
                sdk_event::Content::PeerJoined(PeerJoined { peer: Some(peer) }),
                events,
            );
        }
        self.emit_room(events);
        if self.reconnect.on_session_joined() {
            self.emit_reconnection_status(ReconnectionStatus::Idle, events);
        }
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
        // A track added after this cycle's offer was created is not in the answer, so it needs
        // its own offer/answer cycle. Without this it would wait for a renegotiation nobody asks for.
        if self
            .local_tracks
            .iter()
            .any(|track| !track.sent_to_connection)
        {
            self.ongoing_renegotiation = true;
            self.send_media_event(peer::media_event::Content::RenegotiateTracks(
                peer::media_event::RenegotiateTracks {},
            ));
        }
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
        let Some(index) = self
            .local_tracks
            .iter()
            .position(|track| track.id == track_id)
        else {
            return Err(error("Cannot find track"));
        };
        let track = self.local_tracks.remove(index);
        // During reconnect the endpoint is gone but kept tracks are still here.
        // Drop the track so the next offer does not publish a device the user
        // already turned off. Renegotiate only while a session is open.
        let session_open = self.local_endpoint_id.is_some() || self.peer_connection_open;
        if session_open {
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
        }
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
        let mut ready = None;
        for peer in &mut self.remote_peers {
            if let Some(track) = peer.tracks.iter_mut().find(|track| track.id == track_id) {
                if !track.ready {
                    track.ready = true;
                    ready = Some((peer.id.clone(), negotiation::remote_track_state(track)));
                }
                break;
            }
        }
        if let Some((peer_id, track)) = ready {
            self.emit(
                sdk_event::Content::TrackReady(TrackReady {
                    peer_id,
                    track: Some(track),
                }),
                events,
            );
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
            let outcome = self.reconnect.on_retryable_loss();
            self.apply_reconnect_outcome(outcome, error("RTCPeerConnection failed"), events);
        } else if ice_connection_state == "failed" {
            let outcome = self.reconnect.on_retryable_loss();
            self.apply_reconnect_outcome(outcome, error("ICE connection failed"), events);
        }
        if ice_connection_state == "disconnected" {
            self.ongoing_renegotiation = true;
            self.send_media_event(peer::media_event::Content::RenegotiateTracks(
                peer::media_event::RenegotiateTracks {},
            ));
        }
    }

    /// Reported by the native layer when the OS's default network path
    /// changes. Classifies it against the previous report the same way
    /// Flutter's `NetworkChangeDetector` does, then reacts: while connected,
    /// losing or changing the network proactively starts a reconnect
    /// instead of waiting for the socket to notice; while reconnecting, it
    /// drives the offline wait / per-network attempt budget.
    fn network_status_changed(
        &mut self,
        online: bool,
        network_id: &str,
        events: &mut Vec<SdkEvent>,
    ) {
        let previous_online = self.network_online;
        let previous_id = std::mem::replace(&mut self.network_id, network_id.to_owned());
        self.network_online = online;
        let Some(change) =
            classify_network_change(previous_online, &previous_id, online, network_id)
        else {
            return;
        };

        match change {
            NetworkChange::Lost => {
                // Mark the device offline before starting a reconnection.
                // Otherwise the loss opens a socket immediately and the
                // retries are spent with nowhere to connect.
                let outcome = self.reconnect.on_network_lost();
                self.apply_reconnect_outcome(outcome, error("network lost"), events);
                if self.peer_status == PeerStatus::Connected {
                    let outcome = self.reconnect.on_retryable_loss();
                    self.apply_reconnect_outcome(outcome, error("network lost"), events);
                }
            }
            NetworkChange::Available => {
                let outcome = self.reconnect.on_network_available();
                self.apply_reconnect_outcome(
                    outcome,
                    error("Reconnection attempts exhausted after a network change"),
                    events,
                );
            }
            NetworkChange::Changed => {
                if self.peer_status == PeerStatus::Connected {
                    let outcome = self.reconnect.on_retryable_loss();
                    self.apply_reconnect_outcome(outcome, error("network changed"), events);
                }
                let outcome = self.reconnect.on_network_available();
                self.apply_reconnect_outcome(
                    outcome,
                    error("Reconnection attempts exhausted after a network change"),
                    events,
                );
            }
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
            self.reset_media(false, events);
            self.emit_room(events);
            self.set_status(PeerStatus::Idle, None, events);
            return;
        }
        let Some(index) = self
            .remote_peers
            .iter()
            .position(|peer| peer.id == endpoint_id)
        else {
            return;
        };
        let peer = self.remote_peers.remove(index);
        let peer_id = peer.id.clone();
        let removed: Vec<TrackState> = peer
            .tracks
            .iter()
            .map(negotiation::remote_track_state)
            .collect();
        for track in removed {
            self.emit_track_removed(&peer_id, track, events);
        }
        self.emit(
            sdk_event::Content::PeerLeft(PeerLeft {
                peer: Some(crate::sdk::PeerState {
                    id: peer.id,
                    metadata_json: peer.metadata_json,
                    ..Default::default()
                }),
            }),
            events,
        );
        self.emit_room(events);
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
        events: &mut Vec<SdkEvent>,
    ) {
        let created = self.remote_peers.iter().all(|peer| peer.id != endpoint_id);
        if created {
            self.remote_peers.push(RemotePeer {
                id: endpoint_id.clone(),
                metadata_json: String::new(),
                tracks: Vec::new(),
            });
            let joined = negotiation::remote_peer_state(
                self.remote_peers
                    .last()
                    .expect("remote peer was just inserted"),
            );
            self.emit(
                sdk_event::Content::PeerJoined(PeerJoined { peer: Some(joined) }),
                events,
            );
        }
        let incoming = negotiation::remote_peer(endpoint_id.clone(), String::new(), tracks);
        let mut added = Vec::new();
        let mut updated = Vec::new();
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
                    updated.push(negotiation::remote_track_state(existing));
                } else {
                    added.push(negotiation::remote_track_state(&track));
                    peer.tracks.push(track);
                }
            }
        }
        for track in added {
            self.emit(
                sdk_event::Content::TrackAdded(TrackAdded {
                    peer_id: endpoint_id.clone(),
                    track: Some(track),
                }),
                events,
            );
        }
        for track in updated {
            self.emit(
                sdk_event::Content::TrackUpdated(TrackUpdated {
                    peer_id: endpoint_id.clone(),
                    track: Some(track),
                }),
                events,
            );
        }
    }

    fn take_remote_tracks(&mut self, track_ids: &[String]) -> Vec<(String, TrackState)> {
        let mut removed = Vec::new();
        for peer in &mut self.remote_peers {
            let mut kept = Vec::new();
            for track in peer.tracks.drain(..) {
                if track_ids.iter().any(|id| id == &track.id) {
                    removed.push((peer.id.clone(), negotiation::remote_track_state(&track)));
                } else {
                    kept.push(track);
                }
            }
            peer.tracks = kept;
        }
        removed
    }

    fn emit_track_removed(&self, peer_id: &str, track: TrackState, events: &mut Vec<SdkEvent>) {
        self.emit(
            sdk_event::Content::TrackRemoved(TrackRemoved {
                peer_id: peer_id.to_owned(),
                track: Some(track),
            }),
            events,
        );
    }

    fn update_remote_track(
        &mut self,
        track_id: &str,
        metadata_json: String,
    ) -> Option<(String, TrackState)> {
        for peer in &mut self.remote_peers {
            if let Some(track) = peer.tracks.iter_mut().find(|track| track.id == track_id) {
                track.metadata_json = metadata_json;
                return Some((peer.id.clone(), negotiation::remote_track_state(track)));
            }
        }
        None
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
