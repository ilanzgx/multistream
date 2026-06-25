use tauri::{AppHandle, Emitter, State};

use super::error::KickError;
use super::oauth;
use super::state::{KickAuthState, KickState};

#[tauri::command]
pub async fn kick_login(app: AppHandle, state: State<'_, KickState>) -> Result<(), KickError> {
    let http = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
        .use_rustls_tls()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(KickError::Http)?;

    let auth_info = oauth::start_pkce_flow(&app, &http).await?;

    oauth::store_auth(&auth_info)?;
    *state.auth.lock().await = Some(auth_info.clone());

    let auth_state = KickAuthState {
        authenticated: true,
        username: Some(auth_info.username.clone()),
    };
    let _ = app.emit("kick-auth-changed", auth_state);

    Ok(())
}

#[tauri::command]
pub async fn kick_logout(app: AppHandle, state: State<'_, KickState>) -> Result<(), KickError> {
    *state.auth.lock().await = None;

    oauth::clear_auth();
    let _ = app.emit(
        "kick-auth-changed",
        KickAuthState {
            authenticated: false,
            username: None,
        },
    );

    Ok(())
}

#[tauri::command]
pub async fn kick_get_auth_state(state: State<'_, KickState>) -> Result<KickAuthState, KickError> {
    let auth = state.auth.lock().await;
    Ok(KickAuthState {
        authenticated: auth.is_some(),
        username: auth.as_ref().map(|a| a.username.clone()),
    })
}

pub fn init_stored_auth() -> Option<super::state::KickAuthInfo> {
    if let Some(auth) = oauth::load_auth() {
        if auth.has_chat_write {
            return Some(auth);
        } else {
            // Se tiver o token antigo sem chat:write, descarta e exige novo login
            oauth::clear_auth();
            return None;
        }
    }
    None
}

#[tauri::command]
pub async fn kick_send_message(
    broadcaster_user_id: u64,
    message: String,
    state: State<'_, KickState>,
) -> Result<(), KickError> {
    let auth = {
        let auth_guard = state.auth.lock().await;
        auth_guard.clone()
    };

    let auth = auth.ok_or_else(|| KickError::OAuth("Not authenticated with Kick".to_string()))?;

    let http = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
        .use_rustls_tls()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(KickError::Http)?;

    // Send message
    super::api::send_message(&http, &auth, broadcaster_user_id, &message).await?;

    Ok(())
}

use std::collections::HashSet;

#[tauri::command]
pub async fn kick_set_channels(
    app: AppHandle,
    channels: Vec<(String, u64)>, // Array of (slug, chatroom_id)
) -> Result<(), KickError> {
    let channels_set: HashSet<(String, u64)> = channels.into_iter().collect();
    super::pusher::update_kick_subscriptions(&app, channels_set).await;
    Ok(())
}
