use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngCore;
use reqwest::Client;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

use super::error::KickError;
use super::state::KickAuthInfo;

const STRONGHOLD_KEY: &str = "kick_auth";

const REDIRECT_URI_EN: &str = "https://usemultistream.vercel.app/en/";
const REDIRECT_URI_PT: &str = "https://usemultistream.vercel.app/pt-br/";

pub fn redirect_uri_for_locale(locale: &str) -> &'static str {
    if locale == "pt" || locale == "pt-br" {
        REDIRECT_URI_PT
    } else {
        REDIRECT_URI_EN
    }
}

pub fn store_auth(auth: &KickAuthInfo) -> Result<(), KickError> {
    let json = serde_json::to_string(auth).map_err(|e| KickError::Storage(e.to_string()))?;

    std::fs::write(auth_file_path(), json.as_bytes()).map_err(|e| KickError::Storage(e.to_string()))
}

pub fn load_auth() -> Option<KickAuthInfo> {
    let path = auth_file_path();
    let bytes = std::fs::read(&path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

pub fn clear_auth() {
    let _ = std::fs::remove_file(auth_file_path());
}

fn auth_file_path() -> std::path::PathBuf {
    let mut path = dirs::config_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    path.push("multistream");
    let _ = std::fs::create_dir_all(&path);
    path.push(STRONGHOLD_KEY);
    path.with_extension("json")
}

pub fn generate_pkce() -> (String, String) {
    let mut verifier_bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut verifier_bytes);
    let verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);

    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let challenge_bytes = hasher.finalize();
    let challenge = URL_SAFE_NO_PAD.encode(challenge_bytes);

    (verifier, challenge)
}

#[derive(Debug, Deserialize)]
pub struct KickTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct KickUserResponse {
    pub data: Vec<KickUserData>,
}

#[derive(Debug, Deserialize)]
pub struct KickUserData {
    pub name: String,
}

pub async fn start_pkce_flow(
    app: &AppHandle,
    http: &Client,
    locale: &str,
    callback_rx: tokio::sync::oneshot::Receiver<Result<(String, String), String>>,
) -> Result<KickAuthInfo, KickError> {
    let client_id = option_env!("KICK_CLIENT_ID").unwrap_or("");
    let client_secret = option_env!("KICK_CLIENT_SECRET").unwrap_or("");

    if client_id.is_empty() || client_secret.is_empty() {
        return Err(KickError::OAuth(
            "KICK_CLIENT_ID or KICK_CLIENT_SECRET is missing at compile time.".to_owned(),
        ));
    }

    let (verifier, challenge) = generate_pkce();

    let mut state_bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut state_bytes);
    let state = URL_SAFE_NO_PAD.encode(state_bytes);

    let redirect_uri = redirect_uri_for_locale(locale);

    let auth_url = format!(
        "https://id.kick.com/oauth/authorize?response_type=code&client_id={}&redirect_uri={}&scope=user:read+chat:write&code_challenge={}&code_challenge_method=S256&state={}",
        client_id, redirect_uri, challenge, state
    );

    let _ = app.emit("kick-auth-url", &auth_url);

    let callback_result = tokio::time::timeout(std::time::Duration::from_secs(300), callback_rx)
        .await
        .map_err(|_| KickError::OAuth("Authentication timeout (5 minutes).".to_string()))?
        .map_err(|_| KickError::OAuth("Login cancelled by user".to_owned()))?;

    let (code, returned_state) = callback_result.map_err(KickError::OAuth)?;

    if returned_state != state {
        return Err(KickError::OAuth(
            "Invalid state parameter (CSRF protection failed)".to_owned(),
        ));
    }

    let token_resp = http
        .post("https://id.kick.com/oauth/token")
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("redirect_uri", redirect_uri),
            ("code", &code),
            ("code_verifier", &verifier),
        ])
        .send()
        .await?
        .error_for_status()?;

    let tokens: KickTokenResponse = token_resp.json().await?;

    let user_resp = http
        .get("https://api.kick.com/public/v1/users")
        .bearer_auth(&tokens.access_token)
        .send()
        .await?
        .error_for_status()?;

    let user_info: KickUserResponse = user_resp.json().await?;
    let username = user_info
        .data
        .first()
        .map(|u| u.name.clone())
        .unwrap_or_else(|| "Unknown".to_owned());

    Ok(KickAuthInfo {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token.unwrap_or_default(),
        username,
        has_chat_write: true,
    })
}

pub async fn refresh_token(
    http: &Client,
    refresh_token_str: &str,
) -> Result<KickAuthInfo, KickError> {
    let client_id = option_env!("KICK_CLIENT_ID").unwrap_or("");
    let client_secret = option_env!("KICK_CLIENT_SECRET").unwrap_or("");

    let token_resp = http
        .post("https://id.kick.com/oauth/token")
        .form(&[
            ("grant_type", "refresh_token"),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("refresh_token", refresh_token_str),
        ])
        .send()
        .await?;

    let status = token_resp.status();
    if status.is_client_error() {
        return Err(KickError::TokenRefreshFailed);
    }

    let tokens: KickTokenResponse = token_resp
        .error_for_status()
        .map_err(KickError::Http)?
        .json()
        .await?;

    let user_resp = http
        .get("https://api.kick.com/public/v1/users")
        .bearer_auth(&tokens.access_token)
        .send()
        .await?;

    let user_status = user_resp.status();
    if user_status.is_client_error() {
        return Err(KickError::TokenRefreshFailed);
    }

    let user_info: KickUserResponse = user_resp
        .error_for_status()
        .map_err(KickError::Http)?
        .json()
        .await?;
    let username = user_info
        .data
        .first()
        .map(|u| u.name.clone())
        .unwrap_or_else(|| "Unknown".to_owned());

    Ok(KickAuthInfo {
        access_token: tokens.access_token,
        refresh_token: tokens
            .refresh_token
            .unwrap_or_else(|| refresh_token_str.to_string()),
        username,
        has_chat_write: true,
    })
}
