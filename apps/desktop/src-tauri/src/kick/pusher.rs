use std::collections::HashSet;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::oneshot;
use tokio_tungstenite::{connect_async, tungstenite::Message};

use super::error::KickError;
use super::state::KickState;

const PUSHER_URL: &str = "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0-rc2&flash=false";
const JOIN_DELAY_MS: u64 = 150;

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
struct PusherEvent {
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

        tokio::select! {
            res = connect_pusher(&app, &channels) => {
                if let Err(e) = res {
                    log::warn!("[kick-pusher] connection error: {}", e);
                }
            }
            _ = &mut shutdown_rx => {
                log::info!("[kick-pusher] shutdown requested, exiting loop");
                break;
            }
        }

        let delay = backoff_delay(attempt);
        attempt += 1;
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

async fn connect_pusher(
    app: &AppHandle,
    channels: &HashSet<(String, u64)>,
) -> Result<(), KickError> {
    let connect_future = connect_async(PUSHER_URL);
    let (ws_stream, _) = match tokio::time::timeout(Duration::from_secs(10), connect_future).await {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => return Err(KickError::WebSocket(e.to_string())),
        Err(_) => return Err(KickError::WebSocket("Connection timeout".to_string())),
    };

    let (mut write, mut read) = ws_stream.split();

    tokio::time::timeout(Duration::from_secs(10), async {
        while let Some(msg) = read.next().await {
            let msg = msg.map_err(|e| KickError::WebSocket(e.to_string()))?;
            if let Message::Text(text) = msg {
                if text.contains("pusher:connection_established") {
                    return Ok(());
                }
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

async fn handle_pusher_message(
    app: &AppHandle,
    channels: &HashSet<(String, u64)>,
    text: &str,
) -> Result<(), KickError> {
    if let Ok(pusher_event) = serde_json::from_str::<PusherEvent>(text) {
        if pusher_event.event == "App\\Events\\ChatMessageEvent" {
            if let (Some(channel_str), Some(data)) = (pusher_event.channel, pusher_event.data) {
                // Parse inner data which is a stringified JSON
                if let Some(data_str) = data.as_str() {
                    if let Ok(payload) = serde_json::from_str::<Value>(data_str) {
                        let chatroom_id = channel_str
                            .replace("chatrooms.", "")
                            .replace(".v2", "")
                            .parse::<u64>()
                            .unwrap_or(0);

                        // Find the slug
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

                        // Add chrono for datetime if possible, or just use SystemTime
                        let timestamp_ms = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64;

                        let msg = KickChatMessage {
                            id,
                            channel: slug,
                            username,
                            display_name,
                            message: content,
                            timestamp_ms,
                            color,
                            badges,
                            emotes: None,
                        };

                        let _ = app.emit("kick-chat-message", msg);
                    }
                }
            }
        }
    }
    Ok(())
}
