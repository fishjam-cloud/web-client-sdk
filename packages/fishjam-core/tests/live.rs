use std::sync::mpsc;
use std::time::Duration;

use fishjam_core::sdk::{sdk_event, ClientConfig, PeerStatus};
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
        },
        move |event| {
            if let Some(sdk_event::Content::PeerStatusChanged(changed)) = event.content {
                let _ = sender.send(changed);
            }
        },
    );

    client.join_room("bad-token", "{}").unwrap();

    let connecting = receiver.recv_timeout(Duration::from_secs(15)).unwrap();
    assert_eq!(connecting.peer_status(), PeerStatus::Connecting);
    let failed = receiver.recv_timeout(Duration::from_secs(15)).unwrap();
    assert_eq!(failed.peer_status(), PeerStatus::Error);
    let error = failed.error.unwrap();
    assert_eq!(error.auth_reason, "invalid token", "{error:?}");
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
        },
        move |event| {
            if let Some(sdk_event::Content::PeerStatusChanged(changed)) = event.content {
                let _ = sender.send(changed);
            }
        },
    );

    client.join_room(&token, r#"{"name":"core"}"#).unwrap();

    let connecting = receiver.recv_timeout(Duration::from_secs(15)).unwrap();
    assert_eq!(connecting.peer_status(), PeerStatus::Connecting);
    let joined = receiver.recv_timeout(Duration::from_secs(15)).unwrap();
    assert_eq!(joined.peer_status(), PeerStatus::Connected, "{joined:?}");
    client.leave_room();
}
