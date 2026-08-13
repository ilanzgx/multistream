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

    map_api_status(resp.status())
}

pub(crate) fn map_api_status(status: reqwest::StatusCode) -> Result<(), KickError> {
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        Err(KickError::OAuth(format!(
            "Auth error sending message: {}",
            status
        )))
    } else if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        Err(KickError::OAuth("Rate limited by Kick API".to_string()))
    } else if !status.is_success() {
        Err(KickError::OAuth(format!(
            "Failed to send message: {}",
            status
        )))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_map_auth_errors() {
        let err401 = map_api_status(reqwest::StatusCode::UNAUTHORIZED).unwrap_err();
        assert!(
            matches!(err401, KickError::OAuth(msg) if msg.contains("Auth error sending message: 401"))
        );

        let err403 = map_api_status(reqwest::StatusCode::FORBIDDEN).unwrap_err();
        assert!(
            matches!(err403, KickError::OAuth(msg) if msg.contains("Auth error sending message: 403"))
        );
    }

    #[test]
    fn should_map_rate_limit() {
        let err429 = map_api_status(reqwest::StatusCode::TOO_MANY_REQUESTS).unwrap_err();
        assert!(
            matches!(err429, KickError::OAuth(msg) if msg.contains("Rate limited by Kick API"))
        );
    }

    #[test]
    fn should_map_generic_error() {
        let err500 = map_api_status(reqwest::StatusCode::INTERNAL_SERVER_ERROR).unwrap_err();
        assert!(
            matches!(err500, KickError::OAuth(msg) if msg.contains("Failed to send message: 500"))
        );
    }

    #[test]
    fn should_allow_success() {
        assert!(map_api_status(reqwest::StatusCode::OK).is_ok());
        assert!(map_api_status(reqwest::StatusCode::CREATED).is_ok());
    }
}
