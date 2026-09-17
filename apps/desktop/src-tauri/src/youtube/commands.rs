use super::api::{
    check_channels_status_batch, fetch_live_streams, get_youtube_client,
    resolve_channel_live_status, search_youtube_channels,
};
use super::types::{YouTubeChannelStatus, YouTubeSearchResult, YouTubeSuggestedStream};

#[tauri::command]
pub async fn youtube_get_suggested_streams(
    locale: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<YouTubeSuggestedStream>, String> {
    fetch_live_streams(locale.as_deref(), limit.unwrap_or(30)).await
}

#[tauri::command]
pub async fn youtube_resolve_live_id(channel_or_handle: String) -> Result<Option<String>, String> {
    let client = get_youtube_client();
    let status = resolve_channel_live_status(client, &channel_or_handle).await;
    if let Some(status) = status {
        if status.is_live && status.video_id.is_some() {
            Ok(status.video_id)
        } else {
            Ok(None)
        }
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn youtube_check_channels_status(
    channels: Vec<String>,
) -> Result<Vec<YouTubeChannelStatus>, String> {
    let client = get_youtube_client();
    Ok(check_channels_status_batch(client, channels).await)
}

#[tauri::command]
pub async fn youtube_search_channels(query: String) -> Result<Vec<YouTubeSearchResult>, String> {
    let client = get_youtube_client();
    search_youtube_channels(client, &query).await
}
