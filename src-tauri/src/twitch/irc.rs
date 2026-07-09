use std::collections::{HashMap, HashSet};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::oneshot;
use tokio_tungstenite::{connect_async, tungstenite::Message};

use super::error::TwitchError;
use super::state::{
    ConnectionState, OutboundIrcMessage, TwitchState, UnifiedChatMessage, MAX_MESSAGES,
};

const IRC_URL: &str = "wss://irc-ws.chat.twitch.tv:443";
const JOIN_DELAY_MS: u64 = 350;

#[derive(Debug, Serialize, Clone)]
pub struct ConnectionStateEvent {
    pub state: ConnectionState,
}

fn parse_tags(raw: &str) -> HashMap<String, String> {
    raw.split(';')
        .filter_map(|pair| {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next()?.to_owned();
            let value = parts.next().unwrap_or("").to_owned();
            Some((key, value))
        })
        .collect()
}

pub fn parse_privmsg(line: &str) -> Option<UnifiedChatMessage> {
    let rest = line.strip_prefix('@')?;
    let (raw_tags, rest) = rest.split_once(' ')?;

    let tags = parse_tags(raw_tags);

    let rest = rest.strip_prefix(':')?;
    let (prefix, rest) = rest.split_once(' ')?;

    if !rest.starts_with("PRIVMSG") {
        return None;
    }

    let username = prefix.split('!').next()?.to_owned();
    let rest = rest.strip_prefix("PRIVMSG ")?;
    let (channel_raw, message) = rest.split_once(" :")?;
    let channel = channel_raw.trim_start_matches('#').to_owned();

    let display_name = tags
        .get("display-name")
        .filter(|s| !s.is_empty())
        .cloned()
        .unwrap_or_else(|| username.clone());

    let id = tags
        .get("id")
        .cloned()
        .unwrap_or_else(|| format!("{}-{}", channel, username));

    let color = tags.get("color").filter(|s| !s.is_empty()).cloned();
    let emotes = tags.get("emotes").filter(|s| !s.is_empty()).cloned();

    let badges: Vec<String> = tags
        .get("badges")
        .filter(|s| !s.is_empty())
        .map(|s| s.split(',').map(str::to_owned).collect())
        .unwrap_or_default();

    let timestamp_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    Some(UnifiedChatMessage {
        id,
        channel,
        username,
        display_name,
        message: message.trim_end_matches(['\r', '\n']).to_owned(),
        timestamp_ms,
        color,
        badges,
        emotes,
    })
}

async fn emit_connection_state(app: &AppHandle, state: ConnectionState) {
    if let Ok(twitch_state) = app.try_state::<TwitchState>().ok_or(()) {
        *twitch_state.connection_state.lock().await = state.clone();
    }
    let _ = app.emit("twitch-connection-state", ConnectionStateEvent { state });
}

