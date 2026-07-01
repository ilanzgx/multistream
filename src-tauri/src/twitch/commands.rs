use crate::models::FollowedChannel;
use serde_json::Value;
use std::collections::HashSet;

use tauri::{AppHandle, Emitter, Manager, State};

use super::error::TwitchError;
use super::irc::update_subscriptions;
use super::oauth;
use super::state::{
    AuthState, ConnectionState, ConnectionStateEvent, OutboundIrcMessage, TwitchAuthInfo,
    TwitchState, UnifiedChatMessage,
};

#[tauri::command]
pub async fn twitch_login(
    app: AppHandle,
    state: State<'_, TwitchState>,
) -> Result<oauth::DeviceFlowResponse, TwitchError> {
    let http = reqwest::Client::builder()
        .use_rustls_tls()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(TwitchError::Http)?;

    let device_flow = oauth::start_device_flow(&http).await?;

    // Cancel any existing polling
    {
        let mut guard = state.auth_abort_tx.lock().await;
        if let Some(tx) = guard.take() {
            let _ = tx.send(());
        }
    }

    let (abort_tx, mut abort_rx) = tokio::sync::oneshot::channel::<()>();
    *state.auth_abort_tx.lock().await = Some(abort_tx);

    let app_handle = app.clone();
    let interval = std::time::Duration::from_secs(device_flow.interval);
    let expires_in = std::time::Duration::from_secs(device_flow.expires_in);
    let device_code = device_flow.device_code.clone();

    tokio::spawn(async move {
        let state_ref = app_handle.state::<TwitchState>();
        let start = std::time::Instant::now();
        let mut ticker = tokio::time::interval(interval);

        loop {
            tokio::select! {
                _ = &mut abort_rx => {
                    println!("Auth polling aborted");
                    break;
                }
                _ = ticker.tick() => {
                    if start.elapsed() > expires_in {
                        println!("Auth polling expired");
                        let _ = app_handle.emit("twitch-auth-error", "Expired");
                        break;
                    }

                    let poll_result = tokio::select! {
                        res = oauth::poll_device_token(&http, &device_code) => res,
                        _ = &mut abort_rx => {
                            println!("Auth polling aborted during request");
                            break;
                        }
                    };

                    match poll_result {
                        Ok(Some(auth)) => {
                            let _ = oauth::store_auth(&app_handle, &auth);
                            *state_ref.auth.lock().await = Some(auth.clone());

                            let auth_state = AuthState {
                                authenticated: true,
                                username: Some(auth.username.clone()),
                            };
                            let _ = app_handle.emit("twitch-auth-changed", auth_state);
                            break;
                        }
                        Ok(None) => {
                            // Pending, continue polling
                        }
                        Err(e) => {
                            println!("Auth polling error: {}", e);
                            let _ = app_handle.emit("twitch-auth-error", e.to_string());
                            break;
                        }
                    }
                }
            }
        }
    });

    Ok(device_flow)
}

#[tauri::command]
pub async fn twitch_cancel_login(state: State<'_, TwitchState>) -> Result<(), TwitchError> {
    let mut guard = state.auth_abort_tx.lock().await;
    if let Some(tx) = guard.take() {
        let _ = tx.send(());
    }
    Ok(())
}

#[tauri::command]
pub async fn twitch_logout(
    app: AppHandle,
    state: State<'_, TwitchState>,
) -> Result<(), TwitchError> {
    let mut auth_abort_guard = state.auth_abort_tx.lock().await;
    if let Some(tx) = auth_abort_guard.take() {
        let _ = tx.send(());
    }
    drop(auth_abort_guard);

    let mut shutdown_guard = state.irc_shutdown_tx.lock().await;
    if let Some(tx) = shutdown_guard.take() {
        let _ = tx.send(());
    }

    *state.auth.lock().await = None;
    *state.connection_state.lock().await = ConnectionState::Disconnected;
    state.messages.lock().await.clear();

    oauth::clear_auth(&app);
    let _ = app.emit(
        "twitch-auth-changed",
        AuthState {
            authenticated: false,
            username: None,
        },
    );

    Ok(())
}

#[tauri::command]
pub async fn twitch_get_auth_state(
    state: State<'_, TwitchState>,
) -> Result<AuthState, TwitchError> {
    let auth = state.auth.lock().await;
    Ok(AuthState {
        authenticated: auth.is_some(),
        username: auth.as_ref().map(|a| a.username.clone()),
    })
}

