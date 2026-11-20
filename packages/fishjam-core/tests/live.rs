use std::sync::mpsc;
use std::time::Duration;

use fishjam_core::sdk::{AuthErrorReason, ClientConfig, PeerStatus, SdkEvent};
use fishjam_core::FishjamClient;

fn fishjam_id() -> String {
    if let Ok(value) = std::env::var("FISHJAM_ID") {
        let value = value.trim().trim_matches('"').to_owned();
        if !value.is_empty() {
            return value;
        }
    }
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.env");
    let text = std::fs::read_to_string(&path).unwrap_or_default();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        if key.trim() == "FISHJAM_ID" {
            let value = value.trim().trim_matches('"');
            if !value.is_empty() {
                return value.to_owned();
            }
        }
    }
    panic!("Set FISHJAM_ID in the environment or in .env");
}

/// Needs network access: `cargo test --test live -- --ignored`.
#[test]
#[ignore]
fn sandbox_rejects_bad_token_over_tls() {
    let (sender, receiver) = mpsc::channel();
    let client = FishjamClient::new(
        ClientConfig {
            fishjam_id: fishjam_id(),
            debug: false,
            client_type: "android".to_owned(),
            ..Default::default()
        },
        move |event| {
            if let SdkEvent::PeerStatusChanged { peer_status, error } = event {
                let _ = sender.send((peer_status, error));
            }
        },
    );

    client.join_room("bad-token", "{}").unwrap();

    let (connecting, _) = receiver.recv_timeout(Duration::from_secs(15)).unwrap();
    assert_eq!(connecting, PeerStatus::Connecting);
    let (failed, error) = receiver.recv_timeout(Duration::from_secs(15)).unwrap();
    assert_eq!(failed, PeerStatus::Error);
    let error = error.unwrap();
    assert_eq!(
        error.auth_reason(),
        Some(AuthErrorReason::InvalidToken),
        "{error:?}"
    );
}

/// Needs network access and `FISHJAM_PEER_TOKEN` from the sandbox room manager.
#[test]
#[ignore]
fn sandbox_accepts_good_token() {
    let token = std::env::var("FISHJAM_PEER_TOKEN").expect("FISHJAM_PEER_TOKEN");
    let (sender, receiver) = mpsc::channel();
    let client = FishjamClient::new(
        ClientConfig {
            fishjam_id: fishjam_id(),
            debug: false,
            client_type: "android".to_owned(),
            ..Default::default()
        },
        move |event| {
            if let SdkEvent::PeerStatusChanged { peer_status, error } = event {
                let _ = sender.send((peer_status, error));
            }
        },
    );

    client.join_room(&token, r#"{"name":"core"}"#).unwrap();

    let (connecting, _) = receiver.recv_timeout(Duration::from_secs(15)).unwrap();
    assert_eq!(connecting, PeerStatus::Connecting);
    let (joined, error) = receiver.recv_timeout(Duration::from_secs(15)).unwrap();
    assert_eq!(joined, PeerStatus::Connected, "{error:?}");
    client.leave_room();
}
