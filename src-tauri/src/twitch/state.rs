use std::collections::HashSet;
use std::collections::VecDeque;
use tokio::sync::Mutex;

use serde::{Deserialize, Serialize};

pub const MAX_MESSAGES: usize = 1_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedChatMessage {
    pub id: String,
    pub channel: String,
    pub username: String,
    pub display_name: String,
    pub message: String,
    pub timestamp_ms: u64,
    pub color: Option<String>,
    pub badges: Vec<String>,
    pub emotes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionState {
    Connected,
    Reconnecting,
    Disconnected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionStateEvent {
    pub state: ConnectionState,
}

#[derive(Debug, Default)]
pub struct SubscriptionSet {
    pub grid_channels: HashSet<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TwitchAuthInfo {
    pub access_token: String,
    pub refresh_token: String,
    pub username: String,
    pub user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthState {
    pub authenticated: bool,
    pub username: Option<String>,
}

pub struct TwitchState {
    pub auth: Mutex<Option<TwitchAuthInfo>>,
    pub messages: Mutex<VecDeque<UnifiedChatMessage>>,
    pub subscriptions: Mutex<SubscriptionSet>,
    pub connection_state: Mutex<ConnectionState>,
    pub irc_shutdown_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    pub auth_abort_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}

impl TwitchState {
    pub fn new() -> Self {
        Self {
            auth: Mutex::new(None),
            messages: Mutex::new(VecDeque::new()),
            subscriptions: Mutex::new(SubscriptionSet::default()),
            connection_state: Mutex::new(ConnectionState::Disconnected),
            irc_shutdown_tx: Mutex::new(None),
            auth_abort_tx: Mutex::new(None),
        }
    }
}