#[tauri::command]
pub async fn twitch_set_channels(
    app: AppHandle,
    state: State<'_, TwitchState>,
    channels: Vec<String>,
) -> Result<(), TwitchError> {
    log::info!(
        "[twitch-irc] twitch_set_channels called with: {:?}",
        channels
    );
    let new_set: HashSet<String> = channels.into_iter().map(|c| c.to_lowercase()).collect();
    let auth = state.auth.lock().await.clone();

    let Some(auth_info) = auth else {
        return Ok(());
    };

    let http = reqwest::Client::builder()
        .use_rustls_tls()
        .build()
        .map_err(TwitchError::Http)?;

    let auth_info = match try_refresh_if_needed(&app, auth_info, &state, &http).await {
        Ok(info) => info,
        Err(TwitchError::TokenRefreshFailed) => {
            // Token refresh failed or is invalid
            *state.auth.lock().await = None;
            oauth::clear_auth(&app);
            let _ = app.emit("twitch-auth-expired", ());
            let _ = app.emit(
                "twitch-auth-changed",
                AuthState {
                    authenticated: false,
                    username: None,
                },
            );
            return Err(TwitchError::TokenRefreshFailed);
        }
        Err(e) => return Err(e),
    };

    update_subscriptions(&app, new_set, auth_info.access_token, auth_info.username).await;

    Ok(())
}

#[tauri::command]
pub async fn twitch_get_messages(
    state: State<'_, TwitchState>,
) -> Result<Vec<UnifiedChatMessage>, TwitchError> {
    let buf = state.messages.lock().await;
    Ok(buf.iter().cloned().collect())
}

#[tauri::command]
pub async fn twitch_get_connection_state(
    state: State<'_, TwitchState>,
) -> Result<ConnectionStateEvent, TwitchError> {
    Ok(ConnectionStateEvent {
        state: state.connection_state.lock().await.clone(),
    })
}

#[tauri::command]
pub async fn twitch_send_message(
    app: AppHandle,
    state: State<'_, TwitchState>,
    channel: String,
    text: String,
) -> Result<(), TwitchError> {
    let tx = state.irc_outbound_tx.lock().await.clone();
    if let Some(tx) = tx {
        tx.send(OutboundIrcMessage {
            channel: channel.clone(),
            text: text.clone(),
        })
        .await
        .map_err(|_| TwitchError::WebSocket("Failed to send message".to_owned()))?;

        let username = state
            .auth
            .lock()
            .await
            .as_ref()
            .map(|a| a.username.clone())
            .unwrap_or_default();
        let message = UnifiedChatMessage {
            id: format!("local-{}", rand::random::<u64>()),
            channel: channel.clone(),
            username: username.clone(),
            display_name: username,
            message: text,
            timestamp_ms: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
            color: None,
            badges: Vec::new(),
            emotes: None,
        };

        state.messages.lock().await.push_back(message.clone());
        let _ = app.emit("unified-chat-message", message);
    } else {
        return Err(TwitchError::WebSocket("Not connected to IRC".to_owned()));
    }
    Ok(())
}

async fn try_refresh_if_needed(
    app: &AppHandle,
    auth: TwitchAuthInfo,
    state: &TwitchState,
    http: &reqwest::Client,
) -> Result<TwitchAuthInfo, TwitchError> {
    let validate_url = "https://id.twitch.tv/oauth2/validate";
    let validate_resp = http
        .get(validate_url)
        .bearer_auth(&auth.access_token)
        .send()
        .await;

    match validate_resp {
        Ok(resp) if resp.status().is_success() => Ok(auth),
        Ok(_) => {
            let refreshed = oauth::refresh_token(http, &auth.refresh_token).await?;
            oauth::store_auth(app, &refreshed)?;
            *state.auth.lock().await = Some(refreshed.clone());
            Ok(refreshed)
        }
        Err(e) => Err(TwitchError::Http(e)),
    }
}

pub fn init_stored_auth(app: &AppHandle) -> Option<TwitchAuthInfo> {
    oauth::load_auth(app)
}

