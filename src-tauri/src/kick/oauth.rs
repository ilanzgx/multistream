use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngCore;
use reqwest::Client;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use super::error::KickError;
use super::state::KickAuthInfo;

const STRONGHOLD_KEY: &str = "kick_auth";
const REDIRECT_URI: &str = "http://localhost:14832/callback";

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
    pub refresh_token: String,
}

#[derive(Debug, Deserialize)]
pub struct KickUserResponse {
    pub data: Vec<KickUserData>,
}

#[derive(Debug, Deserialize)]
pub struct KickUserData {
    pub name: String,
}

pub async fn start_pkce_flow(app: &AppHandle, http: &Client) -> Result<KickAuthInfo, KickError> {
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

    let auth_url = format!(
        "https://id.kick.com/oauth/authorize?response_type=code&client_id={}&redirect_uri={}&scope=user:read+chat:write&code_challenge={}&code_challenge_method=S256&state={}",
        client_id, REDIRECT_URI, challenge, state
    );

    let listener_result = tokio::net::TcpListener::bind("127.0.0.1:14832").await;
    let listener = match listener_result {
        Ok(l) => l,
        Err(e) => {
            if e.kind() == std::io::ErrorKind::AddrInUse {
                return Err(KickError::OAuth("An authentication is already in progress. Check your browser or wait a minute and try again.".to_owned()));
            }
            return Err(KickError::OAuth(e.to_string()));
        }
    };

    let _ = app.emit("kick-auth-url", &auth_url);

    // Wait up to 2 minutes for a connection
    let accept_result =
        tokio::time::timeout(std::time::Duration::from_secs(120), listener.accept()).await;

    let (mut stream, _) = match accept_result {
        Ok(Ok(res)) => res,
        Ok(Err(e)) => return Err(KickError::OAuth(e.to_string())),
        Err(_) => {
            return Err(KickError::OAuth(
                "Authentication timeout (2 minutes).".to_string(),
            ))
        }
    };

    let mut buffer = [0; 2048];
    let bytes_read = stream
        .read(&mut buffer)
        .await
        .map_err(|e| KickError::OAuth(e.to_string()))?;

    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    if request.contains("GET /cancel") {
        return Err(KickError::OAuth("Login cancelled by user".to_owned()));
    }
    let first_line = request.lines().next().unwrap_or("");
    let mut parts = first_line.split_whitespace();
    parts.next(); // GET
    let path = parts.next().unwrap_or("");

    let mut code_param = None;
    let mut state_param = None;
    let code = if let Some(query) = path.split('?').nth(1) {
        for pair in query.split('&') {
            if let Some((k, v)) = pair.split_once('=') {
                if k == "code" {
                    code_param = urlencoding::decode(v).map(|s| s.into_owned()).ok();
                } else if k == "state" {
                    state_param = urlencoding::decode(v).map(|s| s.into_owned()).ok();
                }
            }
        }
        code_param
    } else {
        None
    };

    if state_param.as_deref() != Some(state.as_str()) {
        let response = "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html\r\n\r\n<html><body><h1>Invalid state parameter (CSRF protection failed)</h1></body></html>";
        let _ = stream.write_all(response.as_bytes()).await;
        return Err(KickError::OAuth(
            "Invalid state parameter (CSRF protection failed)".to_owned(),
        ));
    }

    let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><head><title>Success</title></head><body style=\"background:#14161a;color:white;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;\"><h1>Authentication successful! You can close this window.</h1><script>window.close()</script></body></html>";
    let _ = stream.write_all(response.as_bytes()).await;

    let code = code.ok_or_else(|| KickError::OAuth("Authorization code not found".to_owned()))?;

    let token_resp = http
        .post("https://id.kick.com/oauth/token")
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("redirect_uri", REDIRECT_URI),
            ("code", &code),
            ("code_verifier", &verifier),
        ])
        .send()
        .await?
        .error_for_status()?;

    let tokens: KickTokenResponse = token_resp.json().await?;

    // Get user info
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
        refresh_token: tokens.refresh_token,
        username,
        has_chat_write: true,
    })
}

pub async fn refresh_token(http: &Client, refresh_token: &str) -> Result<KickAuthInfo, KickError> {
    let client_id = option_env!("KICK_CLIENT_ID").unwrap_or("");
    let client_secret = option_env!("KICK_CLIENT_SECRET").unwrap_or("");

    let token_resp = http
        .post("https://id.kick.com/oauth/token")
        .form(&[
            ("grant_type", "refresh_token"),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("refresh_token", refresh_token),
        ])
        .send()
        .await?;

    if !token_resp.status().is_success() {
        return Err(KickError::TokenRefreshFailed);
    }

    let tokens: KickTokenResponse = token_resp.json().await?;

    let user_resp = http
        .get("https://api.kick.com/public/v1/users")
        .bearer_auth(&tokens.access_token)
        .send()
        .await?;

    if !user_resp.status().is_success() {
        return Err(KickError::TokenRefreshFailed);
    }

    let user_info: KickUserResponse = user_resp.json().await?;
    let username = user_info
        .data
        .first()
        .map(|u| u.name.clone())
        .unwrap_or_else(|| "Unknown".to_owned());

    Ok(KickAuthInfo {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        username,
        has_chat_write: true,
    })
}
