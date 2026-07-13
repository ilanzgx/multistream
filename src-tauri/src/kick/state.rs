use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KickAuthInfo {
    pub access_token: String,
    pub refresh_token: String,
    pub username: String,
    #[serde(default)]
    pub has_chat_write: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KickAuthState {
    pub authenticated: bool,
    pub username: Option<String>,
}

pub struct KickState {
    pub auth: Mutex<Option<KickAuthInfo>>,
    pub pusher_shutdown_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    pub oauth_callback_tx:
        Mutex<Option<tokio::sync::oneshot::Sender<Result<(String, String), String>>>>,
}

impl KickState {
    pub fn new() -> Self {
        Self {
            auth: Mutex::new(None),
            pusher_shutdown_tx: Mutex::new(None),
            oauth_callback_tx: Mutex::new(None),
        }
    }
}

impl Default for KickState {
    fn default() -> Self {
        Self::new()
    }
}
