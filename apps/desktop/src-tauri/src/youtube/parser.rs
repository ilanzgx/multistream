use super::types::{YouTubeSearchResult, YouTubeSuggestedStream};
use serde_json::Value;
use std::collections::HashSet;
use std::sync::OnceLock;

fn extract_js_variable(html: &str, patterns: &[&str]) -> Option<Value> {
    for pattern in patterns {
        let start_pos = match html.find(pattern) {
            Some(p) => p,
            None => continue,
        };
        let slice = html[start_pos + pattern.len()..].trim_start();
        if !slice.starts_with('{') {
            continue;
        }
        let mut de = serde_json::Deserializer::from_str(slice).into_iter::<Value>();
        if let Some(Ok(val)) = de.next() {
            return Some(val);
        }
        let json_str = if let Some(end) = slice.find(";</script>") {
            &slice[..end]
        } else if let Some(end) = slice.find("</script>") {
            slice[..end].trim().trim_end_matches(';')
        } else {
            slice
        };
        if let Ok(parsed) = serde_json::from_str::<Value>(json_str) {
            return Some(parsed);
        }
    }
    None
}

pub fn extract_yt_initial_data(html: &str) -> Option<Value> {
    extract_js_variable(
        html,
        &[
            "var ytInitialData = ",
            "window[\"ytInitialData\"] = ",
            "ytInitialData = ",
        ],
    )
}

pub fn extract_yt_initial_player_response(html: &str) -> Option<Value> {
    extract_js_variable(
        html,
        &[
            "var ytInitialPlayerResponse = ",
            "window[\"ytInitialPlayerResponse\"] = ",
            "ytInitialPlayerResponse = ",
        ],
    )
}

pub fn parse_viewer_count(text: &str) -> u64 {
    let normalized = text.to_lowercase().replace(['\u{a0}', '\u{202f}'], " ");

    let is_ten_thousand = normalized.contains('万');
    let is_million = normalized.contains("milhões")
        || normalized.contains("million")
        || normalized.contains(" млн")
        || normalized.contains(" milhão")
        || {
            let after_digits = normalized
                .trim_start_matches(|c: char| {
                    c.is_ascii_digit() || c == '.' || c == ',' || c == ' '
                })
                .trim_start();
            after_digits.starts_with("m ")
                || after_digits == "m"
                || after_digits.starts_with("mi ")
                || after_digits == "mi"
        };
    let is_thousand = !is_million
        && !is_ten_thousand
        && (normalized.contains("mil ")
            || normalized.ends_with("mil")
            || normalized.contains("тыс")
            || normalized.contains("tsd")
            || normalized.contains("k ")
            || normalized.ends_with('k'));

    let mut num_str = String::new();
    let mut prev_was_digit = false;
    let chars: Vec<char> = normalized.chars().collect();
    for (i, &c) in chars.iter().enumerate() {
        if c.is_ascii_digit() || c == '.' || c == ',' {
            num_str.push(c);
            prev_was_digit = c.is_ascii_digit();
        } else if (c == ' ' || c == '\t')
            && prev_was_digit
            && i + 1 < chars.len()
            && chars[i + 1].is_ascii_digit()
        {
            continue;
        } else if !num_str.is_empty() {
            break;
        }
    }

    if num_str.is_empty() {
        return 0;
    }

    if is_million {
        let clean = num_str.replace(',', ".");
        if let Ok(val) = clean.parse::<f64>() {
            return (val * 1_000_000.0).round() as u64;
        }
    } else if is_ten_thousand {
        let clean = num_str.replace(',', ".");
        if let Ok(val) = clean.parse::<f64>() {
            return (val * 10_000.0).round() as u64;
        }
    } else if is_thousand {
        let clean = num_str.replace(',', ".");
        if let Ok(val) = clean.parse::<f64>() {
            return (val * 1_000.0).round() as u64;
        }
    } else {
        let digits_only: String = num_str.chars().filter(|c| c.is_ascii_digit()).collect();
        if let Ok(val) = digits_only.parse::<u64>() {
            return val;
        }
    }

    let digits_only: String = num_str.chars().filter(|c| c.is_ascii_digit()).collect();
    digits_only.parse::<u64>().unwrap_or(0)
}

