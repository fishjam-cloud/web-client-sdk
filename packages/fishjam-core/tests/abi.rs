use std::os::raw::c_void;
use std::sync::mpsc;
use std::time::Duration;

use fishjam_core::fishjam::{peer_message, PeerMessage};
use fishjam_core::sdk::{
    sdk_event, sdk_request, sdk_response, ClientConfig, JoinRoom, LeaveRoom, PeerStatus, SdkEvent,
    SdkRequest, SdkResponse,
};
use fishjam_core::{
    fishjam_buf_free, fishjam_client_call, fishjam_client_free, fishjam_client_new, FishjamBuf,
};
use futures_util::{SinkExt, StreamExt};
use prost::Message;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::CloseFrame;

unsafe extern "C" fn on_event(user_data: *mut c_void, event: *const u8, len: usize) {
    let sender = unsafe { &*(user_data as *const mpsc::Sender<SdkEvent>) };
    let bytes = unsafe { std::slice::from_raw_parts(event, len) };
    sender.send(SdkEvent::decode(bytes).unwrap()).unwrap();
}

fn call(
    client: *mut fishjam_core::FishjamClient,
    request: sdk_request::Content,
) -> (i32, SdkResponse) {
    let bytes = SdkRequest {
        content: Some(request),
    }
    .encode_to_vec();
    let mut out = FishjamBuf {
        data: std::ptr::null_mut(),
        len: 0,
    };
    let code = unsafe { fishjam_client_call(client, bytes.as_ptr(), bytes.len(), &mut out) };
    let response =
        SdkResponse::decode(unsafe { std::slice::from_raw_parts(out.data, out.len) }).unwrap();
    unsafe { fishjam_buf_free(out) };
    (code, response)
}

fn next_status(events: &mpsc::Receiver<SdkEvent>) -> sdk_event::Content {
    loop {
        let event = events
            .recv_timeout(Duration::from_secs(10))
            .expect("event in time");
        if let Some(content @ sdk_event::Content::PeerStatusChanged(_)) = event.content {
            return content;
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
fn c_abi_join_room_reports_auth_error_and_leave_room_returns_to_idle() {
    let (url, tokens) = spawn_server();
    let config = ClientConfig {
        fishjam_id: url,
        debug: false,
    }
    .encode_to_vec();
    let (sender, events) = mpsc::channel::<SdkEvent>();
    let sender = Box::into_raw(Box::new(sender));

    let client = unsafe {
        fishjam_client_new(
            config.as_ptr(),
            config.len(),
            Some(on_event),
            sender as *mut c_void,
        )
    };
    assert!(!client.is_null());

    let (code, response) = call(
        client,
        sdk_request::Content::JoinRoom(JoinRoom {
            peer_token: "bad-token".to_owned(),
            peer_metadata_json: "{}".to_owned(),
        }),
    );
    assert_eq!(code, 0);
    assert!(matches!(
        response.content,
        Some(sdk_response::Content::Empty(_))
    ));

    match next_status(&events) {
        sdk_event::Content::PeerStatusChanged(changed) => {
            assert_eq!(changed.peer_status(), PeerStatus::Connecting)
        }
        _ => unreachable!(),
    }
    assert_eq!(
        tokens.recv_timeout(Duration::from_secs(10)).unwrap(),
        "bad-token"
    );
    match next_status(&events) {
        sdk_event::Content::PeerStatusChanged(changed) => {
            assert_eq!(changed.peer_status(), PeerStatus::Error);
            assert_eq!(changed.error.unwrap().auth_reason, "invalid token");
        }
        _ => unreachable!(),
    }

    let (code, _) = call(client, sdk_request::Content::LeaveRoom(LeaveRoom {}));
    assert_eq!(code, 0);
    match next_status(&events) {
        sdk_event::Content::PeerStatusChanged(changed) => {
            assert_eq!(changed.peer_status(), PeerStatus::Idle)
        }
        _ => unreachable!(),
    }

    unsafe {
        fishjam_client_free(client);
        drop(Box::from_raw(sender));
    }
}

#[test]
fn c_abi_rejects_undecodable_request() {
    let client = unsafe { fishjam_client_new(std::ptr::null(), 0, None, std::ptr::null_mut()) };
    let garbage = [0xffu8, 0xff, 0xff];
    let mut out = FishjamBuf {
        data: std::ptr::null_mut(),
        len: 0,
    };
    let code = unsafe { fishjam_client_call(client, garbage.as_ptr(), garbage.len(), &mut out) };
    assert_eq!(code, 2);
    let response =
        SdkResponse::decode(unsafe { std::slice::from_raw_parts(out.data, out.len) }).unwrap();
    assert!(matches!(
        response.content,
        Some(sdk_response::Content::Error(_))
    ));
    unsafe {
        fishjam_buf_free(out);
        fishjam_client_free(client);
    }
}

#[test]
fn c_abi_join_room_without_fishjam_id_is_illegal() {
    let client = unsafe { fishjam_client_new(std::ptr::null(), 0, None, std::ptr::null_mut()) };
    let (code, response) = call(
        client,
        sdk_request::Content::JoinRoom(JoinRoom {
            peer_token: "token".to_owned(),
            peer_metadata_json: "{}".to_owned(),
        }),
    );
    assert_eq!(code, 3);
    assert!(matches!(
        response.content,
        Some(sdk_response::Content::Error(_))
    ));
    unsafe { fishjam_client_free(client) };
}
