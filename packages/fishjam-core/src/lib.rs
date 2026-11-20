uniffi::setup_scaffolding!();

#[allow(clippy::all)]
mod proto {
    include!(concat!(env!("OUT_DIR"), "/protos.rs"));
}

mod api;
mod auth;
mod client;
mod negotiation;
mod platform_log;
mod reconnect;
pub mod sdk;
mod signaling;
mod url;

pub use api::{install_logger, CoreEventListener, FishjamCoreClient};
pub use client::{sdk_version, FishjamClient};
pub use proto::fishjam;
pub use signaling::{
    Scheduler, SignalingSocket, SocketConnector, SocketListener, TimerHandle, TokioScheduler,
    TungsteniteConnector,
};
pub use url::websocket_url;
