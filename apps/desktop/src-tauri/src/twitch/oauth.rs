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
        if should_continue_polling(&body) {
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
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::BAD_REQUEST {
        return Err(TwitchError::TokenRefreshFailed);
    } else if !status.is_success() {
        return Err(TwitchError::OAuth(format!(
            "Refresh failed with status: {}",
            status
        )));
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
    let target_path = auth_file_path()?;
    let tmp_path = target_path.with_extension("tmp");

    std::fs::write(&tmp_path, json.as_bytes())
        .map_err(|e| TwitchError::Storage(format!("Failed to write tmp auth file: {}", e)))?;

    std::fs::rename(&tmp_path, &target_path)
        .map_err(|e| TwitchError::Storage(format!("Failed to finalize auth storage: {}", e)))
}

pub fn load_auth(_app: &AppHandle) -> Option<TwitchAuthInfo> {
    let path = auth_file_path().ok()?;
    let bytes = std::fs::read(&path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

pub fn clear_auth(_app: &AppHandle) {
    if let Ok(path) = auth_file_path() {
        let _ = std::fs::remove_file(path);
    }
}

fn auth_file_path() -> Result<std::path::PathBuf, TwitchError> {
    let mut path = dirs::config_dir().ok_or_else(|| {
        TwitchError::Storage("Could not determine user config directory".to_owned())
    })?;
    path.push("multistream");
    std::fs::create_dir_all(&path)
        .map_err(|e| TwitchError::Storage(format!("Failed to create config directory: {}", e)))?;
    #[cfg(debug_assertions)]
    path.push(format!("{}_dev", STRONGHOLD_KEY));
    #[cfg(not(debug_assertions))]
    path.push(STRONGHOLD_KEY);
    Ok(path.with_extension("json"))
}

pub(crate) fn should_continue_polling(body: &str) -> bool {
    let body_lower = body.to_lowercase();
    body_lower.contains("authorization_pending")
        || body_lower.contains("authorization pending")
        || body_lower.contains("slow_down")
        || body_lower.contains("slow down")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_detect_authorization_pending_variants() {
        // Standard Twitch API format
        let standard = r#"{"status":400,"message":"authorization_pending"}"#;
        assert!(should_continue_polling(standard));

        // Sometimes Twitch returns it with space instead of underscore
        let with_space = r#"{"status":400,"message":"authorization pending"}"#;
        assert!(should_continue_polling(with_space));

        // Case insensitivity check
        let uppercase = r#"{"message":"AUTHORIZATION_PENDING"}"#;
        assert!(should_continue_polling(uppercase));

        let slow_down = r#"{"status":400,"message":"slow_down"}"#;
        assert!(should_continue_polling(slow_down));

        // Unrelated error
        let unrelated = r#"{"status":400,"message":"invalid_client"}"#;
        assert!(!should_continue_polling(unrelated));

        // Empty body
        let empty = "";
        assert!(!should_continue_polling(empty));
    }

    #[test]
    fn should_detect_authorization_pending_edge_cases() {
        // Arrange + Act + Assert
        // Nested in error object
        let nested = r#"{"error":"authorization_pending","message":"authorization pending"}"#;
        assert!(should_continue_polling(nested));

        // With additional fields
        let with_fields = r#"{"status":400,"message":"authorization_pending","interval":5}"#;
        assert!(should_continue_polling(with_fields));

        // Slow down variant
        let slow_down_space = r#"{"message":"slow down"}"#;
        assert!(should_continue_polling(slow_down_space));

        // Mixed case slow_down
        let slow_down_mixed = r#"{"message":"Slow_Down"}"#;
        assert!(should_continue_polling(slow_down_mixed));

        // Invalid JSON should not panic
        let invalid_json = "{not valid json}";
        assert!(!should_continue_polling(invalid_json));

        // Null body
        let null_body = "null";
        assert!(!should_continue_polling(null_body));

        // Expired token error (should NOT continue polling)
        let expired = r#"{"status":400,"message":"expired_token"}"#;
        assert!(!should_continue_polling(expired));

        // Access denied error (should NOT continue polling)
        let denied = r#"{"status":400,"message":"access_denied"}"#;
        assert!(!should_continue_polling(denied));
    }

    #[test]
    fn device_flow_response_deserializes_correctly() {
        // Arrange
        let json = r#"{
            "device_code": "test-device-code",
            "expires_in": 600,
            "interval": 5,
            "user_code": "ABCD-EFGH",
            "verification_uri": "https://id.twitch.tv/activate"
        }"#;

        // Act
        let response: DeviceFlowResponse = serde_json::from_str(json).unwrap();

        // Assert
        assert_eq!(response.device_code, "test-device-code");
        assert_eq!(response.expires_in, 600);
        assert_eq!(response.interval, 5);
        assert_eq!(response.user_code, "ABCD-EFGH");
        assert_eq!(response.verification_uri, "https://id.twitch.tv/activate");
    }

    #[test]
    fn token_response_deserializes_with_optional_refresh_token() {
        // Arrange - with refresh_token
        let json_with_refresh = r#"{
            "access_token": "access-123",
            "refresh_token": "refresh-456"
        }"#;

        // Act
        let response: TokenResponse = serde_json::from_str(json_with_refresh).unwrap();

        // Assert
        assert_eq!(response.access_token, "access-123");
        assert_eq!(response.refresh_token, Some("refresh-456".to_string()));

        // Arrange - without refresh_token
        let json_without_refresh = r#"{"access_token": "access-123"}"#;

        // Act
        let response: TokenResponse = serde_json::from_str(json_without_refresh).unwrap();

        // Assert
        assert_eq!(response.access_token, "access-123");
        assert_eq!(response.refresh_token, None);
    }

    #[test]
    fn validate_response_deserializes_correctly() {
        // Arrange
        let json = r#"{"login": "testuser", "user_id": "12345"}"#;

        // Act
        let response: ValidateResponse = serde_json::from_str(json).unwrap();

        // Assert
        assert_eq!(response.login, "testuser");
        assert_eq!(response.user_id, "12345");
    }

    #[test]
    fn twitch_auth_info_serialization_roundtrip() {
        // Arrange
        let auth = TwitchAuthInfo {
            access_token: "access-token".to_string(),
            refresh_token: "refresh-token".to_string(),
            username: "testuser".to_string(),
            user_id: "12345".to_string(),
        };

        // Act
        let json = serde_json::to_string(&auth).unwrap();
        let deserialized: TwitchAuthInfo = serde_json::from_str(&json).unwrap();

        // Assert
        assert_eq!(deserialized.access_token, auth.access_token);
        assert_eq!(deserialized.refresh_token, auth.refresh_token);
        assert_eq!(deserialized.username, auth.username);
        assert_eq!(deserialized.user_id, auth.user_id);
    }

    #[test]
    fn auth_file_path_contains_correct_components() {
        // Act
        let path = auth_file_path().unwrap();

        // Assert
        let path_str = path.to_string_lossy();
        assert!(path_str.contains("multistream"));
        assert!(path_str.contains("twitch_auth"));
        assert!(path_str.ends_with(".json"));

        // Debug builds should have _dev suffix
        #[cfg(debug_assertions)]
        assert!(path_str.contains("twitch_auth_dev"));

        #[cfg(not(debug_assertions))]
        assert!(!path_str.contains("twitch_auth_dev"));
    }
}
