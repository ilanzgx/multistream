use crate::models::FollowedChannel;
use base64::Engine;
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
                    log::info!("[twitch-oauth] Auth polling aborted");
                    break;
                }
                _ = ticker.tick() => {
                    if start.elapsed() > expires_in {
                        log::warn!("[twitch-oauth] Auth polling expired");
                        let _ = app_handle.emit("twitch-auth-error", "Expired");
                        break;
                    }

                    let poll_result = tokio::select! {
                        res = oauth::poll_device_token(&http, &device_code) => res,
                        _ = &mut abort_rx => {
                            log::info!("[twitch-oauth] Auth polling aborted during request");
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
                            log::error!("[twitch-oauth] Auth polling error: {}", e);
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

    revoke_auth_and_notify(&app, &state).await;
    *state.connection_state.lock().await = ConnectionState::Disconnected;
    state.messages.lock().await.clear();

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

    match try_refresh_if_needed(&app, auth_info, &state, &http).await {
        Ok(_) => {}
        Err(TwitchError::TokenRefreshFailed) => {
            // Token refresh failed or is invalid
            revoke_auth_and_notify(&app, &state).await;
            return Err(TwitchError::TokenRefreshFailed);
        }
        Err(e) => return Err(e),
    };

    update_subscriptions(&app, new_set).await;

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
                .unwrap_or_default()
                .as_millis() as u64,
            color: None,
            badges: Vec::new(),
            emotes: None,
        };

        let mut buf = state.messages.lock().await;
        if buf.len() >= super::state::MAX_MESSAGES {
            buf.pop_front();
        }
        buf.push_back(message.clone());
        drop(buf);

        let _ = app.emit("unified-chat-message", message);
    } else {
        return Err(TwitchError::WebSocket("Not connected to IRC".to_owned()));
    }
    Ok(())
}

pub(crate) async fn force_refresh_token(
    app: &AppHandle,
    state: &TwitchState,
    http: &reqwest::Client,
) -> Result<TwitchAuthInfo, TwitchError> {
    let _guard = state.auth_refresh_lock.lock().await;

    let current_auth = state.auth.lock().await.clone();
    let Some(auth) = current_auth else {
        return Err(TwitchError::OAuth(
            "No auth state available to refresh".to_owned(),
        ));
    };

    let refreshed = oauth::refresh_token(http, &auth.refresh_token).await?;
    oauth::store_auth(app, &refreshed)?;
    *state.auth.lock().await = Some(refreshed.clone());
    log::info!(
        "[twitch-auth] proactive token refresh successful for '{}'",
        refreshed.username
    );
    Ok(refreshed)
}

pub(crate) async fn revoke_auth_and_notify(app: &AppHandle, state: &TwitchState) {
    *state.auth.lock().await = None;
    oauth::clear_auth(app);
    let _ = app.emit("twitch-auth-expired", ());
    let _ = app.emit(
        "twitch-auth-changed",
        AuthState {
            authenticated: false,
            username: None,
        },
    );
}

