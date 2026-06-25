use reqwest::Client;
use serde::Serialize;

use super::error::KickError;
use super::state::KickAuthInfo;

#[derive(Debug, Serialize)]
pub struct KickSendChatRequest {
    pub broadcaster_user_id: u64,
    pub content: String,
    #[serde(rename = "type")]
    pub msg_type: String,
}

pub async fn send_message(
    http: &Client,
    auth: &KickAuthInfo,
    broadcaster_user_id: u64,
    content: &str,
) -> Result<(), KickError> {
    let url = "https://api.kick.com/public/v1/chat";
    let payload = KickSendChatRequest {
        broadcaster_user_id,
        content: content.to_string(),
        msg_type: "user".to_string(),
    };

    let resp = http
        .post(url)
        .bearer_auth(&auth.access_token)
        .json(&payload)
        .send()
        .await
        .map_err(KickError::Http)?;

    if resp.status() == 401 || resp.status() == 403 {
        return Err(KickError::OAuth(format!(
            "Auth error sending message: {}",
            resp.status()
        )));
    } else if resp.status() == 429 {
        return Err(KickError::OAuth("Rate limited by Kick API".to_string()));
    } else if !resp.status().is_success() {
        return Err(KickError::OAuth(format!(
            "Failed to send message: {}",
            resp.status()
        )));
    }

    Ok(())
}
