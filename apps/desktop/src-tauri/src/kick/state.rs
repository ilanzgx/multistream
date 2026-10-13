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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct KickPusherConfig {
    pub app_key: String,
    pub cluster: String,
}

impl KickPusherConfig {
    pub fn is_valid(&self) -> bool {
        !self.app_key.is_empty()
            && self.app_key.chars().all(|c| c.is_ascii_alphanumeric())
            && !self.cluster.is_empty()
            && self.cluster.chars().all(|c| c.is_ascii_alphanumeric())
    }
}

impl Default for KickPusherConfig {
    fn default() -> Self {
        Self {
            app_key: super::pusher::DEFAULT_PUSHER_APP_KEY.to_string(),
            cluster: super::pusher::DEFAULT_PUSHER_CLUSTER.to_string(),
        }
    }
}

#[derive(Debug, Default)]
pub struct PusherHealBackoff {
    pub failures: u32,
    pub next_retry_at: Option<tokio::time::Instant>,
}

impl PusherHealBackoff {
    pub fn can_attempt(&self, now: tokio::time::Instant) -> bool {
        self.next_retry_at.is_none_or(|next| now >= next)
    }

    pub fn record_success(&mut self) {
        self.failures = 0;
        self.next_retry_at = None;
    }

    pub fn record_failure(&mut self, now: tokio::time::Instant) -> std::time::Duration {
        self.failures = self.failures.saturating_add(1);
        let delay = heal_backoff_duration(self.failures);
        self.next_retry_at = Some(now + delay);
        delay
    }
}

pub fn heal_backoff_duration(failures: u32) -> std::time::Duration {
    match failures {
        0 => std::time::Duration::ZERO,
        1 => std::time::Duration::from_secs(5),
        2 => std::time::Duration::from_secs(15),
        3 => std::time::Duration::from_secs(30),
        _ => std::time::Duration::from_secs(60),
    }
}

type OAuthCallbackSender = tokio::sync::oneshot::Sender<Result<(String, String), String>>;

pub struct KickState {
    pub auth: Mutex<Option<KickAuthInfo>>,
    pub auth_refresh_lock: Mutex<()>,
    pub pusher_shutdown_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    pub pusher_config: Mutex<KickPusherConfig>,
    pub pusher_heal_lock: Mutex<()>,
    pub pusher_heal_backoff: Mutex<PusherHealBackoff>,
    pub oauth_callback_tx: Mutex<Option<OAuthCallbackSender>>,
}

impl KickState {
    pub fn new() -> Self {
        Self {
            auth: Mutex::new(None),
            auth_refresh_lock: Mutex::new(()),
            pusher_shutdown_tx: Mutex::new(None),
            pusher_config: Mutex::new(super::pusher::load_pusher_config()),
            pusher_heal_lock: Mutex::new(()),
            pusher_heal_backoff: Mutex::new(PusherHealBackoff::default()),
            oauth_callback_tx: Mutex::new(None),
        }
    }
}

impl Default for KickState {
    fn default() -> Self {
        Self::new()
    }
}