pub(crate) async fn try_refresh_if_needed(
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
        Ok(resp) if resp.status() == reqwest::StatusCode::UNAUTHORIZED => {
            log::warn!("[twitch-auth] access token invalid (401), acquiring refresh lock...");
            let _guard = state.auth_refresh_lock.lock().await;

            let current_auth = state.auth.lock().await.clone();
            if let Some(current) = current_auth {
                if current.access_token != auth.access_token {
                    log::info!("[twitch-auth] stale token detected — another caller already refreshed. Reusing.");
                    return Ok(current);
                }

                let refreshed = oauth::refresh_token(http, &current.refresh_token).await?;
                oauth::store_auth(app, &refreshed)?;
                *state.auth.lock().await = Some(refreshed.clone());
                log::info!(
                    "[twitch-auth] token refreshed successfully for '{}'",
                    refreshed.username
                );
                Ok(refreshed)
            } else {
                Err(TwitchError::OAuth("Auth cleared during refresh".to_owned()))
            }
        }
        Ok(resp) => {
            // Transient error like 429 or 5xx. Don't refresh the token and don't delete local auth.
            Err(TwitchError::OAuth(format!(
                "Validation failed with status: {}",
                resp.status()
            )))
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

    let auth = match try_refresh_if_needed(&app, auth, &state, &http).await {
        Ok(auth) => auth,
        Err(TwitchError::TokenRefreshFailed) => {
            revoke_auth_and_notify(&app, &state).await;
            return Err(TwitchError::TokenRefreshFailed);
        }
        Err(e) => return Err(e),
    };

    let streams_url = format!(
        "https://api.twitch.tv/helix/streams/followed?user_id={}&first=100",
        auth.user_id
    );

    let mut live_streams = Vec::new();
    let mut after = String::new();
    let mut current_access_token = auth.access_token.clone();
    let mut has_retried_auth = false;

    loop {
        let url = if after.is_empty() {
            streams_url.clone()
        } else {
            format!("{}&after={}", streams_url, after)
        };

        let res = http
            .get(&url)
            .bearer_auth(&current_access_token)
            .header("Client-Id", super::oauth::client_id())
            .send()
            .await
            .map_err(TwitchError::Http)?;

        if res.status() == reqwest::StatusCode::UNAUTHORIZED {
            if has_retried_auth {
                log::error!("[twitch-streams] 401 persists after token refresh — revoking session permanently");
                revoke_auth_and_notify(&app, &state).await;
                return Err(TwitchError::TokenRefreshFailed);
            }
            has_retried_auth = true;

            let fresh_auth = state.auth.lock().await.clone();
            match fresh_auth {
                Some(a) => match try_refresh_if_needed(&app, a, &state, &http).await {
                    Ok(refreshed) => {
                        current_access_token = refreshed.access_token;
                        continue;
                    }
                    Err(TwitchError::TokenRefreshFailed) => {
                        revoke_auth_and_notify(&app, &state).await;
                        return Err(TwitchError::TokenRefreshFailed);
                    }
                    Err(e) => return Err(e),
                },
                None => {
                    return Err(TwitchError::OAuth("Not authenticated".to_string()));
                }
            }
        }

        if !res.status().is_success() {
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
            .bearer_auth(&current_access_token)
            .header("Client-Id", super::oauth::client_id())
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

        let thumbnail_url = live_info
            .get("thumbnail_url")
            .and_then(|v| v.as_str())
            .map(|s| format_thumbnail_url(s, 320, 180));

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

    sort_followed_channels(&mut result);

    Ok(result)
}

#[tauri::command]
pub async fn twitch_get_hls_url(
    state: State<'_, TwitchState>,
    channel: String,
) -> Result<String, TwitchError> {
    let http = reqwest::Client::builder()
        .use_rustls_tls()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(TwitchError::Http)?;

    let channel_clean = channel.to_lowercase();
    if !channel_clean
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return Err(TwitchError::Api("Invalid channel name format".into()));
    }
    let access_token = state
        .auth
        .lock()
        .await
        .as_ref()
        .map(|a| a.access_token.clone());
    let custom_client_id = oauth::client_id();

    let gql_body = serde_json::json!({
        "operationName": "PlaybackAccessToken",
        "query": "query PlaybackAccessToken($login: String!, $playerType: String!) { streamPlaybackAccessToken(channelName: $login, params: {platform: \"web\", playerBackend: \"mediaplayer\", playerType: $playerType}) { value signature __typename } }",
        "variables": {
            "login": channel_clean,
            "playerType": "site"
        }
    });

    let send_request = |c_id: &str, auth: Option<&str>| {
        let mut req = http
            .post("https://gql.twitch.tv/gql")
            .header("Client-ID", c_id)
            .header("Client-Session-Id", format!("{:x}", rand::random::<u64>()))
            .json(&gql_body);

        if let Some(tok) = auth {
            req = req.header("Authorization", format!("OAuth {}", tok));
        }
        req
    };

    let web_client_id = "kimne78kx3ncx6brgo4mv6wki5h1ko";
    let mut resp = None;
    let mut used_client_id = web_client_id;

    // Pass 1: Try authenticated request if access_token and custom_client_id exist
    if let (Some(tok), false) = (&access_token, custom_client_id.is_empty()) {
        if let Ok(res) = send_request(custom_client_id, Some(tok)).send().await {
            if res.status().is_success() {
                resp = Some(res);
                used_client_id = custom_client_id;
            }
        }
    }

    // Pass 2: Fallback to web client ID without Authorization header
    if resp.is_none() {
        let res = send_request(web_client_id, None)
            .send()
            .await
            .map_err(TwitchError::Http)?;

        if !res.status().is_success() {
            let status = res.status();
            let err = res.text().await.unwrap_or_default();
            return Err(TwitchError::OAuth(format!("GQL HTTP {}: {}", status, err)));
        }
        resp = Some(res);
        used_client_id = web_client_id;
    }

    let response = resp.unwrap();
    let body: Value = response
        .json()
        .await
        .map_err(|e| TwitchError::OAuth(e.to_string()))?;

    let stream_token = &body["data"]["streamPlaybackAccessToken"];

    if stream_token.is_null() {
        if let Some(errors) = body.get("errors") {
            let msg = errors
                .as_array()
                .and_then(|a| a.first())
                .and_then(|e| e["message"].as_str())
                .unwrap_or("Unknown GQL error");
            return Err(TwitchError::OAuth(format!("Twitch GQL: {}", msg)));
        }
        return Err(TwitchError::OAuth(format!(
            "Channel '{}' is offline or unavailable",
            channel_clean
        )));
    }

    let token_value = stream_token["value"].as_str().ok_or_else(|| {
        TwitchError::OAuth(format!("Missing token value for '{}'", channel_clean))
    })?;

    let signature = stream_token["signature"]
        .as_str()
        .ok_or_else(|| TwitchError::OAuth("Missing token signature".into()))?;

    let encoded_token = urlencoding::encode(token_value);
    let random_p: u32 = rand::random::<u32>() % 9_999_999;

    let master_playlist_url = format!(
        "https://usher.ttvnw.net/api/channel/hls/{}.m3u8?client_id={}&token={}&sig={}&allow_source=true&allow_audio_only=true&fast_bread=true&p={}",
        channel_clean,
        used_client_id,
        encoded_token,
        signature,
        random_p
    );

    let usher_resp = http
        .get(&master_playlist_url)
        .send()
        .await
        .map_err(TwitchError::Http)?;

    if usher_resp.status().as_u16() == 404 {
        return Err(TwitchError::OAuth(format!(
            "Channel '{}' is offline",
            channel_clean
        )));
    }

    if !usher_resp.status().is_success() {
        let status = usher_resp.status();
        return Err(TwitchError::OAuth(format!("Usher API HTTP {}", status)));
    }

    let m3u8_content = usher_resp.text().await.map_err(TwitchError::Http)?;

    let encoded_m3u8 = base64::engine::general_purpose::STANDARD.encode(m3u8_content.as_bytes());
    let data_uri = format!("data:application/x-mpegurl;base64,{}", encoded_m3u8);

    Ok(data_uri)
}

pub(crate) fn format_thumbnail_url(url: &str, width: u32, height: u32) -> String {
    url.replace("{width}", &width.to_string())
        .replace("{height}", &height.to_string())
}

pub(crate) fn sort_followed_channels(channels: &mut [FollowedChannel]) {
    channels.sort_by(|a, b| {
        b.viewer_count
            .unwrap_or(0)
            .cmp(&a.viewer_count.unwrap_or(0))
            .then_with(|| {
                a.display_name
                    .to_lowercase()
                    .cmp(&b.display_name.to_lowercase())
            })
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_format_thumbnail_url_correctly() {
        let url = "https://static-cdn.jtvnw.net/previews-ttv/live_user_gaules-{width}x{height}.jpg";
        let formatted = format_thumbnail_url(url, 320, 180);
        assert_eq!(
            formatted,
            "https://static-cdn.jtvnw.net/previews-ttv/live_user_gaules-320x180.jpg"
        );
    }

    #[test]
    fn should_sort_channels_by_viewer_count_then_alphabetically() {
        let mut channels = vec![
            FollowedChannel {
                id: "1".to_string(),
                platform: "twitch".to_string(),
                display_name: "Zack".to_string(),
                avatar_url: "".to_string(),
                is_live: true,
                viewer_count: Some(100),
                game: None,
                thumbnail_url: None,
                title: None,
            },
            FollowedChannel {
                id: "2".to_string(),
                platform: "twitch".to_string(),
                display_name: "Alice".to_string(),
                avatar_url: "".to_string(),
                is_live: true,
                viewer_count: Some(200),
                game: None,
                thumbnail_url: None,
                title: None,
            },
            FollowedChannel {
                id: "3".to_string(),
                platform: "twitch".to_string(),
                display_name: "Bob".to_string(),
                avatar_url: "".to_string(),
                is_live: true,
                viewer_count: Some(100),
                game: None,
                thumbnail_url: None,
                title: None,
            },
            FollowedChannel {
                id: "4".to_string(),
                platform: "twitch".to_string(),
                display_name: "Charlie".to_string(),
                avatar_url: "".to_string(),
                is_live: true,
                viewer_count: None,
                game: None,
                thumbnail_url: None,
                title: None,
            },
        ];

        sort_followed_channels(&mut channels);

        // Expected order: Alice (200), Bob (100, alphabetically before Zack), Zack (100), Charlie (None == 0)
        assert_eq!(channels[0].display_name, "Alice");
        assert_eq!(channels[1].display_name, "Bob");
        assert_eq!(channels[2].display_name, "Zack");
        assert_eq!(channels[3].display_name, "Charlie");
    }

    #[test]
    fn should_sort_case_insensitive() {
        let mut channels = vec![
            FollowedChannel {
                id: "1".to_string(),
                platform: "twitch".to_string(),
                display_name: "zack".to_string(),
                avatar_url: "".to_string(),
                is_live: true,
                viewer_count: Some(100),
                game: None,
                thumbnail_url: None,
                title: None,
            },
            FollowedChannel {
                id: "2".to_string(),
                platform: "twitch".to_string(),
                display_name: "Alice".to_string(),
                avatar_url: "".to_string(),
                is_live: true,
                viewer_count: Some(100),
                game: None,
                thumbnail_url: None,
                title: None,
            },
        ];

        sort_followed_channels(&mut channels);

        assert_eq!(channels[0].display_name, "Alice");
        assert_eq!(channels[1].display_name, "zack");
    }
}
