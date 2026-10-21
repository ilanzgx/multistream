use reqwest::Client;
use serde::{Deserialize, Serialize};

use super::error::KickError;
use super::state::{KickAuthInfo, KickPusherConfig};

const REALTIME_CONNECTION_URL: &str = "https://web.kick.com/api/v1/realtime/connection";
const KICK_CLIENT_ID: &str = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

#[derive(Debug, Serialize)]
pub struct KickSendChatRequest {
    pub broadcaster_user_id: u64,
    pub content: String,
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to_message_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct KickRealtimeResponse {
    data: Option<KickRealtimeData>,
}

#[derive(Debug, Deserialize)]
struct KickRealtimeData {
    #[serde(default)]
    connections: Vec<KickRealtimeConnection>,
}

#[derive(Debug, Deserialize)]
struct KickRealtimeConnection {
    provider: String,
    credentials: serde_json::Value,
}

pub async fn send_message(
    http: &Client,
    auth: &KickAuthInfo,
    broadcaster_user_id: u64,
    content: &str,
    reply_to_message_id: Option<String>,
) -> Result<(), KickError> {
    let url = "https://api.kick.com/public/v1/chat";
    let payload = KickSendChatRequest {
        broadcaster_user_id,
        content: content.to_string(),
        msg_type: "user".to_string(),
        reply_to_message_id,
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

pub async fn fetch_realtime_pusher_config(http: &Client) -> Result<KickPusherConfig, KickError> {
    let payload = serde_json::json!({
        "client": {
            "id": KICK_CLIENT_ID,
            "type": "web"
        },
        "capabilities": {
            "accepted_providers": [
                { "provider": "pusher" }
            ]
        }
    });

    let resp = http
        .post(REALTIME_CONNECTION_URL)
        .json(&payload)
        .send()
        .await
        .map_err(KickError::Http)?;

    if !resp.status().is_success() {
        return Err(KickError::WebSocket(format!(
            "Realtime connection API returned status {}",
            resp.status()
        )));
    }

    let body = resp.text().await.map_err(KickError::Http)?;
    parse_realtime_pusher_response(&body)
}

pub(crate) fn parse_realtime_pusher_response(body: &str) -> Result<KickPusherConfig, KickError> {
    let parsed: KickRealtimeResponse = serde_json::from_str(body)
        .map_err(|e| KickError::WebSocket(format!("Invalid realtime JSON: {}", e)))?;

    let connections = parsed
        .data
        .ok_or_else(|| KickError::WebSocket("Missing data in realtime response".to_string()))?
        .connections;

    let pusher_conn = connections
        .into_iter()
        .find(|c| c.provider == "pusher")
        .ok_or_else(|| {
            KickError::WebSocket("No pusher provider found in realtime response".to_string())
        })?;

    let config: KickPusherConfig = serde_json::from_value(pusher_conn.credentials)
        .map_err(|e| KickError::WebSocket(format!("Invalid pusher credentials: {}", e)))?;

    if !config.is_valid() {
        return Err(KickError::WebSocket(
            "Received malformed Pusher app_key or cluster".to_string(),
        ));
    }

    Ok(config)
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
    fn should_serialize_send_chat_request_with_and_without_reply() {
        let req_without_reply = KickSendChatRequest {
            broadcaster_user_id: 12345,
            content: "Hello Kick".to_string(),
            msg_type: "user".to_string(),
            reply_to_message_id: None,
        };
        let json_without = serde_json::to_string(&req_without_reply).unwrap();
        assert!(json_without.contains(r#""broadcaster_user_id":12345"#));
        assert!(json_without.contains(r#""content":"Hello Kick""#));
        assert!(json_without.contains(r#""type":"user""#));
        assert!(!json_without.contains("reply_to_message_id"));

        let req_with_reply = KickSendChatRequest {
            broadcaster_user_id: 12345,
            content: "Reply to Kick".to_string(),
            msg_type: "user".to_string(),
            reply_to_message_id: Some("828f83bb-e391-4c78-9e91-af35a172840e".to_string()),
        };
        let json_with = serde_json::to_string(&req_with_reply).unwrap();
        assert!(
            json_with.contains(r#""reply_to_message_id":"828f83bb-e391-4c78-9e91-af35a172840e""#)
        );
    }

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

    #[test]
    fn should_parse_valid_realtime_pusher_response() {
        // Arrange
        let raw_json = r#"{
            "data": {
                "connections": [
                    {
                        "credentials": {
                            "app_key": "34bf7a0ff419a2a775b9",
                            "cluster": "us2"
                        },
                        "provider": "pusher"
                    }
                ],
                "mode": "websocket"
            },
            "message": "success"
        }"#;

        // Act
        let result = parse_realtime_pusher_response(raw_json);

        // Assert
        let config = result.expect("Should parse valid pusher response");
        assert_eq!(config.app_key, "34bf7a0ff419a2a775b9");
        assert_eq!(config.cluster, "us2");
    }

    #[test]
    fn should_reject_invalid_or_malformed_realtime_response() {
        // Arrange
        let missing_pusher = r#"{
            "data": {
                "connections": [
                    {
                        "credentials": {
                            "url": "wss://realtime.us-east-1.platform.kick.com/connection/websocket"
                        },
                        "provider": "centrifugo"
                    }
                ]
            }
        }"#;
        let malicious_key = r#"{
            "data": {
                "connections": [
                    {
                        "credentials": {
                            "app_key": "bad/key?param=1",
                            "cluster": "us2"
                        },
                        "provider": "pusher"
                    }
                ]
            }
        }"#;

        // Act
        let res_missing = parse_realtime_pusher_response(missing_pusher);
        let res_malicious = parse_realtime_pusher_response(malicious_key);

        // Assert
        assert!(res_missing.is_err());
        assert!(res_malicious.is_err());
    }
}
