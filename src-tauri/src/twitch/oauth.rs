use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::error::TwitchError;
use super::state::TwitchAuthInfo;

pub fn client_id() -> &'static str {
    option_env!("TWITCH_CLIENT_ID").unwrap_or("")
}
const SCOPES: &str = "chat:read chat:edit user:read:follows";
const DEVICE_URL: &str = "https://id.twitch.tv/oauth2/device";
const TOKEN_URL: &str = "https://id.twitch.tv/oauth2/token";
const VALIDATE_URL: &str = "https://id.twitch.tv/oauth2/validate";
const STRONGHOLD_KEY: &str = "twitch_auth";

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct DeviceFlowResponse {
    pub device_code: String,
    pub expires_in: u64,
    pub interval: u64,
    pub user_code: String,
    pub verification_uri: String,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ValidateResponse {
    login: String,
    user_id: String,
}

pub async fn start_device_flow(http: &reqwest::Client) -> Result<DeviceFlowResponse, TwitchError> {
    if client_id().is_empty() {
        return Err(TwitchError::OAuth(
            "TWITCH_CLIENT_ID is missing at compile time.".to_owned(),
        ));
    }

    let form_data = [("client_id", client_id()), ("scopes", SCOPES)];

    let response = http
        .post(DEVICE_URL)
        .form(&form_data)
        .send()
        .await
        .map_err(TwitchError::Http)?;

    if !response.status().is_success() {
        let err_text = response.text().await.unwrap_or_default();
        return Err(TwitchError::OAuth(format!(
            "Device flow start failed: {}",
            err_text
        )));
    }

    let device_flow: DeviceFlowResponse = response
        .json()
        .await
        .map_err(|e| TwitchError::OAuth(e.to_string()))?;

    Ok(device_flow)
}

pub async fn poll_device_token(
    http: &reqwest::Client,
    device_code: &str,
) -> Result<Option<TwitchAuthInfo>, TwitchError> {
    let form_data = [
        ("client_id", client_id()),
        ("scopes", SCOPES),
        ("device_code", device_code),
        ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
    ];

    let response = http
        .post(TOKEN_URL)
        .form(&form_data)
        .send()
        .await
        .map_err(TwitchError::Http)?;

    if response.status() == 400 {
        let body = response.text().await.unwrap_or_default();
        let body_lower = body.to_lowercase();
        if body_lower.contains("authorization_pending")
            || body_lower.contains("authorization pending")
        {
            return Ok(None);
        }
        return Err(TwitchError::OAuth(format!("Polling failed: {}", body)));
    }

    if !response.status().is_success() {
        let err_text = response.text().await.unwrap_or_default();
        return Err(TwitchError::OAuth(format!("Polling failed: {}", err_text)));
    }

    let response: TokenResponse = response
        .json()
        .await
        .map_err(|e| TwitchError::OAuth(e.to_string()))?;

    let validate: ValidateResponse = http
        .get(VALIDATE_URL)
        .bearer_auth(&response.access_token)
        .send()
        .await?
        .error_for_status()
        .map_err(TwitchError::Http)?
        .json()
        .await?;

    Ok(Some(TwitchAuthInfo {
        access_token: response.access_token,
        refresh_token: response.refresh_token.unwrap_or_default(),
        username: validate.login,
        user_id: validate.user_id,
    }))
}

pub async fn refresh_token(
    http: &reqwest::Client,
    refresh_token_str: &str,
) -> Result<TwitchAuthInfo, TwitchError> {
    if client_id().is_empty() {
        return Err(TwitchError::OAuth(
            "TWITCH_CLIENT_ID is missing at compile time.".to_owned(),
        ));
    }

    let response = http
        .post(TOKEN_URL)
        .form(&[
            ("client_id", client_id()),
            ("refresh_token", refresh_token_str),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await?;

    let status = response.status();
    if status.is_client_error() {
        return Err(TwitchError::TokenRefreshFailed);
    }

    let response: TokenResponse = response
        .error_for_status()
        .map_err(TwitchError::Http)?
        .json()
        .await?;

    let validate: ValidateResponse = http
        .get(VALIDATE_URL)
        .bearer_auth(&response.access_token)
        .send()
        .await?
        .error_for_status()
        .map_err(TwitchError::Http)?
        .json()
        .await?;

    Ok(TwitchAuthInfo {
        access_token: response.access_token,
        refresh_token: response
            .refresh_token
            .unwrap_or_else(|| refresh_token_str.to_string()),
        username: validate.login,
        user_id: validate.user_id,
    })
}

pub fn store_auth(_app: &AppHandle, auth: &TwitchAuthInfo) -> Result<(), TwitchError> {
    let json = serde_json::to_string(auth).map_err(|e| TwitchError::Storage(e.to_string()))?;

    std::fs::write(auth_file_path(), json.as_bytes())
        .map_err(|e| TwitchError::Storage(e.to_string()))
}

pub fn load_auth(_app: &AppHandle) -> Option<TwitchAuthInfo> {
    let path = auth_file_path();
    let bytes = std::fs::read(&path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

pub fn clear_auth(_app: &AppHandle) {
    let _ = std::fs::remove_file(auth_file_path());
}

fn auth_file_path() -> std::path::PathBuf {
    let mut path = dirs::config_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    path.push("multistream");
    let _ = std::fs::create_dir_all(&path);
    path.push(STRONGHOLD_KEY);
    path.with_extension("json")
}
