#![allow(dead_code)]

use std::cell::RefCell;
use std::sync::{Arc, Mutex, Once};
use std::time::Duration;

use fishjam_core::fishjam::media_events::{peer, server};
use fishjam_core::fishjam::{peer_message, PeerMessage};
use fishjam_core::sdk::{sdk_event, ClientConfig, PeerStatus, ReconnectionStatus, SdkEvent};
use fishjam_core::{
    FishjamClient, Scheduler, SignalingSocket, SocketConnector, SocketListener, TimerHandle,
};
use prost::Message;

#[derive(Default)]
pub struct MockSocketState {
    pub url: Option<String>,
    pub listener: Option<Arc<dyn SocketListener>>,
    pub sent: Vec<Vec<u8>>,
    pub closed: bool,
    pub connect_count: usize,
}

#[derive(Clone, Default)]
pub struct MockConnector {
    pub state: Arc<Mutex<MockSocketState>>,
}

struct MockSocket {
    state: Arc<Mutex<MockSocketState>>,
}

impl SignalingSocket for MockSocket {
    fn send(&self, data: Vec<u8>) {
        self.state.lock().unwrap().sent.push(data);
    }

    fn close(&self) {
        self.state.lock().unwrap().closed = true;
    }
}

impl SocketConnector for MockConnector {
    fn connect(&self, url: &str, listener: Arc<dyn SocketListener>) -> Box<dyn SignalingSocket> {
        let mut state = self.state.lock().unwrap();
        state.url = Some(url.to_owned());
        state.listener = Some(listener);
        state.sent.clear();
        state.closed = false;
        state.connect_count += 1;
        Box::new(MockSocket {
            state: self.state.clone(),
        })
    }
}

impl MockConnector {
    fn listener(&self) -> Arc<dyn SocketListener> {
        self.state
            .lock()
            .unwrap()
            .listener
            .clone()
            .expect("socket connected")
    }

    pub fn open(&self) {
        self.listener().on_open();
    }

    pub fn receive(&self, message: PeerMessage) {
        self.listener().on_message(message.encode_to_vec());
    }

    pub fn receive_server_event(&self, content: server::media_event::Content) {
        self.receive(PeerMessage {
            content: Some(peer_message::Content::ServerMediaEvent(
                server::MediaEvent {
                    content: Some(content),
                },
            )),
        });
    }

    pub fn close(&self, reason: &str) {
        self.listener().on_close(reason.to_owned());
    }

    pub fn sent(&self) -> Vec<PeerMessage> {
        self.state
            .lock()
            .unwrap()
            .sent
            .iter()
            .map(|bytes| PeerMessage::decode(bytes.as_slice()).expect("peer message"))
            .collect()
    }

    pub fn sent_peer_events(&self) -> Vec<peer::media_event::Content> {
        self.sent()
            .into_iter()
            .filter_map(|message| match message.content {
                Some(peer_message::Content::PeerMediaEvent(event)) => event.content,
                _ => None,
            })
            .collect()
    }

    pub fn is_closed(&self) -> bool {
        self.state.lock().unwrap().closed
    }
}

#[derive(Clone, Default)]
pub struct Events {
    pub events: Arc<Mutex<Vec<SdkEvent>>>,
}

impl Events {
    pub fn take(&self) -> Vec<sdk_event::Content> {
        std::mem::take(&mut *self.events.lock().unwrap())
            .into_iter()
            .filter_map(|event| event.content)
            .collect()
    }

    pub fn statuses(&self) -> Vec<PeerStatus> {
        self.take()
            .into_iter()
            .filter_map(|event| match event {
                sdk_event::Content::PeerStatusChanged(changed) => Some(changed.peer_status()),
                _ => None,
            })
            .collect()
    }

    pub fn reconnection_statuses(&self) -> Vec<ReconnectionStatus> {
        self.take()
            .into_iter()
            .filter_map(|event| match event {
                sdk_event::Content::ReconnectionStatusChanged(changed) => Some(changed.status()),
                _ => None,
            })
            .collect()
    }
}

/// A fake `Scheduler`: `schedule` just records `(delay, task)` instead of
/// waiting, so a test can fire a reconnection attempt or offline timeout on
/// demand and assert on the delay it was given.
type ScheduledTask = (Duration, Box<dyn FnOnce() + Send>);

#[derive(Default)]
pub struct MockScheduler {
    pending: Mutex<Vec<ScheduledTask>>,
}

impl Scheduler for MockScheduler {
    fn schedule(&self, delay: Duration, task: Box<dyn FnOnce() + Send>) -> TimerHandle {
        self.pending.lock().unwrap().push((delay, task));
        TimerHandle::detached()
    }
}

impl MockScheduler {
    /// Delays of everything scheduled and not yet fired, in the order they
    /// were scheduled.
    pub fn pending_delays(&self) -> Vec<Duration> {
        self.pending
            .lock()
            .unwrap()
            .iter()
            .map(|(d, _)| *d)
            .collect()
    }

