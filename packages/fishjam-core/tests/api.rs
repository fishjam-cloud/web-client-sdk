use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;

use fishjam_core::fishjam::{peer_message, PeerMessage};
use fishjam_core::sdk::{AuthErrorReason, ClientConfig, CoreError, PeerStatus, SdkEvent};
use fishjam_core::{CoreEventListener, FishjamCoreClient};
use futures_util::{SinkExt, StreamExt};
use prost::Message;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::CloseFrame;

struct ChannelListener(Mutex<mpsc::Sender<SdkEvent>>);

impl CoreEventListener for ChannelListener {
    fn on_event(&self, event: SdkEvent) {
        let _ = self.0.lock().unwrap().send(event);
    }
}

fn client(config: ClientConfig) -> (FishjamCoreClient, mpsc::Receiver<SdkEvent>) {
    let (sender, events) = mpsc::channel();
    let listener = Arc::new(ChannelListener(Mutex::new(sender)));
    (FishjamCoreClient::new(config, listener), events)
}

fn next_status(events: &mpsc::Receiver<SdkEvent>) -> (PeerStatus, Option<CoreError>) {
    loop {
        let event = events
            .recv_timeout(Duration::from_secs(10))
            .expect("event in time");
        if let SdkEvent::PeerStatusChanged { peer_status, error } = event {
            return (peer_status, error);
        }
    }
}

/// Accepts one peer, returns the auth token it sent, then closes with `invalid token`.
fn spawn_server() -> (String, mpsc::Receiver<String>) {
    let (port_tx, port_rx) = mpsc::channel();
    let (token_tx, token_rx) = mpsc::channel();
    std::thread::spawn(move || {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async move {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            port_tx.send(listener.local_addr().unwrap().port()).unwrap();
            let (stream, _) = listener.accept().await.unwrap();
            let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
            while let Some(Ok(message)) = socket.next().await {
                if message.is_binary() {
                    let peer_message = PeerMessage::decode(message.into_data()).unwrap();
                    if let Some(peer_message::Content::AuthRequest(auth)) = peer_message.content {
                        token_tx.send(auth.token).unwrap();
                        socket
                            .send(tokio_tungstenite::tungstenite::Message::Close(Some(
                                CloseFrame {
                                    code: CloseCode::Policy,
                                    reason: "invalid token".into(),
                                },
                            )))
                            .await
                            .unwrap();
                    }
                }
            }
        });
    });
    let port = port_rx.recv().unwrap();
    (format!("http://127.0.0.1:{port}"), token_rx)
}

#[test]
fn join_room_reports_auth_error_and_leave_room_returns_to_idle() {
    let (url, tokens) = spawn_server();
    let (client, events) = client(ClientConfig {
        fishjam_id: url,
        client_type: "android".to_owned(),
        ..Default::default()
    });

    client
        .join_room("bad-token".to_owned(), "{}".to_owned())
        .unwrap();

    assert_eq!(next_status(&events).0, PeerStatus::Connecting);
    assert_eq!(
        tokens.recv_timeout(Duration::from_secs(10)).unwrap(),
        "bad-token"
    );
    let (status, error) = next_status(&events);
    assert_eq!(status, PeerStatus::Error);
    assert_eq!(
        error.unwrap().auth_reason(),
        Some(AuthErrorReason::InvalidToken)
    );

    client.leave_room();
    assert_eq!(next_status(&events).0, PeerStatus::Idle);
}

#[test]
fn join_room_without_fishjam_id_fails() {
    let (client, _events) = client(ClientConfig::default());
    let error = client
        .join_room("token".to_owned(), "{}".to_owned())
        .unwrap_err();
    assert!(matches!(error, CoreError::Failed { .. }));
}
