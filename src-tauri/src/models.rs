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
