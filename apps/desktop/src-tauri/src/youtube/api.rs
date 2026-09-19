use super::parser::{
    extract_channel_search_results, extract_live_streams_from_initial_data,
    extract_yt_initial_data, extract_yt_initial_player_response, get_text_from_node,
    parse_viewer_count,
};
use super::types::{
    YouTubeChannelStatus, YouTubeLiveStreamInfo, YouTubeSearchResult, YouTubeSuggestedStream,
};
use serde_json::Value;
use std::collections::HashSet;
use std::sync::Arc;
use std::sync::OnceLock;
use std::time::Duration;
use tokio::sync::Semaphore;

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

pub fn get_youtube_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .use_rustls_tls()
            .timeout(Duration::from_secs(10))
            .pool_idle_timeout(Duration::from_secs(90))
            .tcp_keepalive(Duration::from_secs(30))
            .build()
            .expect("Failed to build YouTube HTTP client with rustls-tls")
    })
}

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

fn extract_channel_avatar_from_html(html: &str) -> Option<String> {
    static OWNER_THUMB_RE: OnceLock<Option<regex::Regex>> = OnceLock::new();
    let owner_thumb_re = OWNER_THUMB_RE.get_or_init(|| {
        regex::Regex::new(
            r#""videoOwnerRenderer"\s*:\s*\{.*?"thumbnails"\s*:\s*\[\{"url"\s*:\s*"([^"]+)""#,
        )
        .ok()
    });
    if let Some(re) = owner_thumb_re.as_ref() {
        if let Some(caps) = re.captures(html) {
            if let Some(m) = caps.get(1) {
                let url = m.as_str();
                return Some(if url.starts_with("//") {
                    format!("https:{}", url)
                } else {
                    url.to_string()
                });
            }
        }
    }

    static CHANNEL_THUMB_RE: OnceLock<Option<regex::Regex>> = OnceLock::new();
    let channel_thumb_re = CHANNEL_THUMB_RE.get_or_init(|| {
        regex::Regex::new(r#""channelThumbnailWithLinkRenderer"\s*:\s*\{.*?"thumbnails"\s*:\s*\[\{"url"\s*:\s*"([^"]+)""#).ok()
    });
    if let Some(re) = channel_thumb_re.as_ref() {
        if let Some(caps) = re.captures(html) {
            if let Some(m) = caps.get(1) {
                let url = m.as_str();
                return Some(if url.starts_with("//") {
                    format!("https:{}", url)
                } else {
                    url.to_string()
                });
            }
        }
    }

    static YT3_AVATAR_RE: OnceLock<Option<regex::Regex>> = OnceLock::new();
    let yt3_avatar_re = YT3_AVATAR_RE.get_or_init(|| {
        regex::Regex::new(r#"["'](https://yt3\.(?:ggpht|googleusercontent)\.com/[a-zA-Z0-9_/.-]+=[sS](?:88|176|68|48)[^"'\s]*)["']"#).ok()
    });
    if let Some(re) = yt3_avatar_re.as_ref() {
        if let Some(caps) = re.captures(html) {
            if let Some(m) = caps.get(1) {
                return Some(m.as_str().to_string());
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

pub fn is_concurrent_viewer_text(text: &str) -> bool {
    let lower = text.to_lowercase();
    (lower.contains("watching")
        || lower.contains("assistindo")
        || lower.contains("espectadores")
        || lower.contains("mirando")
        || lower.contains("zuschauer")
        || lower.contains("зрител")
        || lower.contains("regardent")
        || lower.contains("izleyici")
        || lower.contains("visualizzatori"))
        && !lower.contains("views")
        && !lower.contains("visualiz")
        && !lower.contains("aufruf")
        && !lower.contains("streamed")
        && !lower.contains("transmitido")
        && !lower.contains("gravad")
}

fn find_viewer_count(node: &Value) -> Option<u64> {
    if let Value::Object(map) = node {
        if let Some(vvcr) = map.get("videoViewCountRenderer") {
            let is_live_vvcr = vvcr
                .get("isLive")
                .and_then(|l| l.as_bool())
                .unwrap_or(false);

            if let Some(ovc) = vvcr.get("originalViewCount").and_then(|v| v.as_str()) {
                if is_live_vvcr {
                    let count = parse_viewer_count(ovc);
                    if count > 0 {
                        return Some(count);
                    }
                }
            }
            if let Some(vc) = vvcr.get("viewCount") {
                if let Some(s) = get_text_from_node(Some(vc)) {
                    if is_live_vvcr || is_concurrent_viewer_text(&s) {
                        let count = parse_viewer_count(&s);
                        if count > 0 {
                            return Some(count);
                        }
                    }
                }
            }
            if let Some(svc) = vvcr
                .get("extraShortViewCount")
                .or_else(|| vvcr.get("shortViewCount"))
            {
                if let Some(s) = get_text_from_node(Some(svc)) {
                    if is_live_vvcr || is_concurrent_viewer_text(&s) {
                        let count = parse_viewer_count(&s);
                        if count > 0 {
                            return Some(count);
                        }
                    }
                }
            }
        }

        if let Some(vct) = map
            .get("viewCountText")
            .or_else(|| map.get("shortViewCountText"))
        {
            if let Some(s) = get_text_from_node(Some(vct)) {
                if is_concurrent_viewer_text(&s) {
                    let count = parse_viewer_count(&s);
                    if count > 0 {
                        return Some(count);
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

    static VCR_SCOPE_RE: OnceLock<Option<regex::Regex>> = OnceLock::new();
    let vcr_scope_re = VCR_SCOPE_RE.get_or_init(|| {
        regex::Regex::new(r#""videoViewCountRenderer"\s*:\s*\{([^}]{0,400})\}"#).ok()
    });
    static WATCHING_RE: OnceLock<Option<regex::Regex>> = OnceLock::new();
    let watching_re = WATCHING_RE.get_or_init(|| {
        regex::Regex::new(r#"([0-9.,]+(?:\s*[kKmM]|\s*mil|\s*milhões|\s*tsd|\s*тыс)?)\s*(?:assistindo\s+agora|watching\s+now|assistindo|watching|espectadores|zuschauer)"#).ok()
    });
    if let (Some(scope_re), Some(watch_re)) = (vcr_scope_re.as_ref(), watching_re.as_ref()) {
        if let Some(scope_caps) = scope_re.captures(html) {
            if let Some(block) = scope_caps.get(1) {
                if let Some(caps) = watch_re.captures(block.as_str()) {
                    if let Some(m) = caps.get(1) {
                        let count = parse_viewer_count(m.as_str());
                        if count > 0 {
                            return Some(count);
                        }
                    }
                }
            }
        }
    }

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

pub fn is_interstitial_or_challenge_page(html: &str) -> bool {
    html.contains("consent.youtube.com")
        || html.contains("action=\"https://consent.youtube.com")
        || html.contains("class=\"g-recaptcha\"")
        || html.contains("Our systems have detected unusual traffic")
}

pub fn is_not_currently_live(node: Option<&Value>) -> bool {
    let n = match node {
        Some(node) => node,
        None => return false,
    };

    if let Some(vd) = n.get("videoDetails").or_else(|| find_video_details(n)) {
        if vd
            .get("isUpcoming")
            .and_then(|u| u.as_bool())
            .unwrap_or(false)
        {
            return true;
        }

        let is_live_val = vd.get("isLive").and_then(|l| l.as_bool());
        if let Some(is_live) = is_live_val {
            if !is_live {
                return true;
            }
        }

        let is_live_content = vd
            .get("isLiveContent")
            .and_then(|c| c.as_bool())
            .unwrap_or(false);
        if is_live_content && is_live_val != Some(true) {
            return true;
        }

        if let Some(len_str) = vd.get("lengthSeconds").and_then(|l| l.as_str()) {
            if len_str != "0" && !len_str.is_empty() && is_live_val != Some(true) {
                return true;
            }
        }
    }

    if let Some(microformat) = n
        .get("microformat")
        .and_then(|m| m.get("playerMicroformatRenderer"))
    {
        if let Some(lbd) = microformat.get("liveBroadcastDetails") {
            if let Some(is_live_now) = lbd.get("isLiveNow").and_then(|b| b.as_bool()) {
                if !is_live_now {
                    return true;
                }
            }
            if lbd.get("endTimestamp").is_some() {
                return true;
            }
        }

        let is_live_content = microformat
            .get("isLiveContent")
            .and_then(|c| c.as_bool())
            .unwrap_or(false);
        if is_live_content {
            let is_now = microformat
                .get("liveBroadcastDetails")
                .and_then(|lbd| lbd.get("isLiveNow"))
                .and_then(|b| b.as_bool())
                .unwrap_or(false);
            if !is_now {
                return true;
            }
        }
    }

    if let Some(status) = n
        .get("playabilityStatus")
        .and_then(|ps| ps.get("status"))
        .and_then(|s| s.as_str())
    {
        if status == "LIVE_STREAM_OFFLINE" || status == "UNPLAYABLE" || status == "ENDED" {
            return true;
        }
    }

    false
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

    let mut retries = 1;
    let res = loop {
        let resp = client
            .get(&url)
            .header("User-Agent", USER_AGENT)
            .header("Accept-Language", "en-US,en;q=0.9")
            .header(
                "Cookie",
                "CONSENT=PENDING+999; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg",
            )
            .header(
                "Accept",
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            )
            .send()
            .await;

        match resp {
            Ok(r) if r.status().is_success() => break Some(r),
            Ok(r) if r.status() == reqwest::StatusCode::TOO_MANY_REQUESTS && retries > 0 => {
                retries -= 1;
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
            Ok(r) if r.status().is_client_error() => break None,
            _ if retries > 0 => {
                retries -= 1;
                tokio::time::sleep(Duration::from_millis(200)).await;
            }
            _ => break None,
        }
    };

    let res = match res {
        Some(r) => r,
        None => return None,
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

    if is_interstitial_or_challenge_page(&html) {
        return None;
    }

    let canonical_id = if video_id_from_url.is_none() {
        extract_canonical_video_id(&html)
    } else {
        None
    };
    let mut video_id = video_id_from_url.or(canonical_id);

    let mut title: Option<String> = None;
    let mut viewer_count: Option<u64> = None;
    let mut avatar_url: Option<String> = None;
    let mut is_live = false;

    let mut display_name: Option<String> = None;
    let mut handle: Option<String> = None;
    let mut live_streams: Vec<YouTubeLiveStreamInfo> = Vec::new();

    let player_data = extract_yt_initial_player_response(&html);

    if viewer_count.is_none() {
        viewer_count = extract_viewer_count_from_html(&html);
    }

    if let Some(ref player) = player_data {
        if viewer_count.is_none() {
            viewer_count = find_viewer_count(player);
        }

        if let Some(microformat) = player
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
            if !is_live {
                let is_live_now = microformat
                    .get("liveBroadcastDetails")
                    .and_then(|lbd| lbd.get("isLiveNow"))
                    .and_then(|b| b.as_bool());

                if is_live_now == Some(true) {
                    is_live = true;
                }
            }
        }

        if let Some(vd) = player.get("videoDetails") {
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
            if !is_live {
                let vd_is_live = vd.get("isLive").and_then(|l| l.as_bool()).unwrap_or(false);
                let vd_is_upcoming = vd
                    .get("isUpcoming")
                    .and_then(|u| u.as_bool())
                    .unwrap_or(false);
                if vd_is_live && !vd_is_upcoming {
                    is_live = true;
                }
            }
        }
    }

    let json_data = extract_yt_initial_data(&html);

    if let Some(ref json) = json_data {
        if avatar_url.is_none() {
            avatar_url = find_channel_avatar(json);
        }
        let (found_name, found_handle) = find_channel_info(json);
        if display_name.is_none() {
            display_name = found_name;
        }
        if handle.is_none() {
            handle = found_handle;
        }

        if let Some(vd) = find_video_details(json) {
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

            if title.is_none() {
                title = vd
                    .get("title")
                    .and_then(|t| t.as_str())
                    .map(|s| s.to_string());
            }

            let vd_is_live = vd.get("isLive").and_then(|l| l.as_bool()).unwrap_or(false);
            let vd_is_upcoming = vd
                .get("isUpcoming")
                .and_then(|u| u.as_bool())
                .unwrap_or(false);

            if vd_is_live && !vd_is_upcoming {
                is_live = true;
            }
        }

        if viewer_count.is_none() {
            viewer_count = find_viewer_count(json);
        }
    }

    let is_offline = is_not_currently_live(player_data.as_ref());

    if is_offline {
        is_live = false;
        live_streams.clear();
    }

    if is_live && !is_video_id && !trimmed.starts_with("http") {
        let (streams_url, home_url) = if trimmed.starts_with("channel/") {
            (
                format!("https://www.youtube.com/{}/streams", trimmed),
                format!("https://www.youtube.com/{}", trimmed),
            )
        } else if trimmed.starts_with("UC") && trimmed.len() == 24 {
            (
                format!("https://www.youtube.com/channel/{}/streams", trimmed),
                format!("https://www.youtube.com/channel/{}", trimmed),
            )
        } else {
            let clean = trimmed.trim_start_matches('@');
            (
                format!("https://www.youtube.com/@{}/streams", clean),
                format!("https://www.youtube.com/@{}", clean),
            )
        };

        let fetch_page = |url: String| {
            let client = client.clone();
            async move {
                let resp = client
                    .get(&url)
                    .header("User-Agent", USER_AGENT)
                    .header("Accept-Language", "en-US,en;q=0.9")
                    .header(
                        "Cookie",
                        "CONSENT=PENDING+999; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg",
                    )
                    .send()
                    .await?;
                resp.text().await
            }
        };

        let phase2_result = tokio::time::timeout(Duration::from_secs(6), async {
            let (r1, r2) = tokio::join!(fetch_page(streams_url), fetch_page(home_url));
            (r1.ok(), r2.ok())
        })
        .await;

        if let Ok((r_streams, r_home)) = phase2_result {
            for html in [r_streams, r_home].into_iter().flatten() {
                if let Some(streams_json) = extract_yt_initial_data(&html) {
                    let detected = extract_live_streams_from_initial_data(&streams_json, 25);
                    for s in detected {
                        if !live_streams
                            .iter()
                            .any(|existing| existing.video_id == s.channel)
                        {
                            live_streams.push(YouTubeLiveStreamInfo {
                                video_id: s.channel.clone(),
                                title: s.title.clone(),
                                viewer_count: s.viewer_count,
                                thumbnail_url: s.thumbnail.clone(),
                            });
                        }
                    }
                }
            }
        }
    }

    if viewer_count.is_none() {
        viewer_count = extract_viewer_count_from_html(&html);
    }

    if handle.is_none() {
        static OWNER_PROFILE_HANDLE_RE: OnceLock<Option<regex::Regex>> = OnceLock::new();
        let handle_re = OWNER_PROFILE_HANDLE_RE.get_or_init(|| {
            regex::Regex::new(r#""ownerProfileUrl"\s*:\s*"[^"]*?/(@[a-zA-Z0-9_.-]+)""#).ok()
        });
        if let Some(re) = handle_re.as_ref() {
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
        avatar_url = extract_channel_avatar_from_html(&html);
    }

    if is_live {
        if let Some(ref vid) = video_id {
            if let Some(existing) = live_streams.iter_mut().find(|s| s.video_id == *vid) {
                if existing.viewer_count == 0 {
                    if let Some(vc) = viewer_count {
                        existing.viewer_count = vc;
                    }
                } else if let Some(vc) = viewer_count {
                    if vc > 0 {
                        existing.viewer_count = vc;
                    }
                }
            } else {
                live_streams.insert(
                    0,
                    YouTubeLiveStreamInfo {
                        video_id: vid.clone(),
                        title: title.clone().unwrap_or_else(|| "YouTube Live".to_string()),
                        viewer_count: viewer_count.unwrap_or(0),
                        thumbnail_url: Some(format!(
                            "https://i.ytimg.com/vi/{}/hqdefault.jpg",
                            vid
                        )),
                    },
                );
            }
        }
        if video_id.is_none() && !live_streams.is_empty() {
            video_id = Some(live_streams[0].video_id.clone());
            if title.is_none() {
                title = Some(live_streams[0].title.clone());
            }
            if viewer_count.is_none() || viewer_count == Some(0) {
                viewer_count = Some(live_streams[0].viewer_count);
            }
        } else if (viewer_count.is_none() || viewer_count == Some(0)) && !live_streams.is_empty() {
            if let Some(ref vid) = video_id {
                if let Some(matching) = live_streams.iter().find(|s| s.video_id == *vid) {
                    if matching.viewer_count > 0 {
                        viewer_count = Some(matching.viewer_count);
                    }
                }
            }
            if viewer_count.unwrap_or(0) == 0 && live_streams[0].viewer_count > 0 {
                viewer_count = Some(live_streams[0].viewer_count);
            }
        }
    } else {
        video_id = None;
        viewer_count = None;
        live_streams.clear();
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
        live_streams,
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

    let semaphore = Arc::new(Semaphore::new(4));
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
    let client = get_youtube_client();
    let meta = get_youtube_locale_meta(locale);
    let cookie_val = format!("PREF=hl={}&gl={}&tz=UTC", meta.hl, meta.gl);

    let live_url = format!("https://www.youtube.com/live?hl={}&gl={}", meta.hl, meta.gl);
    let gaming_url = format!(
        "https://www.youtube.com/gaming?hl={}&gl={}",
        meta.hl, meta.gl
    );

    let fetch_page = |url: String| {
        let cookie = cookie_val.clone();
        async move {
            client
                .get(&url)
                .header("User-Agent", USER_AGENT)
                .header("Accept-Language", meta.accept_lang)
                .header("Cookie", &cookie)
                .header("X-YouTube-Client-Name", "1")
                .header(
                    "Accept",
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                )
                .send()
                .await
        }
    };

    let (live_res, gaming_res) = tokio::join!(fetch_page(live_url), fetch_page(gaming_url));

    let mut all_streams = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    for resp in [live_res, gaming_res] {
        if all_streams.len() >= limit {
            break;
        }

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

    #[test]
    fn should_detect_consent_or_challenge_pages() {
        // Arrange
        let consent_html =
            r#"<html><body><form action="https://consent.youtube.com/save"></form></body></html>"#;
        let captcha_html = r#"<html><body><div class="g-recaptcha"></div></body></html>"#;
        let normal_html = r#"<html><head><link rel="canonical" href="https://www.youtube.com/watch?v=12345"></head></html>"#;

        // Act & Assert
        assert!(is_interstitial_or_challenge_page(consent_html));
        assert!(is_interstitial_or_challenge_page(captcha_html));
        assert!(!is_interstitial_or_challenge_page(normal_html));
    }

    #[test]
    fn should_detect_not_currently_live_broadcasts() {
        // Arrange
        let upcoming_json = serde_json::json!({
            "videoDetails": { "isUpcoming": true, "isLive": true }
        });
        let offline_json = serde_json::json!({
            "playabilityStatus": { "status": "LIVE_STREAM_OFFLINE" }
        });
        let ended_json = serde_json::json!({
            "playabilityStatus": { "status": "ENDED" },
            "microformat": {
                "playerMicroformatRenderer": {
                    "liveBroadcastDetails": {
                        "isLiveNow": false,
                        "endTimestamp": "2026-09-16T17:00:00Z"
                    }
                }
            }
        });
        let not_live_now_json = serde_json::json!({
            "microformat": {
                "playerMicroformatRenderer": {
                    "liveBroadcastDetails": {
                        "isLiveNow": false
                    }
                }
            }
        });
        let live_json = serde_json::json!({
            "videoDetails": { "isUpcoming": false, "isLive": true },
            "playabilityStatus": { "status": "OK" },
            "microformat": {
                "playerMicroformatRenderer": {
                    "liveBroadcastDetails": {
                        "isLiveNow": true
                    }
                }
            }
        });
        let live_content_json = serde_json::json!({
            "videoDetails": { "isUpcoming": false, "isLive": false, "isLiveContent": true },
            "playabilityStatus": { "status": "OK" }
        });

        // Act & Assert
        assert!(is_not_currently_live(Some(&upcoming_json)));
        assert!(is_not_currently_live(Some(&offline_json)));
        assert!(is_not_currently_live(Some(&ended_json)));
        assert!(is_not_currently_live(Some(&not_live_now_json)));
        assert!(!is_not_currently_live(Some(&live_json)));
        assert!(is_not_currently_live(Some(&live_content_json)));
        assert!(!is_not_currently_live(None));
    }

    #[test]
    fn should_detect_vod_with_length_seconds_and_omitted_islive_as_not_currently_live() {
        // Arrange
        let vod_json = serde_json::json!({
            "videoDetails": {
                "videoId": "vod12345678",
                "lengthSeconds": "7200",
                "isLiveContent": true,
                "viewCount": "45210"
            },
            "playabilityStatus": { "status": "OK" }
        });

        // Act & Assert
        assert!(is_not_currently_live(Some(&vod_json)));
    }

    #[test]
    fn should_detect_microformat_vod_without_live_now_as_not_currently_live() {
        // Arrange
        let vod_microformat = serde_json::json!({
            "microformat": {
                "playerMicroformatRenderer": {
                    "isLiveContent": true,
                    "liveBroadcastDetails": {
                        "isLiveNow": false,
                        "endTimestamp": "2026-09-17T02:00:00Z"
                    }
                }
            }
        });

        // Act & Assert
        assert!(is_not_currently_live(Some(&vod_microformat)));
    }

    #[test]
    fn should_reject_cumulative_views_and_only_accept_concurrent_viewers() {
        // Arrange
        let cumulative_json = serde_json::json!({
            "videoViewCountRenderer": {
                "viewCount": { "simpleText": "977.412 visualizações" }
            },
            "videoDetails": {
                "viewCount": "977412"
            }
        });

        let concurrent_json = serde_json::json!({
            "videoViewCountRenderer": {
                "isLive": true,
                "originalViewCount": "3200",
                "viewCount": { "runs": [{ "text": "3.200" }, { "text": " assistindo agora" }] }
            }
        });

        // Act
        let cumulative_res = find_viewer_count(&cumulative_json);
        let concurrent_res = find_viewer_count(&concurrent_json);

        // Assert
        assert_eq!(cumulative_res, None);
        assert_eq!(concurrent_res, Some(3200));
    }

    #[test]
    fn should_extract_channel_avatar_from_video_owner_renderer_html() {
        // Arrange
        let html = r#"<html><body><script>var data = {"videoOwnerRenderer":{"thumbnails":[{"url":"https://yt3.ggpht.com/a/sample_owner_avatar.jpg"}]}};</script></body></html>"#;

        // Act
        let avatar = extract_channel_avatar_from_html(html);

        // Assert
        assert_eq!(
            avatar,
            Some("https://yt3.ggpht.com/a/sample_owner_avatar.jpg".to_string())
        );
    }

    #[test]
    fn should_extract_channel_avatar_from_channel_thumbnail_renderer_html() {
        // Arrange
        let html = r#"<html><body><script>var data = {"channelThumbnailWithLinkRenderer":{"thumbnails":[{"url":"//yt3.ggpht.com/sample_channel_thumb.jpg"}]}};</script></body></html>"#;

        // Act
        let avatar = extract_channel_avatar_from_html(html);

        // Assert
        assert_eq!(
            avatar,
            Some("https://yt3.ggpht.com/sample_channel_thumb.jpg".to_string())
        );
    }

    #[test]
    fn should_extract_channel_avatar_from_yt3_avatar_regex() {
        // Arrange
        let html = r#"<html><body><img src="https://yt3.ggpht.com/ytc/AIdro_sample=s176-c-k-c0x00ffffff-no-rj" /></body></html>"#;

        // Act
        let avatar = extract_channel_avatar_from_html(html);

        // Assert
        assert_eq!(
            avatar,
            Some("https://yt3.ggpht.com/ytc/AIdro_sample=s176-c-k-c0x00ffffff-no-rj".to_string())
        );
    }

    #[test]
    fn should_find_channel_avatar_from_json_tree() {
        // Arrange
        let json = serde_json::json!({
            "contents": {
                "twoColumnWatchNextResults": {
                    "results": {
                        "results": {
                            "contents": [
                                {
                                    "videoSecondaryInfoRenderer": {
                                        "owner": {
                                            "videoOwnerRenderer": {
                                                "thumbnail": {
                                                    "thumbnails": [
                                                        { "url": "//yt3.ggpht.com/channel_avatar.jpg" }
                                                    ]
                                                }
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
        let avatar = find_channel_avatar(&json);

        // Assert
        assert_eq!(
            avatar,
            Some("https://yt3.ggpht.com/channel_avatar.jpg".to_string())
        );
    }
}
