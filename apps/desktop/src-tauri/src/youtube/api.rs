use super::parser::{
    extract_channel_search_results, extract_live_streams_from_initial_data,
    extract_yt_initial_data, extract_yt_initial_player_response, get_text_from_node,
    parse_viewer_count,
};
use super::types::{YouTubeChannelStatus, YouTubeSearchResult, YouTubeSuggestedStream};
use serde_json::Value;
use std::collections::HashSet;
use std::sync::Arc;
use std::sync::OnceLock;
use std::time::Duration;
use tokio::sync::Semaphore;

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

pub fn extract_canonical_video_id(html: &str) -> Option<String> {
    static CANONICAL_RE_1: OnceLock<Option<regex::Regex>> = OnceLock::new();
    let re1 = CANONICAL_RE_1.get_or_init(|| {
        regex::Regex::new(r#"<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["'][^"']*(?:[?&]v=|youtu\.be/)([a-zA-Z0-9_-]{11})"#).ok()
    });
    if let Some(re) = re1.as_ref() {
        if let Some(caps) = re.captures(html) {
            if let Some(m) = caps.get(1) {
                return Some(m.as_str().to_string());
            }
        }
    }

    static CANONICAL_RE_2: OnceLock<Option<regex::Regex>> = OnceLock::new();
    let re2 = CANONICAL_RE_2.get_or_init(|| {
        regex::Regex::new(r#"<link\b[^>]*\bhref=["'][^"']*(?:[?&]v=|youtu\.be/)([a-zA-Z0-9_-]{11})[^"']*["'][^>]*\brel=["']canonical["']"#).ok()
    });
    if let Some(re) = re2.as_ref() {
        if let Some(caps) = re.captures(html) {
            if let Some(m) = caps.get(1) {
                return Some(m.as_str().to_string());
            }
        }
    }

    static OG_URL_RE_1: OnceLock<Option<regex::Regex>> = OnceLock::new();
    let og1 = OG_URL_RE_1.get_or_init(|| {
        regex::Regex::new(r#"<meta\b[^>]*\b(?:property|name)=["'](?:og:video:url|og:url|twitter:player)["'][^>]*\bcontent=["'][^"']*(?:[?&]v=|/(?:embed|v)/|youtu\.be/)([a-zA-Z0-9_-]{11})"#).ok()
    });
    if let Some(re) = og1.as_ref() {
        if let Some(caps) = re.captures(html) {
            if let Some(m) = caps.get(1) {
                return Some(m.as_str().to_string());
            }
        }
    }

    static OG_URL_RE_2: OnceLock<Option<regex::Regex>> = OnceLock::new();
    let og2 = OG_URL_RE_2.get_or_init(|| {
        regex::Regex::new(r#"<meta\b[^>]*\bcontent=["'][^"']*(?:[?&]v=|/(?:embed|v)/|youtu\.be/)([a-zA-Z0-9_-]{11})[^"']*["'][^>]*\b(?:property|name)=["'](?:og:video:url|og:url|twitter:player)["']"#).ok()
    });
    if let Some(re) = og2.as_ref() {
        if let Some(caps) = re.captures(html) {
            if let Some(m) = caps.get(1) {
                return Some(m.as_str().to_string());
            }
        }
    }

    None
}

fn find_video_details(node: &Value) -> Option<&Value> {
    if let Value::Object(map) = node {
        if let Some(vd) = map.get("videoDetails") {
            if vd.is_object() {
                return Some(vd);
            }
        }
        for val in map.values() {
            if let Some(found) = find_video_details(val) {
                return Some(found);
            }
        }
    } else if let Value::Array(arr) = node {
        for item in arr {
            if let Some(found) = find_video_details(item) {
                return Some(found);
            }
        }
    }
    None
}

fn find_channel_avatar(node: &Value) -> Option<String> {
    fn extract_thumbnail(obj: &Value) -> Option<String> {
        let thumbs = obj.get("thumbnails").and_then(|t| t.as_array())?;
        let last = thumbs.last()?;
        let url = last.get("url").and_then(|u| u.as_str())?;
        if url.starts_with("//") {
            Some(format!("https:{}", url))
        } else {
            Some(url.to_string())
        }
    }

    if let Value::Object(map) = node {
        for (key, val) in map {
            if key == "videoOwnerRenderer"
                || key == "c4TabbedHeaderRenderer"
                || key == "channelHeaderRenderer"
                || key == "channelMetadataRenderer"
            {
                if let Some(avatar) = val.get("avatar").or_else(|| val.get("thumbnail")) {
                    if let Some(url) = extract_thumbnail(avatar) {
                        return Some(url);
                    }
                }
            }
        }
        for val in map.values() {
            if let Some(found) = find_channel_avatar(val) {
                return Some(found);
            }
        }
    } else if let Value::Array(arr) = node {
        for item in arr {
            if let Some(found) = find_channel_avatar(item) {
                return Some(found);
            }
        }
    }
    None
}

fn find_viewer_count(node: &Value) -> Option<u64> {
    if let Value::Object(map) = node {
        if let Some(vvcr) = map.get("videoViewCountRenderer") {
            if let Some(ovc) = vvcr.get("originalViewCount").and_then(|v| v.as_str()) {
                let count = parse_viewer_count(ovc);
                if count > 0 {
                    return Some(count);
                }
            }
            if let Some(vc) = vvcr.get("viewCount") {
                if let Some(s) = get_text_from_node(Some(vc)) {
                    let count = parse_viewer_count(&s);
                    if count > 0 {
                        return Some(count);
                    }
                }
            }
            if let Some(svc) = vvcr
                .get("extraShortViewCount")
                .or_else(|| vvcr.get("shortViewCount"))
            {
                if let Some(s) = get_text_from_node(Some(svc)) {
                    let count = parse_viewer_count(&s);
                    if count > 0 {
                        return Some(count);
                    }
                }
            }
        }

        if let Some(vct) = map
            .get("viewCountText")
            .or_else(|| map.get("shortViewCountText"))
        {
            if let Some(s) = get_text_from_node(Some(vct)) {
                let count = parse_viewer_count(&s);
                if count > 0 {
                    return Some(count);
                }
            }
        }

        if let Some(vc) = map.get("viewCount") {
            if let Some(s) = get_text_from_node(Some(vc)) {
                let count = parse_viewer_count(&s);
                if count > 0 {
                    return Some(count);
                }
            }
        }

        if let Some(vd) = map.get("videoDetails") {
            if let Some(vc) = vd.get("viewCount") {
                if let Some(s) = vc.as_str() {
                    let count = parse_viewer_count(s);
                    if count > 0 {
                        return Some(count);
                    }
                } else if let Some(n) = vc.as_u64() {
                    if n > 0 {
                        return Some(n);
                    }
                }
            }
        }

        for val in map.values() {
            if let Some(found) = find_viewer_count(val) {
                return Some(found);
            }
        }
    } else if let Value::Array(arr) = node {
        for item in arr {
            if let Some(found) = find_viewer_count(item) {
                return Some(found);
            }
        }
    }
    None
}

fn extract_viewer_count_from_html(html: &str) -> Option<u64> {
    static OVC_RE: OnceLock<Option<regex::Regex>> = OnceLock::new();
    let ovc_re =
        OVC_RE.get_or_init(|| regex::Regex::new(r#""originalViewCount"\s*:\s*"([0-9]+)""#).ok());
    if let Some(re) = ovc_re.as_ref() {
        if let Some(caps) = re.captures(html) {
            if let Some(m) = caps.get(1) {
                if let Ok(val) = m.as_str().parse::<u64>() {
                    if val > 0 {
                        return Some(val);
                    }
                }
            }
        }
    }

    static VCR_RUNS_RE: OnceLock<Option<regex::Regex>> = OnceLock::new();
    let vcr_runs_re = VCR_RUNS_RE.get_or_init(|| {
        regex::Regex::new(r#""videoViewCountRenderer"\s*:\s*\{"viewCount"\s*:\s*\{"runs"\s*:\s*\[\{"text"\s*:\s*"([^"]+)""#).ok()
    });
    if let Some(re) = vcr_runs_re.as_ref() {
        if let Some(caps) = re.captures(html) {
            if let Some(m) = caps.get(1) {
                let count = parse_viewer_count(m.as_str());
                if count > 0 {
                    return Some(count);
                }
            }
        }
    }

    static WATCHING_RE: OnceLock<Option<regex::Regex>> = OnceLock::new();
    let watching_re = WATCHING_RE.get_or_init(|| {
        regex::Regex::new(r#"([0-9.,]+(?:\s*[kKmM]|\s*mil|\s*milhões|\s*tsd|\s*тыс)?)\s*(?:assistindo|watching|espectadores|zuschauer|visualizações)"#).ok()
    });
    if let Some(re) = watching_re.as_ref() {
        if let Some(caps) = re.captures(html) {
            if let Some(m) = caps.get(1) {
                let count = parse_viewer_count(m.as_str());
                if count > 0 {
                    return Some(count);
                }
            }
        }
    }

    None
}

fn find_channel_info(node: &Value) -> (Option<String>, Option<String>) {
    let mut display_name = None;
    let mut handle = None;

    if let Value::Object(map) = node {
        if let Some(owner) = map.get("videoOwnerRenderer") {
            if let Some(title_node) = owner.get("title") {
                display_name = get_text_from_node(Some(title_node));
            }
            if let Some(nav) = owner.get("navigationEndpoint") {
                if let Some(url) = nav
                    .get("commandMetadata")
                    .and_then(|cm| cm.get("webCommandMetadata"))
                    .and_then(|wcm| wcm.get("url"))
                    .and_then(|u| u.as_str())
                {
                    if url.starts_with("/@") {
                        handle = Some(url.trim_start_matches('/').to_string());
                    }
                }
                if handle.is_none() {
                    if let Some(canonical) = nav
                        .get("browseEndpoint")
                        .and_then(|be| be.get("canonicalBaseUrl"))
                        .and_then(|u| u.as_str())
                    {
                        if canonical.starts_with("/@") {
                            handle = Some(canonical.trim_start_matches('/').to_string());
                        }
                    }
                }
            }
        }

        if let Some(header) = map
            .get("c4TabbedHeaderRenderer")
            .or_else(|| map.get("channelHeaderRenderer"))
        {
            if display_name.is_none() {
                if let Some(title_node) = header.get("title") {
                    display_name = get_text_from_node(Some(title_node));
                }
            }
            if handle.is_none() {
                if let Some(channel_handle_node) = header.get("channelHandleText") {
                    handle = get_text_from_node(Some(channel_handle_node));
                }
            }
        }

        if display_name.is_some() && handle.is_some() {
            return (display_name, handle);
        }

        for val in map.values() {
            let (sub_name, sub_handle) = find_channel_info(val);
            if display_name.is_none() && sub_name.is_some() {
                display_name = sub_name;
            }
            if handle.is_none() && sub_handle.is_some() {
                handle = sub_handle;
            }
            if display_name.is_some() && handle.is_some() {
                return (display_name, handle);
            }
        }
    } else if let Value::Array(arr) = node {
        for item in arr {
            let (sub_name, sub_handle) = find_channel_info(item);
            if display_name.is_none() && sub_name.is_some() {
                display_name = sub_name;
            }
            if handle.is_none() && sub_handle.is_some() {
                handle = sub_handle;
            }
            if display_name.is_some() && handle.is_some() {
                return (display_name, handle);
            }
        }
    }

    (display_name, handle)
}

pub async fn resolve_channel_live_status(
    client: &reqwest::Client,
    channel_or_handle: &str,
) -> Option<YouTubeChannelStatus> {
    let trimmed = channel_or_handle.trim();
    let is_video_id = !trimmed.starts_with('@')
        && trimmed.len() == 11
        && trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');

    let url = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else if is_video_id {
        format!("https://www.youtube.com/watch?v={}", trimmed)
    } else if trimmed.starts_with("channel/") {
        format!("https://www.youtube.com/{}/live", trimmed)
    } else if trimmed.starts_with("UC") && trimmed.len() == 24 {
        format!("https://www.youtube.com/channel/{}/live", trimmed)
    } else {
        let clean = trimmed.trim_start_matches('@');
        format!("https://www.youtube.com/@{}/live", clean)
    };

    let resp = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .header("Accept-Language", "en-US,en;q=0.9")
        .header(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .send()
        .await;

    let res = match resp {
        Ok(r) => {
            if r.status().is_server_error() || r.status() == reqwest::StatusCode::TOO_MANY_REQUESTS
            {
                return None;
            }
            r
        }
        Err(_) => return None,
    };

    let final_url = res.url().clone();
    let mut video_id_from_url: Option<String> = None;
    if final_url.path() == "/watch" {
        for (k, v) in final_url.query_pairs() {
            if k == "v" && v.len() == 11 {
                video_id_from_url = Some(v.to_string());
                break;
            }
        }
    }

    let html = match res.text().await {
        Ok(t) => t,
        Err(_) => return None,
    };

    let canonical_id = extract_canonical_video_id(&html);
    let mut video_id = video_id_from_url.or(canonical_id);

    let mut title: Option<String> = None;
    let mut viewer_count: Option<u64> = None;
    let mut avatar_url: Option<String> = None;
    let mut is_live = false;

    let mut display_name: Option<String> = None;
    let mut handle: Option<String> = None;

    if let Some(json_data) = extract_yt_initial_data(&html) {
        avatar_url = find_channel_avatar(&json_data);
        let (found_name, found_handle) = find_channel_info(&json_data);
        display_name = found_name;
        handle = found_handle;

        if let Some(vd) = find_video_details(&json_data) {
            if video_id.is_none() {
                video_id = vd
                    .get("videoId")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
            }

            if display_name.is_none() {
                display_name = vd
                    .get("author")
                    .and_then(|a| a.as_str())
                    .map(|s| s.to_string());
            }

            title = vd
                .get("title")
                .and_then(|t| t.as_str())
                .map(|s| s.to_string());

            let vd_is_live = vd.get("isLive").and_then(|l| l.as_bool()).unwrap_or(false);
            let vd_is_upcoming = vd
                .get("isUpcoming")
                .and_then(|u| u.as_bool())
                .unwrap_or(false);

            if vd_is_live && !vd_is_upcoming {
                is_live = true;
            }

            if viewer_count.is_none() {
                if let Some(vc) = vd.get("viewCount") {
                    if let Some(s) = vc.as_str() {
                        let count = parse_viewer_count(s);
                        if count > 0 {
                            viewer_count = Some(count);
                        }
                    } else if let Some(n) = vc.as_u64() {
                        if n > 0 {
                            viewer_count = Some(n);
                        }
                    }
                }
            }
        }

        if viewer_count.is_none() {
            viewer_count = find_viewer_count(&json_data);
        }
    }

    if let Some(player_data) = extract_yt_initial_player_response(&html) {
        if viewer_count.is_none() {
            viewer_count = find_viewer_count(&player_data);
        }

        if let Some(microformat) = player_data
            .get("microformat")
            .and_then(|m| m.get("playerMicroformatRenderer"))
        {
            if display_name.is_none() {
                if let Some(owner_name) =
                    microformat.get("ownerChannelName").and_then(|n| n.as_str())
                {
                    display_name = Some(owner_name.to_string());
                }
            }
            if handle.is_none() {
                if let Some(profile_url) =
                    microformat.get("ownerProfileUrl").and_then(|u| u.as_str())
                {
                    if let Some(pos) = profile_url.find("/@") {
                        handle = Some(profile_url[pos + 1..].to_string());
                    }
                }
            }
            if is_live == false {
                let is_live_stream = microformat
                    .get("isLiveStream")
                    .and_then(|l| l.as_bool())
                    .unwrap_or(false);
                if is_live_stream {
                    is_live = true;
                }
            }
        }

        if let Some(vd) = player_data.get("videoDetails") {
            if display_name.is_none() {
                if let Some(author) = vd.get("author").and_then(|a| a.as_str()) {
                    display_name = Some(author.to_string());
                }
            }
            if video_id.is_none() {
                if let Some(vid) = vd.get("videoId").and_then(|v| v.as_str()) {
                    video_id = Some(vid.to_string());
                }
            }
            if title.is_none() {
                if let Some(t) = vd.get("title").and_then(|t| t.as_str()) {
                    title = Some(t.to_string());
                }
            }
            if is_live == false {
                let vd_is_live = vd.get("isLive").and_then(|l| l.as_bool()).unwrap_or(false);
                let vd_is_live_content = vd
                    .get("isLiveContent")
                    .and_then(|l| l.as_bool())
                    .unwrap_or(false);
                if vd_is_live || vd_is_live_content {
                    is_live = true;
                }
            }
        }
    }

    if viewer_count.is_none() {
        viewer_count = extract_viewer_count_from_html(&html);
    }

    if handle.is_none() {
        static LINK_HANDLE_RE: OnceLock<Option<regex::Regex>> = OnceLock::new();
        let link_handle_re = LINK_HANDLE_RE.get_or_init(|| {
            regex::Regex::new(r#"["'](?:https?://(?:www\.)?youtube\.com)?/(@[a-zA-Z0-9_.-]+)["']"#)
                .ok()
        });
        if let Some(re) = link_handle_re.as_ref() {
            if let Some(caps) = re.captures(&html) {
                if let Some(m) = caps.get(1) {
                    handle = Some(m.as_str().to_string());
                }
            }
        }
    }

    if handle.is_none() && channel_or_handle.starts_with('@') {
        handle = Some(channel_or_handle.to_string());
    }

    if let Some(h) = handle.as_mut() {
        if !h.starts_with('@') {
            *h = format!("@{}", h);
        }
    }

    if display_name.is_none() && channel_or_handle.starts_with('@') {
        display_name = Some(channel_or_handle.trim_start_matches('@').to_string());
    }

    if !is_live {
        let redirected_to_watch = url.ends_with("/live") && final_url.path() == "/watch";
        let has_live_badge = html.contains(r#""style":"LIVE""#)
            || html.contains("BADGE_STYLE_TYPE_LIVE_NOW")
            || html.contains(r#""isLive":true"#);

        if (redirected_to_watch || has_live_badge) && video_id.is_some() {
            is_live = true;
        }
    }

    if title.is_none() {
        static OG_TITLE_RE: OnceLock<Option<regex::Regex>> = OnceLock::new();
        let og_title_re = OG_TITLE_RE.get_or_init(|| {
            regex::Regex::new(
                r#"<meta\b[^>]*\bproperty=["']og:title["'][^>]*\bcontent=["']([^"']+)["']"#,
            )
            .ok()
        });
        if let Some(re) = og_title_re.as_ref() {
            if let Some(caps) = re.captures(&html) {
                if let Some(m) = caps.get(1) {
                    title = Some(m.as_str().to_string());
                }
            }
        }
    }

    if avatar_url.is_none() {
        static OG_IMAGE_RE: OnceLock<Option<regex::Regex>> = OnceLock::new();
        let og_image_re = OG_IMAGE_RE.get_or_init(|| {
            regex::Regex::new(
                r#"<meta\b[^>]*\bproperty=["']og:image["'][^>]*\bcontent=["']([^"']+)["']"#,
            )
            .ok()
        });
        if let Some(re) = og_image_re.as_ref() {
            if let Some(caps) = re.captures(&html) {
                if let Some(m) = caps.get(1) {
                    avatar_url = Some(m.as_str().to_string());
                }
            }
        }
    }

    if !is_live {
        video_id = None;
        viewer_count = None;
    }

    Some(YouTubeChannelStatus {
        channel: channel_or_handle.to_string(),
        is_live,
        video_id,
        handle,
        display_name,
        viewer_count,
        title,
        avatar_url,
    })
}

pub async fn check_channels_status_batch(
    client: &reqwest::Client,
    channels: Vec<String>,
) -> Vec<YouTubeChannelStatus> {
    let mut unique_channels = Vec::new();
    let mut seen = HashSet::new();
    for ch in channels {
        let trimmed = ch.trim().to_string();
        if !trimmed.is_empty() && seen.insert(trimmed.clone()) {
            unique_channels.push(trimmed);
        }
    }

    let semaphore = Arc::new(Semaphore::new(3));
    let mut tasks = Vec::with_capacity(unique_channels.len());

    for ch in unique_channels {
        let sem = semaphore.clone();
        let client_clone = client.clone();
        tasks.push(tokio::spawn(async move {
            let permit = match sem.acquire().await {
                Ok(p) => p,
                Err(_) => return None,
            };
            let status = resolve_channel_live_status(&client_clone, &ch).await;
            drop(permit);
            status
        }));
    }

    let mut results = Vec::with_capacity(tasks.len());
    for task in tasks {
        if let Ok(Some(status)) = task.await {
            results.push(status);
        }
    }

    results
}

pub async fn search_youtube_channels(
    client: &reqwest::Client,
    query: &str,
) -> Result<Vec<YouTubeSearchResult>, String> {
    let clean_query = query.trim().trim_start_matches('@');
    if clean_query.is_empty() {
        return Ok(Vec::new());
    }

    let url = format!(
        "https://www.youtube.com/results?search_query={}&sp=EgIQAg%253D%253D",
        urlencoding::encode(clean_query)
    );

    let response = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .header("Accept-Language", "en-US,en;q=0.9,pt-BR,pt;q=0.8")
        .header(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("Network request failed: {}", e))?;

    let html = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    let initial_data = extract_yt_initial_data(&html)
        .ok_or_else(|| "Failed to extract ytInitialData from YouTube search results".to_string())?;

    let results = extract_channel_search_results(&initial_data, 5);
    Ok(results)
}

#[derive(Debug, PartialEq, Eq)]
pub struct YoutubeLocaleMeta {
    pub hl: &'static str,
    pub gl: &'static str,
    pub accept_lang: &'static str,
}

pub fn get_youtube_locale_meta(locale: Option<&str>) -> YoutubeLocaleMeta {
    let loc = locale.unwrap_or("en").to_lowercase();
    let prefix = loc.split(['-', '_']).next().unwrap_or("en");

    match prefix {
        "pt" => YoutubeLocaleMeta {
            hl: "pt-BR",
            gl: "BR",
            accept_lang: "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        "es" => YoutubeLocaleMeta {
            hl: "es",
            gl: "ES",
            accept_lang: "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        "de" => YoutubeLocaleMeta {
            hl: "de",
            gl: "DE",
            accept_lang: "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        "ru" => YoutubeLocaleMeta {
            hl: "ru",
            gl: "RU",
            accept_lang: "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        "fr" => YoutubeLocaleMeta {
            hl: "fr",
            gl: "FR",
            accept_lang: "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        "cn" | "zh" => YoutubeLocaleMeta {
            hl: "zh-CN",
            gl: "TW",
            accept_lang: "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        "tr" => YoutubeLocaleMeta {
            hl: "tr",
            gl: "TR",
            accept_lang: "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        "hi" => YoutubeLocaleMeta {
            hl: "hi",
            gl: "IN",
            accept_lang: "hi-IN,hi;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        "id" => YoutubeLocaleMeta {
            hl: "id",
            gl: "ID",
            accept_lang: "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        _ => YoutubeLocaleMeta {
            hl: "en",
            gl: "US",
            accept_lang: "en-US,en;q=0.9",
        },
    }
}

pub async fn fetch_live_streams(
    locale: Option<&str>,
    limit: usize,
) -> Result<Vec<YouTubeSuggestedStream>, String> {
    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let meta = get_youtube_locale_meta(locale);
    let cookie_val = format!("PREF=hl={}&gl={}&tz=UTC", meta.hl, meta.gl);

    let endpoints = [
        format!("https://www.youtube.com/live?hl={}&gl={}", meta.hl, meta.gl),
        format!(
            "https://www.youtube.com/gaming?hl={}&gl={}",
            meta.hl, meta.gl
        ),
    ];

    let mut all_streams = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    for url in endpoints {
        if all_streams.len() >= limit {
            break;
        }

        let resp = client
            .get(&url)
            .header("User-Agent", USER_AGENT)
            .header("Accept-Language", meta.accept_lang)
            .header("Cookie", &cookie_val)
            .header("X-YouTube-Client-Name", "1")
            .header(
                "Accept",
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            )
            .send()
            .await;

        if let Ok(res) = resp {
            if res.status().is_success() {
                if let Ok(html) = res.text().await {
                    if let Some(json_data) = extract_yt_initial_data(&html) {
                        let streams = extract_live_streams_from_initial_data(&json_data, limit);
                        for stream in streams {
                            if !seen_ids.contains(&stream.channel) {
                                seen_ids.insert(stream.channel.clone());
                                all_streams.push(stream);
                            }
                        }
                    }
                }
            }
        }
    }

    all_streams.truncate(limit);
    Ok(all_streams)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_map_locales_to_correct_hl_and_gl() {
        // Arrange & Act & Assert
        assert_eq!(
            get_youtube_locale_meta(Some("en")),
            YoutubeLocaleMeta {
                hl: "en",
                gl: "US",
                accept_lang: "en-US,en;q=0.9",
            }
        );
        assert_eq!(
            get_youtube_locale_meta(Some("pt")),
            YoutubeLocaleMeta {
                hl: "pt-BR",
                gl: "BR",
                accept_lang: "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        );
        assert_eq!(
            get_youtube_locale_meta(Some("pt-BR")),
            YoutubeLocaleMeta {
                hl: "pt-BR",
                gl: "BR",
                accept_lang: "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        );
        assert_eq!(
            get_youtube_locale_meta(Some("es")),
            YoutubeLocaleMeta {
                hl: "es",
                gl: "ES",
                accept_lang: "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        );
        assert_eq!(
            get_youtube_locale_meta(Some("de")),
            YoutubeLocaleMeta {
                hl: "de",
                gl: "DE",
                accept_lang: "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        );
        assert_eq!(
            get_youtube_locale_meta(Some("fr")),
            YoutubeLocaleMeta {
                hl: "fr",
                gl: "FR",
                accept_lang: "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        );
        assert_eq!(
            get_youtube_locale_meta(Some("ru")),
            YoutubeLocaleMeta {
                hl: "ru",
                gl: "RU",
                accept_lang: "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        );
        assert_eq!(
            get_youtube_locale_meta(Some("tr")),
            YoutubeLocaleMeta {
                hl: "tr",
                gl: "TR",
                accept_lang: "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        );
        assert_eq!(
            get_youtube_locale_meta(Some("hi")),
            YoutubeLocaleMeta {
                hl: "hi",
                gl: "IN",
                accept_lang: "hi-IN,hi;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        );
        assert_eq!(
            get_youtube_locale_meta(Some("id")),
            YoutubeLocaleMeta {
                hl: "id",
                gl: "ID",
                accept_lang: "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        );
        assert_eq!(
            get_youtube_locale_meta(Some("cn")),
            YoutubeLocaleMeta {
                hl: "zh-CN",
                gl: "TW",
                accept_lang: "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        );
        assert_eq!(
            get_youtube_locale_meta(None),
            YoutubeLocaleMeta {
                hl: "en",
                gl: "US",
                accept_lang: "en-US,en;q=0.9",
            }
        );
    }

    #[test]
    fn should_extract_canonical_video_id_from_standard_link() {
        // Arrange
        let html = r#"<html><head><link rel="canonical" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"></head></html>"#;

        // Act
        let video_id = extract_canonical_video_id(html);

        // Assert
        assert_eq!(video_id, Some("dQw4w9WgXcQ".to_string()));
    }

    #[test]
    fn should_extract_canonical_video_id_from_reversed_link() {
        // Arrange
        let html = r#"<html><head><link href="https://www.youtube.com/watch?v=abcdef12345" rel="canonical"></head></html>"#;

        // Act
        let video_id = extract_canonical_video_id(html);

        // Assert
        assert_eq!(video_id, Some("abcdef12345".to_string()));
    }

    #[test]
    fn should_extract_video_id_from_og_video_url() {
        // Arrange
        let html = r#"<html><head><meta property="og:video:url" content="https://www.youtube.com/embed/dQw4w9WgXcQ"></head></html>"#;

        // Act
        let video_id = extract_canonical_video_id(html);

        // Assert
        assert_eq!(video_id, Some("dQw4w9WgXcQ".to_string()));
    }

    #[test]
    fn should_extract_video_id_from_og_url() {
        // Arrange
        let html = r#"<html><head><meta property="og:url" content="https://www.youtube.com/watch?v=abcdef12345"></head></html>"#;

        // Act
        let video_id = extract_canonical_video_id(html);

        // Assert
        assert_eq!(video_id, Some("abcdef12345".to_string()));
    }

    #[test]
    fn should_extract_video_id_from_youtu_be_shortlink() {
        // Arrange
        let html = r#"<html><head><link rel="canonical" href="https://youtu.be/dQw4w9WgXcQ"></head></html>"#;

        // Act
        let video_id = extract_canonical_video_id(html);

        // Assert
        assert_eq!(video_id, Some("dQw4w9WgXcQ".to_string()));
    }

    #[test]
    fn should_return_none_when_no_video_canonical_exists() {
        // Arrange
        let html = r#"<html><head><link rel="canonical" href="https://www.youtube.com/@cazetv"></head><body><div>Hello</div></body></html>"#;

        // Act
        let video_id = extract_canonical_video_id(html);

        // Assert
        assert_eq!(video_id, None);
    }

    #[test]
    fn should_extract_viewer_count_from_json_video_view_count_renderer() {
        // Arrange
        let json = serde_json::json!({
            "contents": {
                "twoColumnWatchNextResults": {
                    "results": {
                        "results": {
                            "contents": [
                                {
                                    "videoPrimaryInfoRenderer": {
                                        "viewCount": {
                                            "videoViewCountRenderer": {
                                                "originalViewCount": "25400",
                                                "isLive": true
                                            }
                                        }
                                    }
                                }
                            ]
                        }
                    }
                }
            }
        });

        // Act
        let count = find_viewer_count(&json);

        // Assert
        assert_eq!(count, Some(25400));
    }

    #[test]
    fn should_extract_viewer_count_from_html_original_view_count() {
        // Arrange
        let html =
            r#"<html><body><script>var yt = {"originalViewCount":"18500"};</script></body></html>"#;

        // Act
        let count = extract_viewer_count_from_html(html);

        // Assert
        assert_eq!(count, Some(18500));
    }

    #[test]
    fn should_extract_viewer_count_from_html_watching_text() {
        // Arrange
        let html = r#"<html><body><div>14.2K assistindo agora</div></body></html>"#;

        // Act
        let count = extract_viewer_count_from_html(html);

        // Assert
        assert_eq!(count, Some(14200));
    }
}