#[tauri::command]
pub async fn twitch_get_followed_streams(
    app: AppHandle,
    state: State<'_, TwitchState>,
) -> Result<Vec<FollowedChannel>, TwitchError> {
    let auth = {
        let auth_guard = state.auth.lock().await;
        auth_guard.clone()
    };

    let auth =
        auth.ok_or_else(|| TwitchError::OAuth("Not authenticated with Twitch".to_string()))?;

    let http = reqwest::Client::builder()
        .use_rustls_tls()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(TwitchError::Http)?;

    let auth = try_refresh_if_needed(&app, auth, &state, &http).await?;

    let streams_url = format!(
        "https://api.twitch.tv/helix/streams/followed?user_id={}&first=100",
        auth.user_id
    );

    let mut live_streams = Vec::new();
    let mut after = String::new();

    loop {
        let url = if after.is_empty() {
            streams_url.clone()
        } else {
            format!("{}&after={}", streams_url, after)
        };

        let res = http
            .get(&url)
            .bearer_auth(&auth.access_token)
            .header("Client-Id", super::oauth::CLIENT_ID)
            .send()
            .await
            .map_err(TwitchError::Http)?;

        if !res.status().is_success() {
            if res.status() == reqwest::StatusCode::UNAUTHORIZED
                || res.status() == reqwest::StatusCode::FORBIDDEN
            {
                *state.auth.lock().await = None;
                oauth::clear_auth(&app);
                let _ = app.emit("twitch-auth-expired", ());
                let _ = app.emit(
                    "twitch-auth-changed",
                    super::state::AuthState {
                        authenticated: false,
                        username: None,
                    },
                );
            }
            return Err(TwitchError::OAuth(format!(
                "Failed to fetch streams: {}",
                res.status()
            )));
        }

        let json: Value = res.json().await.map_err(TwitchError::Http)?;

        if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
            if data.is_empty() {
                break;
            }
            for item in data {
                live_streams.push(item.clone());
            }
        } else {
            break;
        }

        if let Some(cursor) = json
            .get("pagination")
            .and_then(|p| p.get("cursor"))
            .and_then(|c| c.as_str())
        {
            after = cursor.to_string();
        } else {
            break;
        }
    }

    let mut avatars = std::collections::HashMap::new();
    for chunk in live_streams.chunks(100) {
        let mut users_url = "https://api.twitch.tv/helix/users?".to_string();
        for (i, item) in chunk.iter().enumerate() {
            if let Some(user_id) = item.get("user_id").and_then(|s| s.as_str()) {
                if i > 0 {
                    users_url.push('&');
                }
                users_url.push_str(&format!("id={}", user_id));
            }
        }

        if users_url.ends_with('?') {
            continue;
        }

        let res = http
            .get(&users_url)
            .bearer_auth(&auth.access_token)
            .header("Client-Id", super::oauth::CLIENT_ID)
            .send()
            .await;

        if let Ok(r) = res {
            if r.status().is_success() {
                if let Ok(json) = r.json::<Value>().await {
                    if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
                        for item in data {
                            if let (Some(id), Some(avatar)) = (
                                item.get("id").and_then(|s| s.as_str()),
                                item.get("profile_image_url").and_then(|s| s.as_str()),
                            ) {
                                avatars.insert(id.to_string(), avatar.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    let mut result = Vec::new();
    for live_info in live_streams {
        let id = live_info
            .get("user_id")
            .and_then(|s| s.as_str())
            .unwrap_or_default()
            .to_string();
        let name = live_info
            .get("user_name")
            .and_then(|s| s.as_str())
            .unwrap_or_default()
            .to_string();
        let login = live_info
            .get("user_login")
            .and_then(|s| s.as_str())
            .unwrap_or_default()
            .to_string();

        let is_live = true;
        let viewer_count = live_info.get("viewer_count").and_then(|v| v.as_u64());
        let game = live_info
            .get("game_name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let mut thumbnail_url = live_info
            .get("thumbnail_url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        if let Some(url) = &mut thumbnail_url {
            *url = url.replace("{width}", "320").replace("{height}", "180");
        }

        let title = live_info
            .get("title")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let avatar_url = avatars.get(&id).cloned().unwrap_or_default();

        result.push(FollowedChannel {
            id: login,
            platform: "twitch".to_string(),
            display_name: name,
            avatar_url,
            is_live,
            viewer_count,
            game,
            thumbnail_url,
            title,
        });
    }

    result.sort_by(|a, b| {
        b.viewer_count
            .unwrap_or(0)
            .cmp(&a.viewer_count.unwrap_or(0))
            .then_with(|| {
                a.display_name
                    .to_lowercase()
                    .cmp(&b.display_name.to_lowercase())
            })
    });

    Ok(result)
}
