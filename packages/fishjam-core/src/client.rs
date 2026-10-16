use std::sync::{Arc, Mutex, MutexGuard, Weak};

use prost::Message;

use crate::auth::{is_auth_error, is_join_error, normalize_close_reason};
use crate::fishjam::media_events::{peer, server};
use crate::fishjam::{peer_message, PeerMessage};
use crate::sdk::{sdk_event, ClientConfig, Error, PeerStatus, PeerStatusChanged, SdkEvent};
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
    is_audio_only: bool,
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
                    is_audio_only: false,
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
        self.local_endpoint_id = None;
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
        match content {
            server::media_event::Content::Connected(connected) => {
                self.local_endpoint_id = Some(connected.endpoint_id);
                self.set_status(PeerStatus::Connected, None, events);
            }
            server::media_event::Content::Error(error) => {
                self.set_status(
                    PeerStatus::Error,
                    Some(Error {
                        message: error.message,
                        ..Default::default()
                    }),
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
        self.set_status(PeerStatus::Error, Some(error), events);
    }
}
