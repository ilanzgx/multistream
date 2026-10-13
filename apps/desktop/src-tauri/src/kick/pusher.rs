use std::collections::HashSet;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::oneshot;
use tokio_tungstenite::{connect_async, tungstenite::Message};

use super::error::KickError;
use super::state::{KickPusherConfig, KickState};

pub const DEFAULT_PUSHER_APP_KEY: &str = "32cbd69e4b950bf97679";
pub const DEFAULT_PUSHER_CLUSTER: &str = "us2";
const PUSHER_CONFIG_KEY: &str = "kick_pusher_config";
const JOIN_DELAY_MS: u64 = 150;

pub fn build_pusher_url(config: &KickPusherConfig) -> String {
    format!(
        "wss://ws-{}.pusher.com/app/{}?protocol=7&client=js&version=8.4.0-rc2&flash=false",
        config.cluster, config.app_key
    )
}

fn pusher_config_file_path() -> std::path::PathBuf {
    let mut path = dirs::config_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    path.push("multistream");
    let _ = std::fs::create_dir_all(&path);
    #[cfg(debug_assertions)]
    path.push(format!("{}_dev", PUSHER_CONFIG_KEY));
    #[cfg(not(debug_assertions))]
    path.push(PUSHER_CONFIG_KEY);
    path.with_extension("json")
}

pub fn load_pusher_config() -> KickPusherConfig {
    let path = pusher_config_file_path();
    if let Ok(bytes) = std::fs::read(&path) {
        if let Ok(config) = serde_json::from_slice::<KickPusherConfig>(&bytes) {
            if config.is_valid() {
                return config;
            }
        }
    }
    KickPusherConfig::default()
}

pub fn store_pusher_config(config: &KickPusherConfig) -> Result<(), KickError> {
    let json = serde_json::to_string(config).map_err(|e| KickError::Storage(e.to_string()))?;
    std::fs::write(pusher_config_file_path(), json.as_bytes())
        .map_err(|e| KickError::Storage(e.to_string()))
}

pub fn clear_pusher_config() {
    let _ = std::fs::remove_file(pusher_config_file_path());
}

#[derive(Debug, Serialize, Clone)]
pub struct KickConnectionStateEvent {
    pub state: &'static str,
}

