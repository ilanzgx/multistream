use std::collections::HashSet;

use tauri::{AppHandle, Emitter, Manager, State};

use super::error::TwitchError;
use super::irc::update_subscriptions;
use super::oauth;
use super::state::{AuthState, ConnectionState, TwitchAuthInfo, TwitchState, UnifiedChatMessage};

#[tauri::command]
pub async fn twitch_login(
    app: AppHandle,
    state: State<'_, TwitchState>,
) -> Result<oauth::DeviceFlowResponse, TwitchError> {
    let http = reqwest::Client::builder()
        .use_rustls_tls()
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

                    match oauth::poll_device_token(&http, &device_code).await {
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
pub async fn twitch_get_auth_state(state: State<'_, TwitchState>) -> Result<AuthState, TwitchError> {
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
    let new_set: HashSet<String> = channels.into_iter().map(|c| c.to_lowercase()).collect();
    let auth = state.auth.lock().await.clone();

    let Some(auth_info) = auth else {
        return Ok(());
    };

    let http = reqwest::Client::builder()
        .use_rustls_tls()
        .build()
        .map_err(TwitchError::Http)?;

    let auth_info = try_refresh_if_needed(&app, auth_info, &state, &http).await?;

    update_subscriptions(
        &app,
        new_set,
        auth_info.access_token,
        auth_info.username,
    )
    .await;

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
) -> Result<ConnectionState, TwitchError> {
    Ok(state.connection_state.lock().await.clone())
}

async fn try_refresh_if_needed(
    app: &AppHandle,
    auth: TwitchAuthInfo,
    state: &TwitchState,
    http: &reqwest::Client,
) -> Result<TwitchAuthInfo, TwitchError> {
    let validate_url = "https://id.twitch.tv/oauth2/validate";
    let is_valid = http
        .get(validate_url)
        .bearer_auth(&auth.access_token)
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false);

    if is_valid {
        return Ok(auth);
    }

    let refreshed = oauth::refresh_token(http, &auth.refresh_token).await?;
    oauth::store_auth(app, &refreshed)?;
    *state.auth.lock().await = Some(refreshed.clone());
    Ok(refreshed)
}

pub fn init_stored_auth(app: &AppHandle) -> Option<TwitchAuthInfo> {
    oauth::load_auth(app)
}
