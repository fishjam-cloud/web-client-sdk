use std::sync::{Arc, LazyLock};

use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;

/// Receives socket callbacks. Implementations must tolerate calls from any thread.
pub trait SocketListener: Send + Sync {
    fn on_open(&self);
    fn on_message(&self, data: Vec<u8>);
    fn on_close(&self, reason: String);
}

pub trait SignalingSocket: Send {
    fn send(&self, data: Vec<u8>);
    fn close(&self);
}

/// Opens signaling sockets. `connect` must not call `listener` before it returns.
pub trait SocketConnector: Send + Sync {
    fn connect(&self, url: &str, listener: Arc<dyn SocketListener>) -> Box<dyn SignalingSocket>;
}

/// Shared by all clients, so a runtime is never dropped on one of its own threads.
static RUNTIME: LazyLock<tokio::runtime::Runtime> = LazyLock::new(|| {
    // Fails only when the app already installed a provider, which is fine to keep.
    let _ = rustls::crypto::ring::default_provider().install_default();
    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(1)
        .thread_name("fishjam-core-socket")
        .enable_all()
        .build()
        .expect("tokio runtime")
});

pub struct TungsteniteConnector;

enum Command {
    Send(Vec<u8>),
    Close,
}

struct TungsteniteSocket {
    commands: mpsc::UnboundedSender<Command>,
}

impl SignalingSocket for TungsteniteSocket {
    fn send(&self, data: Vec<u8>) {
        let _ = self.commands.send(Command::Send(data));
    }

    fn close(&self) {
        let _ = self.commands.send(Command::Close);
    }
}

impl SocketConnector for TungsteniteConnector {
    fn connect(&self, url: &str, listener: Arc<dyn SocketListener>) -> Box<dyn SignalingSocket> {
        let (commands, receiver) = mpsc::unbounded_channel();
        RUNTIME.spawn(run_socket(url.to_owned(), listener, receiver));
        Box::new(TungsteniteSocket { commands })
    }
}

async fn run_socket(
    url: String,
    listener: Arc<dyn SocketListener>,
    mut commands: mpsc::UnboundedReceiver<Command>,
) {
    let stream = match tokio_tungstenite::connect_async(url.as_str()).await {
        Ok((stream, _)) => stream,
        Err(error) => {
            log::warn!("Socket connection failed: {error}");
            listener.on_close(error.to_string());
            return;
        }
    };
    listener.on_open();

    let (mut write, mut read) = stream.split();
    loop {
        tokio::select! {
            command = commands.recv() => match command {
                Some(Command::Send(data)) => {
                    if let Err(error) = write.send(Message::Binary(data.into())).await {
                        listener.on_close(error.to_string());
                        return;
                    }
                }
                Some(Command::Close) | None => {
                    let _ = write.send(Message::Close(None)).await;
                    let _ = write.close().await;
                    return;
                }
            },
            message = read.next() => match message {
                Some(Ok(Message::Binary(data))) => listener.on_message(data.to_vec()),
                Some(Ok(Message::Close(frame))) => {
                    listener.on_close(frame.map(|frame| frame.reason.to_string()).unwrap_or_default());
                    return;
                }
                Some(Ok(_)) => {}
                Some(Err(error)) => {
                    listener.on_close(error.to_string());
                    return;
                }
                None => {
                    listener.on_close(String::new());
                    return;
                }
            },
        }
    }
}
