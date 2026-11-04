#[allow(clippy::all)]
mod proto {
    include!(concat!(env!("OUT_DIR"), "/protos.rs"));
}

mod abi;
mod auth;
mod client;
mod negotiation;
mod platform_log;
mod reconnect;
mod signaling;
mod url;

pub use abi::{
    fishjam_buf_free, fishjam_client_call, fishjam_client_free, fishjam_client_new,
    fishjam_install_logger, FishjamBuf, FishjamOnEvent,
};
pub use client::{sdk_version, FishjamClient};
pub use proto::fishjam;
pub use proto::fishjam::sdk;
pub use signaling::{
    Scheduler, SignalingSocket, SocketConnector, SocketListener, TimerHandle, TokioScheduler,
    TungsteniteConnector,
};
pub use url::websocket_url;
