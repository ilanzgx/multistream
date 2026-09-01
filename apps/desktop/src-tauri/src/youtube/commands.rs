use super::api::fetch_live_streams;
use super::types::YouTubeSuggestedStream;

#[tauri::command]
pub async fn youtube_get_suggested_streams(
    locale: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<YouTubeSuggestedStream>, String> {
    fetch_live_streams(locale.as_deref(), limit.unwrap_or(30)).await
}
