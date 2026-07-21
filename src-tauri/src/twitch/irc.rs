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
const HEARTBEAT_INTERVAL_SECS: u64 = 60;
const HEARTBEAT_TIMEOUT_SECS: u64 = 360;

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
        let state_label = if attempt == 0 {
            ConnectionState::Disconnected
        } else {
            ConnectionState::Reconnecting
        };
        log::info!(
            "[twitch-irc] run_irc_loop iteration: attempt={attempt}, state={state_label:?}, channels={:?}",
            channels
        );
        emit_connection_state(&app, state_label).await;

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
            Err(TwitchError::OAuth(ref msg)) => {
                log::warn!("[twitch-irc] auth failure ({msg}), stopping loop");
                emit_connection_state(&app, ConnectionState::Disconnected).await;
                let _ = app.emit("twitch-auth-expired", ());
                break;
            }
            Err(e) => {
                log::warn!("[twitch-irc] connect_irc returned error: {e}");
            }
        }

        let delay = backoff_delay(attempt);
        attempt += 1;
        log::info!("[twitch-irc] reconnecting in {delay:?} (attempt {attempt})");

        tokio::select! {
            _ = tokio::time::sleep(delay) => {}
            _ = &mut shutdown_rx => {
                log::info!("[twitch-irc] shutdown received during backoff, exiting");
                emit_connection_state(&app, ConnectionState::Disconnected).await;
                break;
            }
        }
    }
    log::info!("[twitch-irc] run_irc_loop exiting");
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
    log::info!("[twitch-irc] connecting to {IRC_URL}...");
    let connect_future = connect_async(IRC_URL);
    let (ws_stream, _) = match tokio::time::timeout(Duration::from_secs(10), connect_future).await {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => return Err(TwitchError::WebSocket(e.to_string())),
        Err(_) => return Err(TwitchError::WebSocket("Connection timeout".to_string())),
    };
    log::info!("[twitch-irc] WebSocket connected, sending auth...");

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

    let mut last_read_activity = tokio::time::Instant::now();
    let mut heartbeat = tokio::time::interval(Duration::from_secs(HEARTBEAT_INTERVAL_SECS));
    heartbeat.tick().await;

    let mut loop_iteration: u64 = 0;
    let mut total_messages_received: u64 = 0;
    let mut total_pings_received: u64 = 0;
    let mut total_pongs_sent: u64 = 0;
    let mut total_outbound_sent: u64 = 0;
    let mut total_notices_received: u64 = 0;

    loop {
        loop_iteration += 1;
        tokio::select! {
            msg = read.next() => {
                let elapsed_since_last = last_read_activity.elapsed();
                last_read_activity = tokio::time::Instant::now();

                let msg = match msg {
                    Some(Ok(m)) => m,
                    Some(Err(e)) => {
                        log::error!(
                            "[twitch-irc] read error at iteration={loop_iteration}, \
                             msgs_rx={total_messages_received}, pings={total_pings_received}, \
                             outbound={total_outbound_sent}, notices={total_notices_received}, \
                             idle={elapsed_since_last:?}: {e}"
                        );
                        return Err(TwitchError::WebSocket(e.to_string()));
                    }
                    None => {
                        log::error!(
                            "[twitch-irc] stream returned None (closed) at iteration={loop_iteration}, \
                             msgs_rx={total_messages_received}, pings={total_pings_received}, \
                             outbound={total_outbound_sent}, notices={total_notices_received}, \
                             idle={elapsed_since_last:?}"
                        );
                        return Err(TwitchError::WebSocket("stream closed".to_owned()));
                    }
                };

                match msg {
                    Message::Text(text) => {
                        total_messages_received += 1;

                        for line in text.lines() {
                            if line.starts_with("PING") {
                                total_pings_received += 1;
                                log::info!(
                                    "[twitch-irc] PING #{total_pings_received} received \
                                     (idle={elapsed_since_last:?}, iteration={loop_iteration})"
                                );
                                let pong = line.replace("PING", "PONG");
                                match write.send(Message::Text(pong)).await {
                                    Ok(()) => {
                                        total_pongs_sent += 1;
                                    }
                                    Err(e) => {
                                        log::error!(
                                            "[twitch-irc] PONG write failed at iteration={loop_iteration}: {e}"
                                        );
                                        return Err(TwitchError::WebSocket(e.to_string()));
                                    }
                                }
                                continue;
                            }

                            if line.contains("NOTICE") {
                                total_notices_received += 1;

                                if line.contains("Login authentication failed") {
                                    log::error!("[twitch-irc] fatal NOTICE: Login authentication failed");
                                    return Err(TwitchError::OAuth("IRC auth failed".to_owned()));
                                }

                                let is_msg_error = line.contains("msg-id=msg_") || !line.starts_with('@');
                                if is_msg_error {
                                    if let (Some(hash_idx), Some(colon_idx)) = (line.find(" #"), line.rfind(" :")) {
                                        if hash_idx < colon_idx {
                                            let channel = &line[hash_idx + 2..colon_idx]
                                                .split_whitespace()
                                                .next()
                                                .unwrap_or("");
                                            let notice_text = &line[colon_idx + 2..];

                                            #[derive(serde::Serialize, Clone)]
                                            struct TwitchChatErrorEvent {
                                                channel: String,
                                                message: String,
                                            }

                                            let _ = app.emit(
                                                "twitch-chat-error",
                                                TwitchChatErrorEvent {
                                                    channel: channel.to_string(),
                                                    message: notice_text.to_string(),
                                                },
                                            );
                                        }
                                    }
                                }
                            }

                            if line.contains("PRIVMSG") {
                                if let Some(chat_msg) = parse_privmsg(line) {
                                    push_message(app, chat_msg.clone()).await;
                                    let _ = app.emit("unified-chat-message", chat_msg);
                                }
                            }
                        }
                    }
                    Message::Ping(payload) => {
                        total_pings_received += 1;
                        log::info!(
                            "[twitch-irc] WS-level Ping #{total_pings_received} \
                             (idle={elapsed_since_last:?}, iteration={loop_iteration})"
                        );
                        match write.send(Message::Pong(payload)).await {
                            Ok(()) => {
                                total_pongs_sent += 1;
                                log::debug!("[twitch-irc] WS-level Pong #{total_pongs_sent} sent");
                            }
                            Err(e) => {
                                log::error!(
                                    "[twitch-irc] WS Pong write failed at iteration={loop_iteration}: {e}"
                                );
                                return Err(TwitchError::WebSocket(e.to_string()));
                            }
                        }
                    }
                    Message::Close(frame) => {
                        log::warn!(
                            "[twitch-irc] server sent Close frame at iteration={loop_iteration}, \
                             msgs_rx={total_messages_received}, frame={frame:?}"
                        );
                        return Err(TwitchError::WebSocket("server closed connection".to_owned()));
                    }
                    other => {
                        log::debug!("[twitch-irc] unhandled WS message type: {other:?}");
                    }
                }
            }
            msg = outbound_rx.recv() => {
                match msg {
                    Some(out_msg) => {
                        total_outbound_sent += 1;
                        log::info!(
                            "[twitch-irc] outbound #{total_outbound_sent}: \
                             PRIVMSG #{} (iteration={loop_iteration}, \
                             msgs_rx={total_messages_received})",
                            out_msg.channel
                        );
                        let line = format!("PRIVMSG #{} :{}", out_msg.channel, out_msg.text);
                        if let Err(e) = write.send(Message::Text(line)).await {
                            log::error!(
                                "[twitch-irc] outbound write failed at iteration={loop_iteration}, \
                                 outbound #{total_outbound_sent}: {e}"
                            );
                        }
                    }
                    None => {
                        log::warn!(
                            "[twitch-irc] outbound_rx.recv() returned None \
                             (sender dropped) at iteration={loop_iteration}, \
                             msgs_rx={total_messages_received}, outbound={total_outbound_sent}"
                        );
                        return Err(TwitchError::WebSocket("outbound channel closed".to_owned()));
                    }
                }
            }
            _ = heartbeat.tick() => {
                let idle = last_read_activity.elapsed();
                let timeout = Duration::from_secs(HEARTBEAT_TIMEOUT_SECS);
                log::info!(
                    "[twitch-irc] heartbeat check: idle={idle:?}, timeout={timeout:?}, \
                     iteration={loop_iteration}, msgs_rx={total_messages_received}, \
                     pings={total_pings_received}, pongs={total_pongs_sent}, \
                     outbound={total_outbound_sent}, notices={total_notices_received}"
                );
                if idle > timeout {
                    log::error!(
                        "[twitch-irc] no data received for {idle:?} (> {timeout:?}), \
                         assuming dead connection. iteration={loop_iteration}"
                    );
                    return Err(TwitchError::WebSocket(
                        format!("no data received for {idle:?}, connection presumed dead")
                    ));
                }
            }
            _ = &mut *shutdown_rx => {
                log::info!(
                    "[twitch-irc] shutdown signal received at iteration={loop_iteration}, \
                     msgs_rx={total_messages_received}, outbound={total_outbound_sent}"
                );
                let _ = write.send(Message::Close(None)).await;
                return Ok(());
            }
        }
    }
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

    log::info!(
        "[twitch-irc] update_subscriptions called: new_channels={:?}",
        new_channels
    );

    state.subscriptions.lock().await.grid_channels = new_channels.clone();

    {
        let mut shutdown_guard = state.irc_shutdown_tx.lock().await;
        if let Some(tx) = shutdown_guard.take() {
            log::info!("[twitch-irc] sending shutdown to previous IRC loop");
            let _ = tx.send(());
        }
    }

    if new_channels.is_empty() {
        log::info!("[twitch-irc] no channels, setting disconnected");
        emit_connection_state(app, ConnectionState::Disconnected).await;
        return;
    }

    let (tx, rx) = oneshot::channel();
    *state.irc_shutdown_tx.lock().await = Some(tx);

    let (out_tx, out_rx) = tokio::sync::mpsc::channel(32);
    *state.irc_outbound_tx.lock().await = Some(out_tx);

    let app_clone = app.clone();
    log::info!("[twitch-irc] spawning new IRC loop for {:?}", new_channels);
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