pub async fn run_irc_loop(
    app: AppHandle,
    access_token: String,
    username: String,
    channels: HashSet<String>,
    mut shutdown_rx: oneshot::Receiver<()>,
    mut outbound_rx: tokio::sync::mpsc::Receiver<OutboundIrcMessage>,
) {
    let mut attempt: u32 = 0;

    loop {
        emit_connection_state(
            &app,
            if attempt == 0 {
                ConnectionState::Disconnected
            } else {
                ConnectionState::Reconnecting
            },
        )
        .await;

        match connect_irc(
            &app,
            &access_token,
            &username,
            &channels,
            &mut shutdown_rx,
            &mut outbound_rx,
        )
        .await
        {
            Ok(()) => {
                log::info!("[twitch-irc] shutdown requested, exiting loop");
                emit_connection_state(&app, ConnectionState::Disconnected).await;
                break;
            }
            Err(TwitchError::OAuth(_)) => {
                log::warn!("[twitch-irc] auth failure, stopping loop");
                emit_connection_state(&app, ConnectionState::Disconnected).await;
                let _ = app.emit("twitch-auth-expired", ());
                break;
            }
            Err(e) => {
                log::warn!("[twitch-irc] connection error: {e}");
            }
        }

        let delay = backoff_delay(attempt);
        attempt += 1;
        log::info!("[twitch-irc] reconnecting in {delay:?} (attempt {attempt})");

        tokio::select! {
            _ = tokio::time::sleep(delay) => {}
            _ = &mut shutdown_rx => {
                emit_connection_state(&app, ConnectionState::Disconnected).await;
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

async fn connect_irc(
    app: &AppHandle,
    access_token: &str,
    username: &str,
    channels: &HashSet<String>,
    shutdown_rx: &mut oneshot::Receiver<()>,
    outbound_rx: &mut tokio::sync::mpsc::Receiver<OutboundIrcMessage>,
) -> Result<(), TwitchError> {
    let connect_future = connect_async(IRC_URL);
    let (ws_stream, _) = match tokio::time::timeout(Duration::from_secs(10), connect_future).await {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => return Err(TwitchError::WebSocket(e.to_string())),
        Err(_) => return Err(TwitchError::WebSocket("Connection timeout".to_string())),
    };

    let (mut write, mut read) = ws_stream.split();

    for line in [
        format!("PASS oauth:{access_token}"),
        format!("NICK {username}"),
        "CAP REQ :twitch.tv/tags twitch.tv/commands".to_owned(),
    ] {
        write
            .send(Message::Text(line))
            .await
            .map_err(|e| TwitchError::WebSocket(e.to_string()))?;
    }

    for (i, channel) in channels.iter().enumerate() {
        if i > 0 && i % 20 == 0 {
            tokio::time::sleep(Duration::from_millis(10_000)).await;
        }
        write
            .send(Message::Text(format!("JOIN #{channel}")))
            .await
            .map_err(|e| TwitchError::WebSocket(e.to_string()))?;
        tokio::time::sleep(Duration::from_millis(JOIN_DELAY_MS)).await;
    }

    emit_connection_state(app, ConnectionState::Connected).await;
    log::info!("[twitch-irc] connected, joined {} channels", channels.len());

    loop {
        tokio::select! {
            msg = read.next() => {
                let msg = match msg {
                    Some(Ok(m)) => m,
                    Some(Err(e)) => return Err(TwitchError::WebSocket(e.to_string())),
                    None => return Err(TwitchError::WebSocket("stream closed".to_owned())),
                };

                match msg {
                    Message::Text(text) => {
                        for line in text.lines() {
                            if line.starts_with("PING ") {
                                log::debug!("[twitch-irc] PING received, sending PONG");
                                let pong = line.replace("PING", "PONG");
                                write.send(Message::Text(pong)).await
                                    .map_err(|e| TwitchError::WebSocket(e.to_string()))?;
                            }
                        }
                        handle_irc_message(app, &text).await?;
                    }
                    Message::Ping(payload) => {
                        write.send(Message::Pong(payload)).await
                            .map_err(|e| TwitchError::WebSocket(e.to_string()))?;
                    }
                    Message::Close(_) => {
                        return Err(TwitchError::WebSocket("server closed connection".to_owned()));
                    }
                    _ => {}
                }
            }
            msg = outbound_rx.recv() => {
                if let Some(out_msg) = msg {
                    let line = format!("PRIVMSG #{} :{}", out_msg.channel, out_msg.text);
                    if let Err(e) = write.send(Message::Text(line)).await {
                        log::warn!("[twitch-irc] failed to send message: {e}");
                    }
                }
            }
            _ = &mut *shutdown_rx => {
                let _ = write.send(Message::Close(None)).await;
                return Ok(());
            }
        }
    }
}

async fn handle_irc_message(app: &AppHandle, text: &str) -> Result<(), TwitchError> {
    for line in text.lines() {
        if line.starts_with("PING") {
            log::debug!("[twitch-irc] PING received");
            continue;
        }

        if !line.contains("PRIVMSG") {
            // log::info!("[twitch-irc-recv] {}", line);
        }

        if line.contains("NOTICE") {
            if line.contains("Login authentication failed") {
                return Err(TwitchError::OAuth("IRC auth failed".to_owned()));
            }

            // Twitch sends NOTICE for room state changes (e.g. slow mode on)
            // AND for message failures. Message failures always have a msg-id starting with msg_
            // e.g. @msg-id=msg_banned :tmi.twitch.tv NOTICE #xqc :You are banned.
            let is_msg_error = line.contains("msg-id=msg_") || !line.starts_with('@');

            if is_msg_error {
                if let (Some(hash_idx), Some(colon_idx)) = (line.find(" #"), line.rfind(" :")) {
                    if hash_idx < colon_idx {
                        let channel = &line[hash_idx + 2..colon_idx]
                            .split_whitespace()
                            .next()
                            .unwrap_or("");
                        let text = &line[colon_idx + 2..];

                        #[derive(serde::Serialize, Clone)]
                        struct TwitchChatErrorEvent {
                            channel: String,
                            message: String,
                        }

                        let _ = app.emit(
                            "twitch-chat-error",
                            TwitchChatErrorEvent {
                                channel: channel.to_string(),
                                message: text.to_string(),
                            },
                        );
                    }
                }
            }
        }

        if line.contains("PRIVMSG") {
            if let Some(msg) = parse_privmsg(line) {
                push_message(app, msg.clone()).await;
                let _ = app.emit("unified-chat-message", msg);
            }
        }
    }
    Ok(())
}

async fn push_message(app: &AppHandle, msg: UnifiedChatMessage) {
    if let Some(state) = app.try_state::<TwitchState>() {
        let mut buf = state.messages.lock().await;
        if buf.len() >= MAX_MESSAGES {
            buf.pop_front();
        }
        buf.push_back(msg);
    }
}

pub async fn update_subscriptions(
    app: &AppHandle,
    new_channels: HashSet<String>,
    access_token: String,
    username: String,
) {
    let Some(state) = app.try_state::<TwitchState>() else {
        return;
    };

    state.subscriptions.lock().await.grid_channels = new_channels.clone();

    {
        let mut shutdown_guard = state.irc_shutdown_tx.lock().await;
        if let Some(tx) = shutdown_guard.take() {
            let _ = tx.send(());
        }
    }

    if new_channels.is_empty() {
        emit_connection_state(app, ConnectionState::Disconnected).await;
        return;
    }

    let (tx, rx) = oneshot::channel();
    *state.irc_shutdown_tx.lock().await = Some(tx);

    let (out_tx, out_rx) = tokio::sync::mpsc::channel(32);
    *state.irc_outbound_tx.lock().await = Some(out_tx);

    let app_clone = app.clone();
    tokio::spawn(async move {
        run_irc_loop(app_clone, access_token, username, new_channels, rx, out_rx).await;
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_privmsg() {
        // Arrange
        let line = "@badge-info=;badges=moderator/1;color=#1E90FF;display-name=TestUser;emotes=;id=abc-123;mod=1;subscriber=0;tmi-sent-ts=1700000000000;turbo=0;user-id=99999;user-type=mod :testuser!testuser@testuser.tmi.twitch.tv PRIVMSG #gaules :hello world";

        // Act
        let msg = parse_privmsg(line);

        // Assert
        let msg = msg.expect("should parse successfully");
        assert_eq!(msg.channel, "gaules");
        assert_eq!(msg.username, "testuser");
        assert_eq!(msg.display_name, "TestUser");
        assert_eq!(msg.message, "hello world");
        assert_eq!(msg.id, "abc-123");
        assert_eq!(msg.color, Some("#1E90FF".to_owned()));
    }

    #[test]
    fn returns_none_for_non_privmsg() {
        // Arrange
        let line = ":tmi.twitch.tv 001 testuser :Welcome, GLHF!";

        // Act
        let result = parse_privmsg(line);

        // Assert
        assert!(result.is_none());
    }

    #[test]
    fn backoff_delay_never_exceeds_cap() {
        // Arrange + Act + Assert
        for attempt in 0u32..20 {
            let delay = backoff_delay(attempt);
            assert!(
                delay <= Duration::from_secs(61),
                "delay too large at attempt {attempt}"
            );
        }
    }

    #[test]
    fn backoff_first_attempt_is_instant() {
        // Arrange + Act
        let delay = backoff_delay(0);

        // Assert
        assert_eq!(delay, Duration::ZERO);
    }
}