#[derive(Debug, Serialize, Clone)]
pub struct KickChatMessage {
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

#[derive(Deserialize)]
pub(crate) struct PusherEvent {
    event: String,
    data: Option<Value>,
    channel: Option<String>,
}

async fn emit_connection_state(app: &AppHandle, state: &'static str) {
    let _ = app.emit("kick-connection-state", KickConnectionStateEvent { state });
}

pub async fn update_kick_subscriptions(
    app: &AppHandle,
    new_channels: HashSet<(String, u64)>, // (slug, chatroom_id)
) {
    let Some(state) = app.try_state::<KickState>() else {
        return;
    };

    let rx = {
        let mut shutdown_guard = state.pusher_shutdown_tx.lock().await;
        if let Some(tx) = shutdown_guard.take() {
            let _ = tx.send(());
        }

        if new_channels.is_empty() {
            None
        } else {
            let (tx, rx) = oneshot::channel();
            *shutdown_guard = Some(tx);
            Some(rx)
        }
    };

    let Some(rx) = rx else {
        emit_connection_state(app, "disconnected").await;
        return;
    };

    let app_clone = app.clone();
    tokio::spawn(async move {
        run_pusher_loop(app_clone, new_channels, rx).await;
    });
}

async fn heal_pusher_config(app: &AppHandle, failed_config: &KickPusherConfig) -> bool {
    let Some(state) = app.try_state::<KickState>() else {
        return false;
    };

    let _heal_guard = state.pusher_heal_lock.lock().await;

    {
        let current_in_memory = state.pusher_config.lock().await;
        if &*current_in_memory != failed_config {
            log::info!(
                "[kick-pusher] Pusher config already updated by another task (key={} cluster={}), reusing",
                current_in_memory.app_key,
                current_in_memory.cluster
            );
            return true;
        }
    }

    let now = tokio::time::Instant::now();
    {
        let backoff = state.pusher_heal_backoff.lock().await;
        if !backoff.can_attempt(now) {
            log::debug!("[kick-pusher] upstream heal cooldown active, skipping HTTP discovery");
            return false;
        }
    }

    let http = match reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .use_rustls_tls()
        .timeout(Duration::from_secs(10))
        .build()
    {
        Ok(client) => client,
        Err(e) => {
            log::warn!("[kick-pusher] failed to build HTTP client for key discovery: {}", e);
            return false;
        }
    };

    let (new_config, is_live_discovery) = match super::api::fetch_realtime_pusher_config(&http)
        .await
    {
        Ok(new_config) => (Some(new_config), true),
        Err(e) => {
            let cooldown = state
                .pusher_heal_backoff
                .lock()
                .await
                .record_failure(tokio::time::Instant::now());
            log::warn!(
                "[kick-pusher] failed to fetch realtime pusher config ({}), next heal attempt in {:?}",
                e,
                cooldown
            );
            let default_config = KickPusherConfig::default();
            if failed_config != &default_config {
                clear_pusher_config();
                (Some(default_config), false)
            } else {
                (None, false)
            }
        }
    };

    let Some(new_config) = new_config else {
        return false;
    };

    if &new_config == failed_config {
        let cooldown = state
            .pusher_heal_backoff
            .lock()
            .await
            .record_failure(tokio::time::Instant::now());
        log::warn!(
            "[kick-pusher] upstream returned identical failing Pusher key ({}), next heal attempt in {:?}",
            new_config.app_key,
            cooldown
        );
        return false;
    }

    if is_live_discovery {
        state.pusher_heal_backoff.lock().await.record_success();
    }

    log::info!(
        "[kick-pusher] self-healed Pusher config: key={} cluster={}",
        new_config.app_key,
        new_config.cluster
    );

    *state.pusher_config.lock().await = new_config.clone();

    if new_config != KickPusherConfig::default() {
        if let Err(e) = store_pusher_config(&new_config) {
            log::warn!("[kick-pusher] failed to persist new Pusher config: {}", e);
        }
    } else {
        clear_pusher_config();
    }

    true
}

pub async fn run_pusher_loop(
    app: AppHandle,
    channels: HashSet<(String, u64)>,
    mut shutdown_rx: oneshot::Receiver<()>,
) {
    let mut attempt: u32 = 0;

    loop {
        emit_connection_state(
            &app,
            if attempt == 0 {
                "disconnected"
            } else {
                "reconnecting"
            },
        )
        .await;

        let current_config = if let Some(state) = app.try_state::<KickState>() {
            state.pusher_config.lock().await.clone()
        } else {
            KickPusherConfig::default()
        };

        let start_time = tokio::time::Instant::now();
        let mut healed = false;

        tokio::select! {
            res = connect_pusher(&app, &channels, &current_config) => {
                if let Err(e) = res {
                    log::warn!("[kick-pusher] connection error: {}", e);
                    if matches!(e, KickError::InvalidPusherKey(_)) {
                        tokio::select! {
                            h = heal_pusher_config(&app, &current_config) => {
                                healed = h;
                            }
                            _ = &mut shutdown_rx => {
                                log::info!("[kick-pusher] shutdown requested during healing, exiting loop");
                                break;
                            }
                        }
                    }
                }
            }
            _ = &mut shutdown_rx => {
                log::info!("[kick-pusher] shutdown requested, exiting loop");
                break;
            }
        }

        if healed {
            attempt = 0;
        } else if start_time.elapsed() > Duration::from_secs(60) {
            attempt = 1;
        } else {
            attempt = attempt.saturating_add(1);
        }

        let delay = backoff_delay(attempt);
        log::info!(
            "[kick-pusher] reconnecting in {:?} (attempt {})",
            delay,
            attempt
        );

        tokio::select! {
            _ = tokio::time::sleep(delay) => {}
            _ = &mut shutdown_rx => {
                break;
            }
        }
    }
}

fn backoff_delay(attempt: u32) -> Duration {
    if attempt == 0 {
        return Duration::ZERO;
    }
    let base = Duration::from_secs(1u64 << attempt.min(6));
    let cap = Duration::from_secs(60);
    let delay = base.min(cap);

    let jitter_ms = rand::random::<u64>() % 400;
    delay + Duration::from_millis(jitter_ms)
}

pub(crate) fn check_handshake_message(msg: &Message) -> Result<bool, KickError> {
    match msg {
        Message::Text(text) => {
            if text.contains("pusher:connection_established") {
                return Ok(true);
            }
            if text.contains("pusher:error")
                && (text.contains("4001")
                    || text.contains("4003")
                    || text.contains("not in this cluster")
                    || text.contains("Application does not exist"))
            {
                return Err(KickError::InvalidPusherKey(text.to_string()));
            }
            Ok(false)
        }
        Message::Close(Some(frame)) => {
            let code: u16 = frame.code.into();
            if code == 4001 || code == 4003 {
                return Err(KickError::InvalidPusherKey(format!(
                    "Close {}: {}",
                    code, frame.reason
                )));
            }
            Err(KickError::WebSocket(format!(
                "Server closed connection during handshake ({}): {}",
                code, frame.reason
            )))
        }
        Message::Close(None) => Err(KickError::WebSocket(
            "Server closed connection during handshake".to_string(),
        )),
        _ => Ok(false),
    }
}

async fn connect_pusher(
    app: &AppHandle,
    channels: &HashSet<(String, u64)>,
    config: &KickPusherConfig,
) -> Result<(), KickError> {
    let url = build_pusher_url(config);
    let connect_future = connect_async(&url);
    let (ws_stream, _) = match tokio::time::timeout(Duration::from_secs(10), connect_future).await {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => return Err(KickError::WebSocket(e.to_string())),
        Err(_) => return Err(KickError::WebSocket("Connection timeout".to_string())),
    };

    let (mut write, mut read) = ws_stream.split();

    tokio::time::timeout(Duration::from_secs(10), async {
        while let Some(msg) = read.next().await {
            let msg = msg.map_err(|e| KickError::WebSocket(e.to_string()))?;
            if check_handshake_message(&msg)? {
                return Ok(());
            }
        }

        Err(KickError::WebSocket(
            "Failed to receive connection_established".to_string(),
        ))
    })
    .await
    .map_err(|_| KickError::WebSocket("Connection establishment timeout".to_string()))??;

    emit_connection_state(app, "connected").await;
    log::info!(
        "[kick-pusher] connected, joining {} channels",
        channels.len()
    );

    for (_, chatroom_id) in channels {
        let subscribe_payload = serde_json::json!({
            "event": "pusher:subscribe",
            "data": {
                "auth": "",
                "channel": format!("chatrooms.{}.v2", chatroom_id)
            }
        });

        write
            .send(Message::Text(subscribe_payload.to_string()))
            .await
            .map_err(|e| KickError::WebSocket(e.to_string()))?;

        tokio::time::sleep(Duration::from_millis(JOIN_DELAY_MS)).await;
    }

    let mut ping_interval = tokio::time::interval(Duration::from_secs(120));

    loop {
        tokio::select! {
            _ = ping_interval.tick() => {
                let ping_payload = serde_json::json!({
                    "event": "pusher:ping",
                    "data": {}
                });
                if let Err(e) = write.send(Message::Text(ping_payload.to_string())).await {
                    log::warn!("[kick-pusher] failed to send ping: {}", e);
                }
            }
            msg = read.next() => {
                let msg = match msg {
                    Some(Ok(m)) => m,
                    Some(Err(e)) => return Err(KickError::WebSocket(e.to_string())),
                    None => return Err(KickError::WebSocket("stream closed".to_owned())),
                };

                match msg {
                    Message::Text(text) => handle_pusher_message(app, channels, &text).await?,
                    Message::Ping(payload) => {
                        write.send(Message::Pong(payload)).await
                            .map_err(|e| KickError::WebSocket(e.to_string()))?;
                    }
                    Message::Close(_) => {
                        return Err(KickError::WebSocket("server closed connection".to_owned()));
                    }
                    _ => {}
                }
            }
        }
    }
}

pub fn parse_chat_message(
    pusher_event: &PusherEvent,
    channels: &HashSet<(String, u64)>,
) -> Option<KickChatMessage> {
    if pusher_event.event != "App\\Events\\ChatMessageEvent" {
        return None;
    }

    let channel_str = pusher_event.channel.as_ref()?;
    let data = pusher_event.data.as_ref()?;
    let data_str = data.as_str()?;
    let payload = serde_json::from_str::<Value>(data_str).ok()?;

    let chatroom_id = channel_str
        .strip_prefix("chatrooms.")
        .and_then(|s| s.strip_suffix(".v2"))
        .unwrap_or(channel_str)
        .parse::<u64>()
        .unwrap_or(0);

    let slug = channels
        .iter()
        .find(|(_, id)| *id == chatroom_id)
        .map(|(s, _)| s.clone())
        .unwrap_or_else(|| chatroom_id.to_string());

    let id = payload["id"].as_str().unwrap_or("").to_string();
    let content = payload["content"].as_str().unwrap_or("").to_string();
    let sender = &payload["sender"];
    let username = sender["username"].as_str().unwrap_or("").to_string();
    let display_name = sender["username"].as_str().unwrap_or("").to_string();
    let color = sender["identity"]["color"].as_str().map(|s| s.to_string());

    let mut badges = Vec::new();
    if let Some(badges_array) = sender["identity"]["badges"].as_array() {
        for badge in badges_array {
            if let Some(badge_type) = badge["type"].as_str() {
                badges.push(badge_type.to_string());
            }
        }
    }

    let timestamp_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    Some(KickChatMessage {
        id,
        channel: slug,
        username,
        display_name,
        message: content,
        timestamp_ms,
        color,
        badges,
        emotes: None,
    })
}

async fn handle_pusher_message(
    app: &AppHandle,
    channels: &HashSet<(String, u64)>,
    text: &str,
) -> Result<(), KickError> {
    if let Ok(pusher_event) = serde_json::from_str::<PusherEvent>(text) {
        if let Some(msg) = parse_chat_message(&pusher_event, channels) {
            let _ = app.emit("kick-chat-message", msg);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_parse_valid_chat_message() {
        let raw_json = "{
            \"event\": \"App\\\\Events\\\\ChatMessageEvent\",
            \"data\": \"{\\\"id\\\":\\\"msg123\\\",\\\"content\\\":\\\"Hello world\\\",\\\"sender\\\":{\\\"username\\\":\\\"testuser\\\",\\\"identity\\\":{\\\"color\\\":\\\"#FF0000\\\",\\\"badges\\\":[{\\\"type\\\":\\\"broadcaster\\\"}]}}}\",
            \"channel\": \"chatrooms.999.v2\"
        }";

        let pusher_event: PusherEvent = serde_json::from_str(raw_json).unwrap();

        let mut channels = HashSet::new();
        channels.insert(("test_slug".to_string(), 999));

        let parsed = parse_chat_message(&pusher_event, &channels).unwrap();

        assert_eq!(parsed.id, "msg123");
        assert_eq!(parsed.channel, "test_slug");
        assert_eq!(parsed.username, "testuser");
        assert_eq!(parsed.display_name, "testuser");
        assert_eq!(parsed.message, "Hello world");
        assert_eq!(parsed.color, Some("#FF0000".to_string()));
        assert_eq!(parsed.badges, vec!["broadcaster"]);
    }

    #[test]
    fn should_return_none_for_non_chat_event() {
        let raw_json = "{
            \"event\": \"pusher_internal:subscription_succeeded\",
            \"data\": \"{}\",
            \"channel\": \"chatrooms.999.v2\"
        }";

        let pusher_event: PusherEvent = serde_json::from_str(raw_json).unwrap();
        let channels = HashSet::new();

        let parsed = parse_chat_message(&pusher_event, &channels);
        assert!(parsed.is_none());
    }

    #[test]
    fn should_handle_missing_slug_gracefully() {
        let raw_json = "{
            \"event\": \"App\\\\Events\\\\ChatMessageEvent\",
            \"data\": \"{\\\"id\\\":\\\"msg123\\\",\\\"content\\\":\\\"Hello world\\\",\\\"sender\\\":{\\\"username\\\":\\\"testuser\\\",\\\"identity\\\":{\\\"color\\\":\\\"#FF0000\\\",\\\"badges\\\":[]}}}\",
            \"channel\": \"chatrooms.999.v2\"
        }";

        let pusher_event: PusherEvent = serde_json::from_str(raw_json).unwrap();
        let channels = HashSet::new();

        let parsed = parse_chat_message(&pusher_event, &channels).unwrap();

        assert_eq!(parsed.channel, "999");
    }

