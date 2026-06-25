use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KickAuthInfo {
    pub access_token: String,
    pub refresh_token: String,
    pub username: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KickAuthState {
    pub authenticated: bool,
    pub username: Option<String>,
}

pub struct KickState {
    pub auth: Mutex<Option<KickAuthInfo>>,
}

impl KickState {
    pub fn new() -> Self {
        Self {
            auth: Mutex::new(None),
        }
    }
}

impl Default for KickState {
    fn default() -> Self {
        Self::new()
    }
}
