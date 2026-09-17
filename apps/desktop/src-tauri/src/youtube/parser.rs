use super::types::{YouTubeSearchResult, YouTubeSuggestedStream};
use serde_json::Value;
use std::collections::HashSet;

pub fn extract_yt_initial_data(html: &str) -> Option<Value> {
    let patterns = [
        "var ytInitialData = ",
        "window[\"ytInitialData\"] = ",
        "ytInitialData = ",
    ];

    for pattern in patterns {
        if let Some(start_pos) = html.find(pattern) {
            let json_start = start_pos + pattern.len();
            let slice = html[json_start..].trim_start();

            if slice.starts_with('{') {
                let mut de = serde_json::Deserializer::from_str(slice).into_iter::<Value>();
                if let Some(Ok(val)) = de.next() {
                    return Some(val);
                }
            }

            let json_str = if let Some(end_pos) = slice.find(";</script>") {
                &slice[..end_pos]
            } else if let Some(end_pos) = slice.find("</script>") {
                slice[..end_pos].trim().trim_end_matches(';')
            } else {
                slice
            };

            if let Ok(parsed) = serde_json::from_str::<Value>(json_str) {
                return Some(parsed);
            }
        }
    }
    None
}

pub fn extract_yt_initial_player_response(html: &str) -> Option<Value> {
    let patterns = [
        "var ytInitialPlayerResponse = ",
        "window[\"ytInitialPlayerResponse\"] = ",
        "ytInitialPlayerResponse = ",
    ];

    for pattern in patterns {
        if let Some(start_pos) = html.find(pattern) {
            let json_start = start_pos + pattern.len();
            let slice = html[json_start..].trim_start();

            if slice.starts_with('{') {
                let mut de = serde_json::Deserializer::from_str(slice).into_iter::<Value>();
                if let Some(Ok(val)) = de.next() {
                    return Some(val);
                }
            }

            let json_str = if let Some(end_pos) = slice.find(";</script>") {
                &slice[..end_pos]
            } else if let Some(end_pos) = slice.find("</script>") {
                slice[..end_pos].trim().trim_end_matches(';')
            } else {
                slice
            };

            if let Ok(parsed) = serde_json::from_str::<Value>(json_str) {
                return Some(parsed);
            }
        }
    }
    None
}

pub fn parse_viewer_count(text: &str) -> u64 {
    let normalized = text.to_lowercase().replace(['\u{a0}', '\u{202f}'], " ");

    let is_ten_thousand = normalized.contains('万');
    let is_million = normalized.contains("milhões")
        || normalized.contains("million")
        || normalized.contains(" млн")
        || normalized.contains("m ")
        || normalized.ends_with('m')
        || normalized.contains("mi ");
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
    if let Some(simple) = node.get("simpleText").and_then(|s| s.as_str()) {
        return Some(simple.to_string());
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
                    }
                } else {
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
}
