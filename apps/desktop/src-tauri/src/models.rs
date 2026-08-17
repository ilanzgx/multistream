use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FollowedChannel {
    pub id: String,
    pub platform: String,
    pub display_name: String,
    pub avatar_url: String,
    pub is_live: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub viewer_count: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_serialize_followed_channel_correctly() {
        let channel = FollowedChannel {
            id: "123".to_string(),
            platform: "twitch".to_string(),
            display_name: "Gaules".to_string(),
            avatar_url: "https://avatar.url".to_string(),
            is_live: true,
            viewer_count: Some(15000),
            game: Some("CS2".to_string()),
            thumbnail_url: None,
            title: Some("Tribo".to_string()),
        };

        let json = serde_json::to_string(&channel).unwrap();

        assert!(json.contains(r#""id":"123""#));
        assert!(json.contains(r#""platform":"twitch""#));
        assert!(json.contains(r#""displayName":"Gaules""#)); // camelCase test
        assert!(json.contains(r#""viewerCount":15000"#));
        assert!(!json.contains(r#""thumbnailUrl""#)); // verify skip_serializing_if
    }

    #[test]
    fn should_deserialize_followed_channel_correctly() {
        let raw_json = r#"{
            "id": "123",
            "platform": "kick",
            "displayName": "xQc",
            "avatarUrl": "https://avatar",
            "isLive": false
        }"#;

        let channel: FollowedChannel = serde_json::from_str(raw_json).unwrap();

        assert_eq!(channel.id, "123");
        assert_eq!(channel.platform, "kick");
        assert_eq!(channel.display_name, "xQc");
        assert!(!channel.is_live);
        assert!(channel.viewer_count.is_none());
    }
}
