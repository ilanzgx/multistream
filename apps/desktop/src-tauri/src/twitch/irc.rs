use std::collections::{HashMap, HashSet};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::oneshot;
use tokio_tungstenite::{connect_async, tungstenite::Message};

use super::error::TwitchError;
use super::state::{
    ConnectionState, ConnectionStateEvent, OutboundIrcMessage, TwitchState, UnifiedChatMessage,
    MAX_MESSAGES,
};

const IRC_URL: &str = "wss://irc-ws.chat.twitch.tv:443";
const JOIN_DELAY_MS: u64 = 350;
const HEARTBEAT_INTERVAL_SECS: u64 = 60;
const HEARTBEAT_TIMEOUT_SECS: u64 = 360;
const TOKEN_PROACTIVE_REFRESH_SECS: u64 = 3 * 60 * 60 + 30 * 60; // 3h30m — Twitch access tokens expire after ~4h

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

    let timestamp_ms = u64::try_from(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
    )
    .unwrap_or(u64::MAX);

    let id = tags
        .get("id")
        .cloned()
        .unwrap_or_else(|| format!("{}-{}-{}", channel, username, timestamp_ms));

    let color = tags.get("color").filter(|s| !s.is_empty()).cloned();
    let emotes = tags.get("emotes").filter(|s| !s.is_empty()).cloned();

    let badges: Vec<String> = tags
        .get("badges")
        .filter(|s| !s.is_empty())
        .map(|s| s.split(',').map(str::to_owned).collect())
        .unwrap_or_default();

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
    if let Some(twitch_state) = app.try_state::<TwitchState>() {
        *twitch_state.connection_state.lock().await = state.clone();
    }
    let _ = app.emit("twitch-connection-state", ConnectionStateEvent { state });
}

