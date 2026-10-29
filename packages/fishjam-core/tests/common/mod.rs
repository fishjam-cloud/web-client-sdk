#![allow(dead_code)]

use std::cell::RefCell;
use std::sync::{Arc, Mutex, Once};

use fishjam_core::fishjam::media_events::{peer, server};
use fishjam_core::fishjam::{peer_message, PeerMessage};
use fishjam_core::sdk::{sdk_event, ClientConfig, PeerStatus, SdkEvent};
use fishjam_core::{FishjamClient, SignalingSocket, SocketConnector, SocketListener};
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
}

pub struct Harness {
    pub client: FishjamClient,
    pub socket: MockConnector,
    pub events: Events,
}

pub fn harness(fishjam_id: &str) -> Harness {
    let socket = MockConnector::default();
    let events = Events::default();
    let sink = events.clone();
    let client = FishjamClient::with_connector(
        ClientConfig {
            fishjam_id: fishjam_id.to_owned(),
            debug: false,
        },
        Box::new(socket.clone()),
        move |event| sink.events.lock().unwrap().push(event),
    );
    Harness {
        client,
        socket,
        events,
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