    #[test]
    fn backoff_delay_never_exceeds_cap() {
        for attempt in 0..100 {
            let delay = backoff_delay(attempt);
            // Cap is 60s + max 399ms jitter
            assert!(delay <= Duration::from_millis(60399));
            if attempt == 0 {
                assert_eq!(delay, Duration::ZERO);
            } else {
                assert!(delay >= Duration::from_secs(2));
            }
        }
    }

    #[test]
    fn should_build_valid_pusher_url_from_config() {
        // Arrange
        let config = KickPusherConfig {
            app_key: "34bf7a0ff419a2a775b9".to_string(),
            cluster: "us2".to_string(),
        };

        // Act
        let url = build_pusher_url(&config);

        // Assert
        assert_eq!(
            url,
            "wss://ws-us2.pusher.com/app/34bf7a0ff419a2a775b9?protocol=7&client=js&version=8.4.0-rc2&flash=false"
        );
    }

    #[test]
    fn should_detect_pusher_4001_error_in_handshake() {
        // Arrange
        let error_msg = Message::Text(
            r#"{"event":"pusher:error","data":{"code":4001,"message":"App key 32cbd69e4b950bf97679 not in this cluster. Did you forget to specify the cluster?"}}"#.into()
        );
        let established_msg = Message::Text(
            r#"{"event":"pusher:connection_established","data":"{\"socket_id\":\"123.456\"}"}"#
                .into(),
        );
        let other_msg = Message::Text(r#"{"event":"pusher:pong","data":"{}"}"#.into());

        // Act
        let res_error = check_handshake_message(&error_msg);
        let res_established = check_handshake_message(&established_msg);
        let res_other = check_handshake_message(&other_msg);

        // Assert
        assert!(matches!(res_error, Err(KickError::InvalidPusherKey(_))));
        assert!(matches!(res_established, Ok(true)));
        assert!(matches!(res_other, Ok(false)));
    }

    #[test]
    fn should_validate_pusher_config_fields() {
        // Arrange
        let valid = KickPusherConfig::default();
        let empty_key = KickPusherConfig {
            app_key: "".to_string(),
            cluster: "us2".to_string(),
        };
        let invalid_chars = KickPusherConfig {
            app_key: "abc-123".to_string(),
            cluster: "us2".to_string(),
        };

        // Act & Assert
        assert!(valid.is_valid());
        assert!(!empty_key.is_valid());
        assert!(!invalid_chars.is_valid());
    }

    #[test]
    fn should_enforce_exponential_heal_backoff_and_reset_on_success() {
        // Arrange
        use super::super::state::{heal_backoff_duration, PusherHealBackoff};
        let mut backoff = PusherHealBackoff::default();
        let t0 = tokio::time::Instant::now();

        // Act & Assert — initial state allows attempt immediately
        assert!(backoff.can_attempt(t0));
        assert_eq!(heal_backoff_duration(0), Duration::ZERO);

        // Act — 1st failure (5s cooldown)
        let d1 = backoff.record_failure(t0);
        // Assert
        assert_eq!(d1, Duration::from_secs(5));
        assert!(!backoff.can_attempt(t0 + Duration::from_secs(4)));
        assert!(backoff.can_attempt(t0 + Duration::from_secs(5)));

        // Act — 2nd failure (15s cooldown)
        let t1 = t0 + Duration::from_secs(5);
        let d2 = backoff.record_failure(t1);
        // Assert
        assert_eq!(d2, Duration::from_secs(15));
        assert!(!backoff.can_attempt(t1 + Duration::from_secs(14)));
        assert!(backoff.can_attempt(t1 + Duration::from_secs(15)));

        // Act — 3rd and 4th+ failures (30s -> capped at 60s)
        let t2 = t1 + Duration::from_secs(15);
        assert_eq!(backoff.record_failure(t2), Duration::from_secs(30));
        assert_eq!(backoff.record_failure(t2), Duration::from_secs(60));
        assert_eq!(backoff.record_failure(t2), Duration::from_secs(60));

        // Act — success resets backoff state immediately
        backoff.record_success();
        // Assert
        assert_eq!(backoff.failures, 0);
        assert!(backoff.can_attempt(t2));
    }

    #[test]
    fn should_store_load_and_clear_pusher_config() {
        // Arrange
        let custom_config = KickPusherConfig {
            app_key: "abcdef1234567890test".to_string(),
            cluster: "eu".to_string(),
        };

        // Act & Assert 1: Store custom config
        let res = store_pusher_config(&custom_config);
        assert!(res.is_ok());

        // Act & Assert 2: Load should return custom config
        let loaded = load_pusher_config();
        assert_eq!(loaded, custom_config);

        // Act & Assert 3: Clear should remove file and fallback to default
        clear_pusher_config();
        let fallback = load_pusher_config();
        assert_eq!(fallback, KickPusherConfig::default());
    }
}
