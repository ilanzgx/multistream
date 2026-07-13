use tauri::{AppHandle, Emitter, State};

use std::collections::HashSet;

use super::error::KickError;
use super::oauth;
use super::state::{KickAuthState, KickState};

#[tauri::command]
pub async fn kick_login(
    app: AppHandle,
    state: State<'_, KickState>,
    locale: Option<String>,
) -> Result<(), KickError> {
    let http = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
        .use_rustls_tls()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(KickError::Http)?;

    let locale_str = locale.as_deref().unwrap_or("en");

    let (callback_tx, callback_rx) =
        tokio::sync::oneshot::channel::<Result<(String, String), String>>();

    {
        let mut tx_guard = state.oauth_callback_tx.lock().await;
        if tx_guard.is_some() {
            return Err(KickError::OAuth(
                "An authentication is already in progress.".to_owned(),
            ));
        }
        *tx_guard = Some(callback_tx);
    }

    let auth_info = oauth::start_pkce_flow(&app, &http, locale_str, callback_rx).await;

    *state.oauth_callback_tx.lock().await = None;

    let auth_info = auth_info?;

    oauth::store_auth(&auth_info)?;
    *state.auth.lock().await = Some(auth_info.clone());

    let _ = app.emit(
        "kick-auth-changed",
        KickAuthState {
            authenticated: true,
            username: Some(auth_info.username.clone()),
        },
    );

    Ok(())
}

#[tauri::command]
pub async fn kick_cancel_login(state: State<'_, KickState>) -> Result<(), KickError> {
    let tx = state.oauth_callback_tx.lock().await.take();
    if let Some(tx) = tx {
        let _ = tx.send(Err("Login cancelled by user".to_owned()));
    }
    Ok(())
}

#[tauri::command]
pub async fn kick_handle_callback(
    app: AppHandle,
    state: State<'_, KickState>,
    code: String,
    oauth_state: String,
) -> Result<(), KickError> {
    let tx = state.oauth_callback_tx.lock().await.take();
    if let Some(tx) = tx {
        let _ = tx.send(Ok((code, oauth_state)));
    } else {
        let _ = app.emit("kick-auth-error", "OAuth callback arrived after timeout");
    }
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
            oauth::clear_auth();
            return None;
        }
    }
    None
}

#[tauri::command]
pub async fn kick_send_message(
    app: AppHandle,
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

    match super::api::send_message(&http, &auth, broadcaster_user_id, &message).await {
        Ok(_) => Ok(()),
        Err(e) => {
            if let KickError::OAuth(msg) = &e {
                if msg.contains("Auth error sending message: 401")
                    || msg.contains("Auth error sending message: 403")
                {
                    match super::oauth::refresh_token(&http, &auth.refresh_token).await {
                        Ok(new_auth) => {
                            super::oauth::store_auth(&new_auth)?;
                            *state.auth.lock().await = Some(new_auth.clone());
                            super::api::send_message(
                                &http,
                                &new_auth,
                                broadcaster_user_id,
                                &message,
                            )
                            .await?;
                            return Ok(());
                        }
                        Err(KickError::TokenRefreshFailed) => {
                            *state.auth.lock().await = None;
                            super::oauth::clear_auth();
                            let _ = app.emit(
                                "kick-auth-changed",
                                KickAuthState {
                                    authenticated: false,
                                    username: None,
                                },
                            );
                            return Err(KickError::TokenRefreshFailed);
                        }
                        Err(e) => return Err(e),
                    }
                }
            }
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn kick_set_channels(
    app: AppHandle,
    channels: Vec<(String, u64)>,
) -> Result<(), KickError> {
    let channels_set: HashSet<(String, u64)> = channels.into_iter().collect();
    super::pusher::update_kick_subscriptions(&app, channels_set).await;
    Ok(())
}