    pub fn pending_count(&self) -> usize {
        self.pending.lock().unwrap().len()
    }

    /// Runs the task scheduled first, as if its delay had just elapsed.
    /// Panics if nothing is pending — tests should check `pending_count()`
    /// first when "nothing more is scheduled" is exactly what's expected.
    pub fn fire_next(&self) {
        let task = {
            let mut pending = self.pending.lock().unwrap();
            assert!(!pending.is_empty(), "no pending timer to fire");
            pending.remove(0).1
        };
        task();
    }
}

/// Delegates to a shared `Arc<MockScheduler>`, so a test can hand
/// `with_connector_and_scheduler` a `Box<dyn Scheduler>` while keeping its
/// own `Arc<MockScheduler>` to inspect and fire.
struct SharedMockScheduler(Arc<MockScheduler>);

impl Scheduler for SharedMockScheduler {
    fn schedule(&self, delay: Duration, task: Box<dyn FnOnce() + Send>) -> TimerHandle {
        self.0.schedule(delay, task)
    }
}

pub struct Harness {
    pub client: FishjamClient,
    pub socket: MockConnector,
    pub events: Events,
    pub scheduler: Arc<MockScheduler>,
}

pub fn harness(fishjam_id: &str) -> Harness {
    harness_with_client_type(fishjam_id, "android")
}

pub fn harness_with_client_type(fishjam_id: &str, client_type: &str) -> Harness {
    harness_with_config(ClientConfig {
        fishjam_id: fishjam_id.to_owned(),
        debug: false,
        client_type: client_type.to_owned(),
        ..Default::default()
    })
}

/// Same as [`harness`], with the full `ClientConfig` (e.g. a custom
/// `reconnect_config`) left to the caller.
pub fn harness_with_config(config: ClientConfig) -> Harness {
    let socket = MockConnector::default();
    let events = Events::default();
    let sink = events.clone();
    let scheduler = Arc::new(MockScheduler::default());
    let client = FishjamClient::with_connector_and_scheduler(
        config,
        Box::new(socket.clone()),
        Box::new(SharedMockScheduler(scheduler.clone())),
        move |event| sink.events.lock().unwrap().push(event),
    );
    Harness {
        client,
        socket,
        events,
        scheduler,
    }
}

pub fn authenticated(
    deprecation: Option<(peer_message::sdk_deprecation::Status, &str)>,
) -> PeerMessage {
    PeerMessage {
        content: Some(peer_message::Content::Authenticated(
            peer_message::Authenticated {
                room_type: peer_message::RoomType::Conference as i32,
                sdk_deprecation: deprecation.map(|(status, message)| {
                    peer_message::SdkDeprecation {
                        status: status as i32,
                        message: message.to_owned(),
                    }
                }),
            },
        )),
    }
}

/// Joins, authenticates, and connects a harness's client, the same way
/// `successful_join_sends_auth_and_connect_then_becomes_connected` does, then
/// discards the events from doing so.
pub fn join_and_connect(h: &Harness, peer_token: &str, metadata: &str, local_id: &str) {
    h.client.join_room(peer_token, metadata).unwrap();
    h.socket.open();
    h.socket.receive(authenticated(None));
    h.socket.receive_server_event(connected(local_id));
    h.events.take();
}

pub fn connected(local_id: &str) -> server::media_event::Content {
    let mut endpoints = std::collections::HashMap::new();
    endpoints.insert(
        local_id.to_owned(),
        server::media_event::Endpoint {
            endpoint_type: "webrtc".to_owned(),
            metadata_json: r#"{"peer":{"name":"me"},"server":{}}"#.to_owned(),
            track_id_to_track: Default::default(),
        },
    );
    server::media_event::Content::Connected(server::media_event::Connected {
        endpoint_id: local_id.to_owned(),
        endpoint_id_to_endpoint: endpoints,
        ice_servers: vec![server::media_event::IceServer {
            credential: "secret".to_owned(),
            urls: vec!["turn:turn.example.com:3478".to_owned()],
            username: "user".to_owned(),
        }],
    })
}

thread_local! {
    static LOGS: RefCell<Vec<(log::Level, String)>> = const { RefCell::new(Vec::new()) };
}

struct ThreadLogger;

impl log::Log for ThreadLogger {
    fn enabled(&self, _: &log::Metadata) -> bool {
        true
    }

    fn log(&self, record: &log::Record) {
        LOGS.with(|logs| {
            logs.borrow_mut()
                .push((record.level(), record.args().to_string()))
        });
    }

    fn flush(&self) {}
}

static LOGGER: ThreadLogger = ThreadLogger;
static INIT: Once = Once::new();

/// Collects log records written on the current thread.
pub fn capture_logs() {
    INIT.call_once(|| {
        log::set_logger(&LOGGER).unwrap();
        log::set_max_level(log::LevelFilter::Trace);
    });
    LOGS.with(|logs| logs.borrow_mut().clear());
}

pub fn logs() -> Vec<(log::Level, String)> {
    LOGS.with(|logs| logs.borrow().clone())
}