fn is_live_video(renderer: &Value) -> bool {
    if renderer.get("lengthText").is_some() {
        return false;
    }
    if renderer.get("upcomingEventData").is_some() {
        return false;
    }

    if let Some(badges) = renderer.get("badges").and_then(|b| b.as_array()) {
        for badge in badges {
            if let Some(meta) = badge.get("metadataBadgeRenderer") {
                let style = meta.get("style").and_then(|s| s.as_str()).unwrap_or("");
                let label = meta.get("label").and_then(|l| l.as_str()).unwrap_or("");
                if style == "BADGE_STYLE_TYPE_LIVE_NOW"
                    || label.eq_ignore_ascii_case("live")
                    || label.eq_ignore_ascii_case("ao vivo")
                {
                    return true;
                }
            }
        }
    }

    if let Some(overlays) = renderer.get("thumbnailOverlays").and_then(|o| o.as_array()) {
        for overlay in overlays {
            if let Some(status) = overlay.get("thumbnailOverlayTimeStatusRenderer") {
                let style = status.get("style").and_then(|s| s.as_str()).unwrap_or("");
                let text = status
                    .get("text")
                    .and_then(|t| t.get("runs"))
                    .and_then(|r| r.get(0))
                    .and_then(|r| r.get("text"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("");
                if style == "LIVE"
                    || text.eq_ignore_ascii_case("live")
                    || text.eq_ignore_ascii_case("ao vivo")
                {
                    return true;
                }
            }
        }
    }

    if let Some(view_text) = get_text_from_node(renderer.get("viewCountText")) {
        let lower = view_text.to_lowercase();
        if (lower.contains("watching")
            || lower.contains("assistindo")
            || lower.contains("mirando")
            || lower.contains("zuschauer")
            || lower.contains("зрител")
            || lower.contains("regardent")
            || lower.contains("izleyici")
            || lower.contains("visualizzatori"))
            && !lower.contains("streamed")
            && !lower.contains("transmitido")
            && !lower.contains("gravad")
            && !lower.contains("views")
            && !lower.contains("visualiz")
        {
            return true;
        }
    }

    false
}

pub fn get_text_from_node(node: Option<&Value>) -> Option<String> {
    let node = node?;
    if let Some(s) = node.as_str() {
        return Some(s.to_string());
    }
    if let Some(simple) = node.get("simpleText").and_then(|s| s.as_str()) {
        return Some(simple.to_string());
    }
    if let Some(content) = node.get("content").and_then(|c| c.as_str()) {
        return Some(content.to_string());
    }
    if let Some(text) = node.get("text").and_then(|t| t.as_str()) {
        return Some(text.to_string());
    }
    if let Some(runs) = node.get("runs").and_then(|r| r.as_array()) {
        let texts: Vec<&str> = runs
            .iter()
            .filter_map(|r| r.get("text").and_then(|t| t.as_str()))
            .collect();
        if !texts.is_empty() {
            return Some(texts.join(""));
        }
    }
    None
}

fn parse_single_video_renderer(renderer: &Value) -> Option<YouTubeSuggestedStream> {
    if !is_live_video(renderer) {
        return None;
    }

    let video_id = renderer.get("videoId").and_then(|v| v.as_str())?;
    let title =
        get_text_from_node(renderer.get("title")).unwrap_or_else(|| "YouTube Live".to_string());

    let channel_node = renderer
        .get("ownerText")
        .or_else(|| renderer.get("shortBylineText"));
    let channel_name = get_text_from_node(channel_node).unwrap_or_else(|| "YouTube".to_string());

    let handle = channel_node
        .and_then(|node| node.get("runs"))
        .and_then(|r| r.as_array())
        .and_then(|arr| arr.first())
        .and_then(|run| run.get("navigationEndpoint"))
        .and_then(|nav| {
            nav.get("browseEndpoint")
                .and_then(|be| be.get("canonicalBaseUrl"))
                .and_then(|u| u.as_str())
                .or_else(|| {
                    nav.get("commandMetadata")
                        .and_then(|cm| cm.get("webCommandMetadata"))
                        .and_then(|wcm| wcm.get("url"))
                        .and_then(|u| u.as_str())
                })
        })
        .and_then(|url| {
            let trimmed = url.trim_start_matches('/');
            if trimmed.starts_with('@') {
                Some(trimmed.trim_start_matches('@').to_string())
            } else {
                None
            }
        });

    let viewer_count = get_text_from_node(renderer.get("viewCountText"))
        .filter(|t| {
            let lower = t.to_lowercase();
            !lower.contains("views")
                && !lower.contains("visualiz")
                && !lower.contains("aufruf")
                && !lower.contains("streamed")
                && !lower.contains("transmitido")
                && !lower.contains("gravad")
        })
        .map(|t| parse_viewer_count(&t))
        .unwrap_or(0);

    let thumbnail = renderer
        .get("thumbnail")
        .and_then(|t| t.get("thumbnails"))
        .and_then(|t| t.as_array())
        .and_then(|arr| arr.last())
        .and_then(|t| t.get("url"))
        .and_then(|u| u.as_str())
        .map(|u| u.to_string());

    Some(YouTubeSuggestedStream {
        channel: video_id.to_string(),
        display_name: Some(channel_name),
        handle,
        platform: "youtube".to_string(),
        title,
        category: "Live".to_string(),
        viewer_count,
        thumbnail,
    })
}

pub fn is_live_lockup(lockup: &Value) -> bool {
    if lockup.get("upcomingEventData").is_some() {
        return false;
    }
    let str_repr = lockup.to_string().to_lowercase();
    if str_repr.contains("thumbnail_overlay_badge_style_upcoming")
        || str_repr.contains("\"text\":\"upcoming\"")
        || str_repr.contains("upcomingeventdata")
        || str_repr.contains("programado para")
        || str_repr.contains("\"programado\"")
        || str_repr.contains("\"text\":\"programado\"")
    {
        return false;
    }

    let overlays = lockup
        .get("contentImage")
        .and_then(|ci| ci.get("thumbnailViewModel"))
        .and_then(|tv| tv.get("overlays"))
        .or_else(|| lockup.get("overlays"))
        .and_then(|o| o.as_array());

    if let Some(overlays) = overlays {
        for overlay in overlays {
            if let Some(bottom_badges) = overlay
                .get("thumbnailBottomOverlayViewModel")
                .and_then(|b| b.get("badges"))
                .and_then(|b| b.as_array())
            {
                for b in bottom_badges {
                    if let Some(vm) = b.get("thumbnailBadgeViewModel") {
                        let badge_style =
                            vm.get("badgeStyle").and_then(|s| s.as_str()).unwrap_or("");
                        let text = vm.get("text").and_then(|t| t.as_str()).unwrap_or("");

                        if badge_style.contains("TIME_STATUS") || text.contains(':') {
                            return false;
                        }
                        if text.eq_ignore_ascii_case("upcoming") || badge_style.contains("UPCOMING")
                        {
                            return false;
                        }

                        let has_live_icon = vm
                            .get("icon")
                            .and_then(|i| i.get("sources"))
                            .and_then(|s| s.as_array())
                            .and_then(|arr| arr.first())
                            .and_then(|s| s.get("clientResource"))
                            .and_then(|cr| cr.get("imageName"))
                            .and_then(|n| n.as_str())
                            == Some("LIVE");

                        if badge_style.contains("LIVE")
                            || text.eq_ignore_ascii_case("live")
                            || text.eq_ignore_ascii_case("ao vivo")
                            || has_live_icon
                        {
                            return true;
                        }
                    }
                }
            }

            if let Some(time_status) = overlay.get("thumbnailOverlayTimeStatusRenderer") {
                let style = time_status
                    .get("style")
                    .and_then(|s| s.as_str())
                    .unwrap_or("");
                let text = get_text_from_node(time_status.get("text")).unwrap_or_default();
                if style != "LIVE" && text.contains(':') {
                    return false;
                }
                if style == "LIVE"
                    || text.eq_ignore_ascii_case("live")
                    || text.eq_ignore_ascii_case("ao vivo")
                {
                    return true;
                }
            }

            if let Some(badge) = overlay.get("thumbnailOverlayBadgeViewModel") {
                if let Some(inner) = badge.get("thumbnailBadgeViewModel") {
                    let style = inner
                        .get("badgeStyle")
                        .and_then(|s| s.as_str())
                        .unwrap_or("");
                    let text = inner.get("text").and_then(|t| t.as_str()).unwrap_or("");
                    if style.contains("LIVE")
                        || text.eq_ignore_ascii_case("live")
                        || text.eq_ignore_ascii_case("ao vivo")
                    {
                        return true;
                    }
                }
                let str_badge = badge.to_string().to_lowercase();
                if str_badge.contains("live_now")
                    || str_badge.contains("style_live")
                    || str_badge.contains("badge_style_live")
                    || str_badge.contains("\"live\"")
                    || str_badge.contains("\"ao vivo\"")
                {
                    return true;
                }
            }

            if let Some(vm) = overlay.get("thumbnailBadgeViewModel") {
                let style = vm.get("badgeStyle").and_then(|s| s.as_str()).unwrap_or("");
                let text = vm.get("text").and_then(|t| t.as_str()).unwrap_or("");
                if style.contains("LIVE")
                    || text.eq_ignore_ascii_case("live")
                    || text.eq_ignore_ascii_case("ao vivo")
                {
                    return true;
                }
            }
        }
    }

    let meta_obj = lockup
        .get("metadata")
        .and_then(|m| m.get("lockupMetadataViewModel"));
    let meta_rows = meta_obj
        .and_then(|m| m.get("metadata"))
        .and_then(|m| m.get("contentMetadataViewModel"))
        .and_then(|c| c.get("metadataRows"))
        .or_else(|| meta_obj.and_then(|m| m.get("metadataRows")))
        .and_then(|r| r.as_array());

    if let Some(rows) = meta_rows {
        for row in rows {
            let row_str = row.to_string().to_lowercase();
            if (row_str.contains("watching")
                || row_str.contains("assistindo")
                || row_str.contains("espectadores")
                || row_str.contains("zuschauer")
                || row_str.contains("зрител")
                || row_str.contains("regardent")
                || row_str.contains("izleyici"))
                && !row_str.contains("streamed")
                && !row_str.contains("transmitido")
                && !row_str.contains("views")
                && !row_str.contains("visualiz")
            {
                return true;
            }
        }
    }

    if str_repr.contains("\"islive\":true")
        || str_repr.contains("\"islivenow\":true")
        || str_repr.contains("thumbnail_overlay_badge_style_live")
        || str_repr.contains("badge_style_type_live_now")
    {
        return true;
    }

    false
}

pub fn parse_lockup_view_model(lockup: &Value) -> Option<YouTubeSuggestedStream> {
    if !is_live_lockup(lockup) {
        return None;
    }

    let video_id = lockup
        .get("contentId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            static VIDEO_ID_RE: OnceLock<Option<regex::Regex>> = OnceLock::new();
            let re = VIDEO_ID_RE
                .get_or_init(|| regex::Regex::new(r#""videoId"\s*:\s*"([a-zA-Z0-9_-]{11})""#).ok());
            let s = lockup.to_string();
            re.as_ref()
                .and_then(|r| r.captures(&s))
                .and_then(|c| c.get(1))
                .map(|m| m.as_str().to_string())
        })?;

    if video_id.len() != 11 {
        return None;
    }

    let metadata = lockup
        .get("metadata")
        .and_then(|m| m.get("lockupMetadataViewModel"));

    let title = metadata
        .and_then(|m| get_text_from_node(m.get("title")))
        .unwrap_or_else(|| "YouTube Live".to_string());

    let mut viewer_count = 0u64;
    let meta_rows = metadata
        .and_then(|m| m.get("metadata"))
        .and_then(|m| m.get("contentMetadataViewModel"))
        .and_then(|c| c.get("metadataRows"))
        .or_else(|| metadata.and_then(|m| m.get("metadataRows")))
        .and_then(|r| r.as_array());

    if let Some(rows) = meta_rows {
        'rows: for row in rows {
            let mut candidates = Vec::new();

            if let Some(parts) = row.get("metadataParts").and_then(|p| p.as_array()) {
                for part in parts {
                    if let Some(text_node) = part.get("text") {
                        if let Some(t) = get_text_from_node(Some(text_node)) {
                            candidates.push(t);
                        }
                    }
                    if let Some(t) = get_text_from_node(Some(part)) {
                        candidates.push(t);
                    }
                }
            }

            if let Some(contents) = row
                .get("metadataRowRenderer")
                .and_then(|r| r.get("contents"))
                .and_then(|c| c.as_array())
            {
                for cell in contents {
                    if let Some(t) = get_text_from_node(Some(cell)) {
                        candidates.push(t);
                    }
                }
            }

            if let Some(t) = get_text_from_node(Some(row)) {
                candidates.push(t);
            }
            if let Some(t) = row.get("text").and_then(Value::as_str) {
                candidates.push(t.to_string());
            }

            for text in candidates {
                let lower = text.to_lowercase();
                if (lower.contains("watching")
                    || lower.contains("assistindo")
                    || lower.contains("espectadores")
                    || lower.contains("zuschauer")
                    || lower.contains("зрител")
                    || lower.contains("regardent")
                    || lower.contains("izleyici"))
                    && !lower.contains("streamed")
                    && !lower.contains("transmitido")
                    && !lower.contains("views")
                    && !lower.contains("visualiz")
                {
                    viewer_count = parse_viewer_count(&text);
                    if viewer_count > 0 {
                        break 'rows;
                    }
                }
            }
        }

        if viewer_count == 0 {
            for row in rows {
                let row_str = row.to_string();
                let lower = row_str.to_lowercase();
                if (lower.contains("watching")
                    || lower.contains("assistindo")
                    || lower.contains("espectadores")
                    || lower.contains("zuschauer")
                    || lower.contains("зрител")
                    || lower.contains("regardent")
                    || lower.contains("izleyici"))
                    && !lower.contains("streamed")
                    && !lower.contains("transmitido")
                    && !lower.contains("views")
                    && !lower.contains("visualiz")
                {
                    viewer_count = parse_viewer_count(&row_str);
                    if viewer_count > 0 {
                        break;
                    }
                }
            }
        }
    }

    let thumbnail = lockup
        .get("contentImage")
        .and_then(|ci| ci.get("thumbnailViewModel"))
        .and_then(|tv| tv.get("image"))
        .and_then(|img| img.get("sources"))
        .and_then(|s| s.as_array())
        .and_then(|arr| arr.last())
        .and_then(|item| item.get("url"))
        .and_then(|u| u.as_str())
        .map(|u| u.to_string())
        .or_else(|| Some(format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", video_id)));

    Some(YouTubeSuggestedStream {
        channel: video_id,
        display_name: None,
        handle: None,
        platform: "youtube".to_string(),
        title,
        category: "Live".to_string(),
        viewer_count,
        thumbnail,
    })
}

pub fn extract_live_streams_from_initial_data(
    data: &Value,
    limit: usize,
) -> Vec<YouTubeSuggestedStream> {
    let mut results = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    fn traverse(
        node: &Value,
        results: &mut Vec<YouTubeSuggestedStream>,
        seen_ids: &mut std::collections::HashSet<String>,
        limit: usize,
    ) {
        if results.len() >= limit {
            return;
        }

        match node {
            Value::Object(map) => {
                let mut handled = false;

                if let Some(lockup) = map.get("lockupViewModel") {
                    if let Some(stream) = parse_lockup_view_model(lockup) {
                        if !seen_ids.contains(&stream.channel) {
                            seen_ids.insert(stream.channel.clone());
                            results.push(stream);
                        }
                        handled = true;
                    }
                }

                if !handled {
                    let renderer = map
                        .get("videoRenderer")
                        .or_else(|| map.get("compactVideoRenderer"))
                        .or_else(|| map.get("gridVideoRenderer"));

                    if let Some(r) = renderer {
                        if let Some(stream) = parse_single_video_renderer(r) {
                            if !seen_ids.contains(&stream.channel) {
                                seen_ids.insert(stream.channel.clone());
                                results.push(stream);
                            }
                            handled = true;
                        }
                    }
                }

                if !handled {
                    for (_, val) in map {
                        traverse(val, results, seen_ids, limit);
                        if results.len() >= limit {
                            return;
                        }
                    }
                }
            }
            Value::Array(arr) => {
                for item in arr {
                    traverse(item, results, seen_ids, limit);
                    if results.len() >= limit {
                        return;
                    }
                }
            }
            _ => {}
        }
    }

    traverse(data, &mut results, &mut seen_ids, limit);
    results
}

fn parse_channel_renderer(cr: &Value) -> Option<YouTubeSearchResult> {
    let title = get_text_from_node(cr.get("title"))?;

    let url = cr
        .get("navigationEndpoint")
        .and_then(|ne| ne.get("browseEndpoint"))
        .and_then(|be| be.get("canonicalBaseUrl"))
        .and_then(|u| u.as_str())
        .or_else(|| {
            cr.get("navigationEndpoint")
                .and_then(|ne| ne.get("commandMetadata"))
                .and_then(|cm| cm.get("webCommandMetadata"))
                .and_then(|wcm| wcm.get("url"))
                .and_then(|u| u.as_str())
        })
        .or_else(|| cr.get("canonicalBaseUrl").and_then(|u| u.as_str()));

    let channel_handle = if let Some(u) = url {
        let trimmed = u.trim_start_matches('/');
        if trimmed.starts_with('@') {
            trimmed.trim_start_matches('@').to_string()
        } else if let Some(stripped) = trimmed.strip_prefix("channel/") {
            stripped.to_string()
        } else if let Some(stripped) = trimmed.strip_prefix("c/") {
            stripped.to_string()
        } else {
            trimmed.to_string()
        }
    } else if let Some(id) = cr.get("channelId").and_then(|id| id.as_str()) {
        id.to_string()
    } else {
        title.replace(' ', "").to_lowercase()
    };

    let avatar_url = cr
        .get("thumbnail")
        .and_then(|t| t.get("thumbnails"))
        .and_then(|arr| arr.as_array())
        .and_then(|arr| arr.last())
        .and_then(|thumb| thumb.get("url"))
        .and_then(|u| u.as_str())
        .map(|u| {
            if u.starts_with("//") {
                format!("https:{}", u)
            } else {
                u.to_string()
            }
        });

    let mut is_live = false;
    if let Some(badges) = cr.get("badges").and_then(|b| b.as_array()) {
        for b in badges {
            if let Some(label) = b
                .get("metadataBadgeRenderer")
                .and_then(|m| m.get("label"))
                .and_then(|l| l.as_str())
            {
                let l_lower = label.to_lowercase();
                if l_lower.contains("live")
                    || l_lower.contains("ao vivo")
                    || l_lower.contains("directo")
                {
                    is_live = true;
                    break;
                }
            }
        }
    }

    let category = get_text_from_node(cr.get("subscriberCountText"));

    Some(YouTubeSearchResult {
        channel: channel_handle,
        display_name: Some(title),
        is_live,
        avatar_url,
        category,
    })
}

pub fn extract_channel_search_results(data: &Value, limit: usize) -> Vec<YouTubeSearchResult> {
    let mut results = Vec::new();
    let mut seen_handles = HashSet::new();

    fn traverse(
        node: &Value,
        results: &mut Vec<YouTubeSearchResult>,
        seen: &mut HashSet<String>,
        limit: usize,
    ) {
        if results.len() >= limit {
            return;
        }

        if let Value::Object(map) = node {
            if let Some(cr) = map.get("channelRenderer") {
                if let Some(res) = parse_channel_renderer(cr) {
                    let key = res.channel.to_lowercase();
                    if !seen.contains(&key) {
                        seen.insert(key);
                        results.push(res);
                        if results.len() >= limit {
                            return;
                        }
                    }
                }
            }

            for val in map.values() {
                traverse(val, results, seen, limit);
                if results.len() >= limit {
                    return;
                }
            }
        } else if let Value::Array(arr) = node {
            for item in arr {
                traverse(item, results, seen, limit);
                if results.len() >= limit {
                    return;
                }
            }
        }
    }

    traverse(data, &mut results, &mut seen_handles, limit);
    results
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_parse_various_viewer_count_formats() {
        // Arrange & Act & Assert
        assert_eq!(parse_viewer_count("15K watching"), 15000);
        assert_eq!(parse_viewer_count("1.5K watching"), 1500);
        assert_eq!(parse_viewer_count("2.4M watching"), 2400000);
        assert_eq!(parse_viewer_count("15 mil assistindo"), 15000);
        assert_eq!(parse_viewer_count("1,5 mi assistindo"), 1500000);
        assert_eq!(parse_viewer_count("1.234 assistindo agora"), 1234);
        assert_eq!(parse_viewer_count("1 234 spectateurs"), 1234);
        assert_eq!(parse_viewer_count("15420"), 15420);
        assert_eq!(parse_viewer_count("42 espectadores"), 42);
        assert_eq!(parse_viewer_count("10 тыс. зрителей"), 10000);
        assert_eq!(parse_viewer_count("1.2万人正在观看"), 12000);
        assert_eq!(parse_viewer_count("35万人正在观看"), 350000);
        assert_eq!(parse_viewer_count("invalid"), 0);
    }

    #[test]
    fn should_extract_yt_initial_data_from_script_tag() {
        // Arrange
        let sample_html = r#"
            <!DOCTYPE html>
            <html>
                <head>
                    <script>
                        var ytInitialData = {"contents": {"test": "value"}};</script>
                </head>
            </html>
        "#;

        // Act
        let result = extract_yt_initial_data(sample_html);

        // Assert
        assert!(result.is_some());
        let val = result.unwrap();
        assert_eq!(val["contents"]["test"], "value");
    }

    #[test]
    fn should_extract_live_streams_from_valid_json() {
        // Arrange
        let json_data = serde_json::json!({
            "contents": {
                "sectionListRenderer": {
                    "contents": [
                        {
                            "itemSectionRenderer": {
                                "contents": [
                                    {
                                        "videoRenderer": {
                                            "videoId": "testVideo123",
                                            "title": { "runs": [{ "text": "Championship Live" }] },
                                            "ownerText": { "runs": [{ "text": "CazéTV" }] },
                                            "viewCountText": { "runs": [{ "text": "50.000 assistindo" }] },
                                            "badges": [
                                                {
                                                    "metadataBadgeRenderer": {
                                                        "style": "BADGE_STYLE_TYPE_LIVE_NOW",
                                                        "label": "AO VIVO"
                                                    }
                                                }
                                            ],
                                            "thumbnail": {
                                                "thumbnails": [
                                                    { "url": "https://img.youtube.com/vi/testVideo123/hqdefault.jpg" }
                                                ]
                                            }
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                }
            }
        });

        // Act
        let streams = extract_live_streams_from_initial_data(&json_data, 10);

        // Assert
        assert_eq!(streams.len(), 1);
        let stream = &streams[0];
        assert_eq!(stream.channel, "testVideo123");
        assert_eq!(stream.display_name.as_deref(), Some("CazéTV"));
        assert_eq!(stream.title, "Championship Live");
        assert_eq!(stream.category, "Live");
        assert_eq!(stream.viewer_count, 50000);
        assert_eq!(stream.platform, "youtube");
    }

    #[test]
    fn should_extract_yt_initial_player_response_from_script_tag() {
        // Arrange
        let sample_html = r#"
            <!DOCTYPE html>
            <html>
                <head>
                    <script>
                        var ytInitialPlayerResponse = {"microformat": {"playerMicroformatRenderer": {"ownerChannelName": "CazéTV", "ownerProfileUrl": "http://www.youtube.com/@CazeTV"}}};</script>
                </head>
            </html>
        "#;

        // Act
        let result = extract_yt_initial_player_response(sample_html);

        // Assert
        assert!(result.is_some());
        let val = result.unwrap();
        assert_eq!(
            val["microformat"]["playerMicroformatRenderer"]["ownerChannelName"],
            "CazéTV"
        );
        assert_eq!(
            val["microformat"]["playerMicroformatRenderer"]["ownerProfileUrl"],
            "http://www.youtube.com/@CazeTV"
        );
    }

    #[test]
    fn should_extract_yt_initial_player_response_with_trailing_inline_js() {
        // Arrange
        let sample_html = r#"
            <!DOCTYPE html>
            <html>
                <head>
                    <script>
                        var ytInitialPlayerResponse = {"videoDetails":{"videoId":"3L8SVq0UMR4","isLive":true}};var meta = document.createElement('meta');
                    </script>
                </head>
            </html>
        "#;

        // Act
        let result = extract_yt_initial_player_response(sample_html);

        // Assert
        assert!(result.is_some());
        let val = result.unwrap();
        assert_eq!(val["videoDetails"]["videoId"], "3L8SVq0UMR4");
        assert_eq!(val["videoDetails"]["isLive"], true);
    }

    #[test]
    fn should_extract_channels_from_search_results() {
        // Arrange
        let json_data = serde_json::json!({
            "contents": {
                "twoColumnSearchResultsRenderer": {
                    "primaryContents": {
                        "sectionListRenderer": {
                            "contents": [
                                {
                                    "itemSectionRenderer": {
                                        "contents": [
                                            {
                                                "channelRenderer": {
                                                    "channelId": "UC12345",
                                                    "title": { "simpleText": "Batzera" },
                                                    "navigationEndpoint": {
                                                        "browseEndpoint": {
                                                            "canonicalBaseUrl": "/@batzera1"
                                                        }
                                                    },
                                                    "subscriberCountText": {
                                                        "simpleText": "150 mil inscritos"
                                                    },
                                                    "badges": [
                                                        {
                                                            "metadataBadgeRenderer": {
                                                                "label": "AO VIVO"
                                                            }
                                                        }
                                                    ],
                                                    "thumbnail": {
                                                        "thumbnails": [
                                                            { "url": "https://yt3.ggpht.com/avatar.jpg" }
                                                        ]
                                                    }
                                                }
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    }
                }
            }
        });

        // Act
        let results = extract_channel_search_results(&json_data, 5);

        // Assert
        assert_eq!(results.len(), 1);
        let res = &results[0];
        assert_eq!(res.channel, "batzera1");
        assert_eq!(res.display_name.as_deref(), Some("Batzera"));
        assert!(res.is_live);
        assert_eq!(res.category.as_deref(), Some("150 mil inscritos"));
        assert_eq!(
            res.avatar_url.as_deref(),
            Some("https://yt3.ggpht.com/avatar.jpg")
        );
    }

    #[test]
    fn should_not_consider_video_with_length_text_as_live() {
        // Arrange
        let vod_renderer = serde_json::json!({
            "videoId": "vod999",
            "title": { "runs": [{ "text": "SBT Notícias Ontem" }] },
            "lengthText": { "simpleText": "1:15:30" },
            "badges": [
                {
                    "metadataBadgeRenderer": {
                        "style": "BADGE_STYLE_TYPE_LIVE_NOW",
                        "label": "AO VIVO"
                    }
                }
            ]
        });

        // Act
        let stream = parse_single_video_renderer(&vod_renderer);

        // Assert
        assert!(stream.is_none());
    }

    #[test]
    fn should_not_consider_upcoming_event_as_live() {
        // Arrange
        let upcoming_renderer = serde_json::json!({
            "videoId": "upcoming123",
            "title": { "runs": [{ "text": "Waiting Room" }] },
            "upcomingEventData": {
                "startTime": "1800000000"
            },
            "thumbnailOverlays": [
                {
                    "thumbnailOverlayTimeStatusRenderer": {
                        "style": "LIVE",
                        "text": { "runs": [{ "text": "LIVE" }] }
                    }
                }
            ]
        });

        // Act
        let stream = parse_single_video_renderer(&upcoming_renderer);

        // Assert
        assert!(stream.is_none());
    }

    #[test]
    fn should_not_use_cumulative_viewcount_text_as_concurrent_viewers() {
        // Arrange
        let renderer = serde_json::json!({
            "videoId": "live123",
            "title": { "runs": [{ "text": "Live Stream" }] },
            "viewCountText": { "runs": [{ "text": "1.2M views" }] },
            "thumbnailOverlays": [
                {
                    "thumbnailOverlayTimeStatusRenderer": {
                        "style": "LIVE",
                        "text": { "runs": [{ "text": "LIVE" }] }
                    }
                }
            ]
        });

        // Act
        let stream = parse_single_video_renderer(&renderer);

        // Assert
        assert!(stream.is_some());
        let val = stream.unwrap();
        assert_eq!(val.viewer_count, 0);
    }

    #[test]
    fn should_parse_live_lockup_view_model_correctly() {
        // Arrange
        let lockup = serde_json::json!({
            "contentId": "B-HPksUoZYI",
            "contentType": "LOCKUP_CONTENT_TYPE_VIDEO",
            "contentImage": {
                "thumbnailViewModel": {
                    "image": {
                        "sources": [
                            { "url": "https://i.ytimg.com/vi/B-HPksUoZYI/hqdefault.jpg" }
                        ]
                    },
                    "overlays": [
                        {
                            "thumbnailOverlayTimeStatusRenderer": {
                                "style": "LIVE",
                                "text": { "runs": [{ "text": "AO VIVO" }] }
                            }
                        }
                    ]
                }
            },
            "metadata": {
                "lockupMetadataViewModel": {
                    "title": { "content": "VASCO X FLAMENGO AO VIVO" },
                    "metadataRows": [
                        {
                            "metadataRowRenderer": {
                                "contents": [{ "runs": [{ "text": "150.000 assistindo" }] }]
                            }
                        }
                    ]
                }
            }
        });

        // Act
        let stream = parse_lockup_view_model(&lockup);

        // Assert
        assert!(stream.is_some());
        let stream = stream.unwrap();
        assert_eq!(stream.channel, "B-HPksUoZYI");
        assert_eq!(stream.title, "VASCO X FLAMENGO AO VIVO");
        assert_eq!(stream.viewer_count, 150000);
        assert_eq!(
            stream.thumbnail.as_deref(),
            Some("https://i.ytimg.com/vi/B-HPksUoZYI/hqdefault.jpg")
        );
    }

    #[test]
    fn should_reject_vod_lockup_view_model_with_duration() {
        // Arrange
        let vod_lockup = serde_json::json!({
            "contentId": "pastVod1234",
            "contentImage": {
                "thumbnailViewModel": {
                    "overlays": [
                        {
                            "thumbnailOverlayTimeStatusRenderer": {
                                "style": "DEFAULT",
                                "text": { "runs": [{ "text": "1:23:45" }] }
                            }
                        }
                    ]
                }
            },
            "metadata": {
                "lockupMetadataViewModel": {
                    "title": { "content": "VOD Passado" }
                }
            }
        });

        // Act
        let stream = parse_lockup_view_model(&vod_lockup);

        // Assert
        assert!(stream.is_none());
    }

    #[test]
    fn should_extract_multiple_concurrent_live_streams_from_initial_data_with_lockup_view_models() {
        // Arrange
        let json_data = serde_json::json!({
            "contents": {
                "twoColumnBrowseResultsRenderer": {
                    "tabs": [
                        {
                            "tabRenderer": {
                                "content": {
                                    "richGridRenderer": {
                                        "contents": [
                                            {
                                                "richItemRenderer": {
                                                    "content": {
                                                        "lockupViewModel": {
                                                            "contentId": "stream11111",
                                                            "contentImage": {
                                                                "thumbnailViewModel": {
                                                                    "overlays": [
                                                                        {
                                                                            "thumbnailOverlayTimeStatusRenderer": {
                                                                                "style": "LIVE",
                                                                                "text": { "runs": [{ "text": "LIVE" }] }
                                                                            }
                                                                        }
                                                                    ]
                                                                }
                                                            },
                                                            "metadata": {
                                                                "lockupMetadataViewModel": {
                                                                    "title": { "content": "Game 1 Live" },
                                                                    "metadataRows": [
                                                                        {
                                                                            "text": "10.000 watching"
                                                                        }
                                                                    ]
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            },
                                            {
                                                "richItemRenderer": {
                                                    "content": {
                                                        "lockupViewModel": {
                                                            "contentId": "stream22222",
                                                            "contentImage": {
                                                                "thumbnailViewModel": {
                                                                    "overlays": [
                                                                        {
                                                                            "thumbnailOverlayTimeStatusRenderer": {
                                                                                "style": "LIVE",
                                                                                "text": { "runs": [{ "text": "LIVE" }] }
                                                                            }
                                                                        }
                                                                    ]
                                                                }
                                                            },
                                                            "metadata": {
                                                                "lockupMetadataViewModel": {
                                                                    "title": { "content": "Game 2 Live" },
                                                                    "metadataRows": [
                                                                        {
                                                                            "text": "25.000 assistindo"
                                                                        }
                                                                    ]
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            },
                                            {
                                                "richItemRenderer": {
                                                    "content": {
                                                        "lockupViewModel": {
                                                            "contentId": "pastVod5555",
                                                            "contentImage": {
                                                                "thumbnailViewModel": {
                                                                    "overlays": [
                                                                        {
                                                                            "thumbnailOverlayTimeStatusRenderer": {
                                                                                "style": "DEFAULT",
                                                                                "text": { "runs": [{ "text": "45:10" }] }
                                                                            }
                                                                        }
                                                                    ]
                                                                }
                                                            },
                                                            "metadata": {
                                                                "lockupMetadataViewModel": {
                                                                    "title": { "content": "Old Broadcast VOD" }
                                                                }
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
                    ]
                }
            }
        });

        // Act
        let streams = extract_live_streams_from_initial_data(&json_data, 10);

        // Assert
        assert_eq!(streams.len(), 2);
        assert_eq!(streams[0].channel, "stream11111");
        assert_eq!(streams[0].title, "Game 1 Live");
        assert_eq!(streams[0].viewer_count, 10000);

        assert_eq!(streams[1].channel, "stream22222");
        assert_eq!(streams[1].title, "Game 2 Live");
        assert_eq!(streams[1].viewer_count, 25000);
    }

    #[test]
    fn should_parse_live_lockup_view_model_with_metadata_parts() {
        // Arrange
        let lockup = serde_json::json!({
            "contentId": "3PFJ9SETS4M",
            "contentImage": {
                "thumbnailViewModel": {
                    "overlays": [
                        {
                            "thumbnailOverlayTimeStatusRenderer": {
                                "style": "LIVE",
                                "text": { "runs": [{ "text": "LIVE" }] }
                            }
                        }
                    ]
                }
            },
            "metadata": {
                "lockupMetadataViewModel": {
                    "title": { "content": "lofi house radio - lounge music to vibe/chill to" },
                    "metadata": {
                        "contentMetadataViewModel": {
                            "metadataRows": [
                                {
                                    "metadataParts": [
                                        {
                                            "text": {
                                                "content": "2.5K watching"
                                            }
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                }
            }
        });

        // Act
        let stream = parse_lockup_view_model(&lockup);

        // Assert
        assert!(stream.is_some());
        let stream = stream.unwrap();
        assert_eq!(stream.channel, "3PFJ9SETS4M");
        assert_eq!(
            stream.title,
            "lofi house radio - lounge music to vibe/chill to"
        );
        assert_eq!(stream.viewer_count, 2500);
    }

    #[test]
    fn should_parse_live_lockup_with_thumbnail_overlay_badge_view_model() {
        // Arrange
        let lockup = serde_json::json!({
            "contentId": "cazeLive123",
            "contentImage": {
                "thumbnailViewModel": {
                    "overlays": [
                        {
                            "thumbnailOverlayBadgeViewModel": {
                                "thumbnailBadgeViewModel": {
                                    "badgeStyle": "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE",
                                    "text": "AO VIVO"
                                }
                            }
                        }
                    ]
                }
            },
            "metadata": {
                "lockupMetadataViewModel": {
                    "title": { "runs": [{ "text": "CazéTV Live Transmission 2" }] },
                    "metadata": {
                        "contentMetadataViewModel": {
                            "metadataRows": [
                                {
                                    "metadataParts": [
                                        {
                                            "text": {
                                                "content": "45.000 assistindo"
                                            }
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                }
            }
        });

        // Act
        let stream = parse_lockup_view_model(&lockup);

        // Assert
        assert!(stream.is_some());
        let stream = stream.unwrap();
        assert_eq!(stream.channel, "cazeLive123");
        assert_eq!(stream.title, "CazéTV Live Transmission 2");
        assert_eq!(stream.viewer_count, 45000);
    }

    #[test]
    fn should_parse_live_lockup_with_is_live_flag_fallback() {
        // Arrange
        let lockup = serde_json::json!({
            "contentId": "cazeLive456",
            "isLive": true,
            "metadata": {
                "lockupMetadataViewModel": {
                    "title": { "simpleText": "CazéTV Concurrent Broadcast" }
                }
            }
        });

        // Act
        let is_live = is_live_lockup(&lockup);
        let stream = parse_lockup_view_model(&lockup);

        // Assert
        assert!(is_live);
        assert!(stream.is_some());
        let stream = stream.unwrap();
        assert_eq!(stream.channel, "cazeLive456");
        assert_eq!(stream.title, "CazéTV Concurrent Broadcast");
    }

    #[test]
    fn should_extract_multiple_concurrent_live_streams_from_initial_data() {
        // Arrange
        let json_data = serde_json::json!({
            "contents": {
                "twoColumnBrowseResultsRenderer": {
                    "tabs": [
                        {
                            "tabRenderer": {
                                "title": "Ao vivo",
                                "content": {
                                    "richGridRenderer": {
                                        "contents": [
                                            {
                                                "richItemRenderer": {
                                                    "content": {
                                                        "lockupViewModel": {
                                                            "contentId": "stream_one1",
                                                            "isLive": true,
                                                            "metadata": {
                                                                "lockupMetadataViewModel": {
                                                                    "title": { "content": "Broadcast One" }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            },
                                            {
                                                "richItemRenderer": {
                                                    "content": {
                                                        "lockupViewModel": {
                                                            "contentId": "stream_two2",
                                                            "contentImage": {
                                                                "thumbnailViewModel": {
                                                                    "overlays": [
                                                                        {
                                                                            "thumbnailOverlayBadgeViewModel": {
                                                                                "thumbnailBadgeViewModel": {
                                                                                    "badgeStyle": "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE",
                                                                                    "text": "AO VIVO"
                                                                                }
                                                                            }
                                                                        }
                                                                    ]
                                                                }
                                                            },
                                                            "metadata": {
                                                                "lockupMetadataViewModel": {
                                                                    "title": { "content": "Broadcast Two" }
                                                                }
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
                    ]
                }
            }
        });

        // Act
        let streams = extract_live_streams_from_initial_data(&json_data, 10);

        // Assert
        assert_eq!(streams.len(), 2);
        assert_eq!(streams[0].channel, "stream_one1");
        assert_eq!(streams[1].channel, "stream_two2");
    }
}
