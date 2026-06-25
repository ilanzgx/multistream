use tauri::{AppHandle, Emitter, State};

use super::error::KickError;
use super::oauth;
use super::state::{KickAuthState, KickState};

#[tauri::command]
pub async fn kick_login(app: AppHandle, state: State<'_, KickState>) -> Result<(), KickError> {
    let http = reqwest::Client::builder()
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
    oauth::load_auth()
}