pub async fn run_irc_loop(
    app: AppHandle,
    channels: HashSet<String>,
    mut shutdown_rx: oneshot::Receiver<()>,
    mut outbound_rx: tokio::sync::mpsc::Receiver<OutboundIrcMessage>,
) {
    let mut attempt: u32 = 0;

    let http = match reqwest::Client::builder()
        .use_rustls_tls()
        .timeout(Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            log::error!("[twitch-irc] Failed to create HTTP client: {}", e);
            return;
        }
    };

    loop {
        use tokio::sync::oneshot::error::TryRecvError;
        match shutdown_rx.try_recv() {
            Ok(()) => {
                log::info!("[twitch-irc] shutdown signalled at loop top, exiting");
                emit_connection_state(&app, ConnectionState::Disconnected).await;
                break;
            }
            Err(TryRecvError::Closed) => {
                log::info!("[twitch-irc] shutdown sender dropped, exiting");
                emit_connection_state(&app, ConnectionState::Disconnected).await;
                break;
            }
            Err(TryRecvError::Empty) => {}
        }

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

        let auth_info_opt = {
            let state = app.state::<TwitchState>();
            let auth = state.auth.lock().await.clone();

            let Some(auth) = auth else {
                log::warn!("[twitch-irc] No auth state found, exiting loop");
                emit_connection_state(&app, ConnectionState::Disconnected).await;
                break;
            };

            match super::commands::try_refresh_if_needed(&app, auth, &state, &http).await {
                Ok(info) => Some(info),
                Err(e) => {
                    log::warn!("[twitch-irc] Auth refresh failed ({e})");
                    emit_connection_state(&app, ConnectionState::Disconnected).await;
                    if matches!(e, TwitchError::TokenRefreshFailed) {
                        super::commands::revoke_auth_and_notify(&app, &state).await;
                        break;
                    }
                    None
                }
            }
        };

        if let Some(auth_info) = auth_info_opt {
            let start_time = tokio::time::Instant::now();

            match connect_irc(
                &app,
                &auth_info.access_token,
                &auth_info.username,
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
                Err(TwitchError::ProactiveRefresh) => {
                    log::info!("[twitch-irc] proactive token renewal triggered, refreshing before reconnect");
                    let state = app.state::<TwitchState>();
                    if let Some(auth) = state.auth.lock().await.clone() {
                        match super::oauth::refresh_token(&http, &auth.refresh_token).await {
                            Ok(new_auth) => {
                                if let Err(e) = super::oauth::store_auth(&app, &new_auth) {
                                    log::error!(
                                        "[twitch-irc] failed to persist refreshed token: {e}"
                                    );
                                }
                                *state.auth.lock().await = Some(new_auth);
                                log::info!(
                                    "[twitch-irc] token refreshed proactively, will reconnect"
                                );
                            }
                            Err(TwitchError::TokenRefreshFailed) => {
                                log::error!("[twitch-irc] token permanently revoked during proactive refresh");
                                super::commands::revoke_auth_and_notify(&app, &state).await;
                                emit_connection_state(&app, ConnectionState::Disconnected).await;
                                break;
                            }
                            Err(e) => {
                                log::warn!("[twitch-irc] proactive refresh transient error ({e}), reconnecting with current token");
                            }
                        }
                    }
                    emit_connection_state(&app, ConnectionState::Disconnected).await;
                }
                Err(TwitchError::OAuth(ref msg)) => {
                    log::warn!("[twitch-irc] auth failure from IRC ({msg}), attempting token refresh before reconnect");
                    let state = app.state::<TwitchState>();
                    if let Some(auth) = state.auth.lock().await.clone() {
                        match super::commands::try_refresh_if_needed(&app, auth, &state, &http)
                            .await
                        {
                            Ok(_) => {
                                log::info!("[twitch-irc] token refreshed after auth failure, will reconnect");
                            }
                            Err(TwitchError::TokenRefreshFailed) => {
                                log::error!("[twitch-irc] token permanently revoked after auth failure, stopping");
                                super::commands::revoke_auth_and_notify(&app, &state).await;
                                emit_connection_state(&app, ConnectionState::Disconnected).await;
                                break;
                            }
                            Err(e) => {
                                log::warn!("[twitch-irc] refresh attempt after auth failure returned transient error ({e}), will retry");
                            }
                        }
                    }
                    emit_connection_state(&app, ConnectionState::Disconnected).await;
                }
                Err(e) => {
                    log::warn!("[twitch-irc] connect_irc returned error: {e}");
                }
            }

            if start_time.elapsed() > Duration::from_secs(60) {
                attempt = 0;
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
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_millis(10_000)) => {}
                _ = &mut *shutdown_rx => {
                    log::info!("[twitch-irc] shutdown during JOIN batch, aborting");
                    let _ = write.send(Message::Close(None)).await;
                    return Ok(());
                }
            }
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

    let token_refresh_deadline =
        tokio::time::sleep(Duration::from_secs(TOKEN_PROACTIVE_REFRESH_SECS));
    tokio::pin!(token_refresh_deadline);

    let mut loop_iteration: u64 = 0;
    let mut total_messages_received: u64 = 0;
    let mut total_pings_received: u64 = 0;
    let mut total_pongs_sent: u64 = 0;
    let mut total_outbound_sent: u64 = 0;
    let mut total_notices_received: u64 = 0;

    loop {
        loop_iteration += 1;
        tokio::select! {
            biased;
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

                                let tags = if line.starts_with('@') {
                                    line.split_once(' ')
                                        .map(|(t, _)| parse_tags(t.trim_start_matches('@')))
                                        .unwrap_or_default()
                                } else {
                                    HashMap::new()
                                };
                                let is_auth_failure = tags
                                    .get("msg-id")
                                    .map(|id| id == "msg_bad_auth")
                                    .unwrap_or(false)
                                    || line.contains("Login authentication failed");

                                if is_auth_failure {
                                    log::error!("[twitch-irc] fatal NOTICE: auth failed (msg-id or text match)");
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
            _ = &mut *shutdown_rx => {
                log::info!(
                    "[twitch-irc] shutdown signal received at iteration={loop_iteration}, \
                     msgs_rx={total_messages_received}, outbound={total_outbound_sent}"
                );
                let _ = write.send(Message::Close(None)).await;
                return Ok(());
            }
            _ = &mut token_refresh_deadline => {
                log::info!(
                    "[twitch-irc] proactive token refresh deadline reached after {}s, \
                     reconnecting to renew session (iteration={loop_iteration})",
                    TOKEN_PROACTIVE_REFRESH_SECS
                );
                let _ = write.send(Message::Close(None)).await;
                return Err(TwitchError::ProactiveRefresh);
            }
            _ = heartbeat.tick() => {
                let idle = last_read_activity.elapsed();
                let timeout = Duration::from_secs(HEARTBEAT_TIMEOUT_SECS);
                log::debug!(
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
                        return Err(TwitchError::Internal("outbound channel closed".to_owned()));
                    }
                }
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

pub async fn update_subscriptions(app: &AppHandle, new_channels: HashSet<String>) {
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
        run_irc_loop(app_clone, new_channels, rx, out_rx).await;
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

    #[test]
    fn should_parse_tags_correctly() {
        // Arrange
        let raw = "badge-info=;badges=moderator/1,subscriber/12;color=#1E90FF;display-name=TestUser;emotes=;id=abc-123;mod=1;room-id=123;subscriber=1;tmi-sent-ts=1700000000000;turbo=0;user-id=99999;user-type=mod";

        // Act
        let tags = parse_tags(raw);

        // Assert
        assert_eq!(tags.get("color").unwrap(), "#1E90FF");
        assert_eq!(tags.get("display-name").unwrap(), "TestUser");
        assert_eq!(tags.get("badge-info").unwrap(), "");
        assert_eq!(tags.get("badges").unwrap(), "moderator/1,subscriber/12");
        assert_eq!(tags.get("nonexistent"), None);
    }

    #[test]
    fn should_handle_malformed_tags() {
        // Arrange
        let raw = "key1=val1;key2;key3=val3;=";

        // Act
        let tags = parse_tags(raw);

        // Assert
        assert_eq!(tags.get("key1").unwrap(), "val1");
        assert_eq!(tags.get("key2").unwrap(), "");
        assert_eq!(tags.get("key3").unwrap(), "val3");
        assert_eq!(tags.get("").unwrap(), "");
    }

    #[test]
    fn should_fallback_to_username_when_display_name_is_empty() {
        // Arrange
        let line = "@color=#1E90FF;id=abc-123 :testuser!testuser@testuser.tmi.twitch.tv PRIVMSG #gaules :hello world";

        // Act
        let msg = parse_privmsg(line).unwrap();

        // Assert
        assert_eq!(msg.display_name, "testuser");
    }

    #[test]
    fn should_parse_privmsg_without_tags() {
        // Arrange
        let line = ":testuser!testuser@testuser.tmi.twitch.tv PRIVMSG #gaules :hello basic irc";

        // Act
        let result = parse_privmsg(line);

        // Assert
        assert!(result.is_none());
    }

    #[test]
    fn should_generate_unique_fallback_id_including_timestamp() {
        // Arrange — message without an `id` tag so the fallback path runs
        let line =
            "@color=#1E90FF :testuser!testuser@testuser.tmi.twitch.tv PRIVMSG #gaules :hello";

        // Act
        let msg = parse_privmsg(line).unwrap();

        // Assert — fallback id must contain channel, username, and a timestamp component
        assert!(
            msg.id.starts_with("gaules-testuser-"),
            "id should start with 'channel-username-', got: {}",
            msg.id
        );
    }

    #[test]
    fn proactive_refresh_deadline_is_less_than_twitch_token_lifetime() {
        // Arrange
        let twitch_token_lifetime_secs: u64 = 4 * 60 * 60;

        // Act + Assert
        assert!(
            TOKEN_PROACTIVE_REFRESH_SECS < twitch_token_lifetime_secs,
            "proactive refresh ({TOKEN_PROACTIVE_REFRESH_SECS}s) must fire before token expires ({twitch_token_lifetime_secs}s)"
        );
    }

    #[test]
    fn proactive_refresh_error_is_dedicated_variant() {
        // Arrange
        let err = TwitchError::ProactiveRefresh;

        // Act
        let msg = err.to_string();

        // Assert — the dedicated variant must have a distinct display string
        assert!(
            msg.contains("roactive"),
            "ProactiveRefresh display string should mention proactive refresh, got: {msg}"
        );
    }
}
