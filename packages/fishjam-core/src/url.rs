const WEBSOCKET_PATH: &str = "socket/peer/websocket";

/// Same rules as `resolveFishjamUrl`, `httpToWebsocketUrl`, and `getUrl` in the web clients.
pub fn websocket_url(fishjam_id: &str) -> Result<String, String> {
    let fishjam_id = fishjam_id.trim();
    if fishjam_id.is_empty() {
        return Err("fishjamId is required".to_owned());
    }

    let url = if fishjam_id.starts_with("http://") || fishjam_id.starts_with("https://") {
        fishjam_id.to_owned()
    } else {
        format!("https://fishjam.io/api/v1/connect/{fishjam_id}")
    };
    let url = url
        .replacen("https://", "wss://", 1)
        .replacen("http://", "ws://", 1);

    if url.ends_with('/') {
        Ok(format!("{url}{WEBSOCKET_PATH}"))
    } else {
        Ok(format!("{url}/{WEBSOCKET_PATH}"))
    }
}
