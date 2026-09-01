use super::types::YouTubeSuggestedStream;
use serde_json::Value;

pub fn extract_yt_initial_data(html: &str) -> Option<Value> {
    let patterns = [
        "var ytInitialData = ",
        "window[\"ytInitialData\"] = ",
        "ytInitialData = ",
    ];

    for pattern in patterns {
        if let Some(start_pos) = html.find(pattern) {
            let json_start = start_pos + pattern.len();
            let slice = &html[json_start..];

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
    let normalized = text.to_lowercase();

    let without_thousands = normalized
        .replace("milhões", "")
        .replace("million", "")
        .replace("mil", "")
        .replace("тыс", "")
        .replace("tsd", "");

    let has_m = without_thousands.contains('m')
        || without_thousands.contains("mi")
        || without_thousands.contains("млн");

    let is_million = normalized.contains("milhões") || normalized.contains("million") || has_m;
    let is_ten_thousand = !is_million && normalized.contains('万');
    let is_thousand = !is_million
        && !is_ten_thousand
        && (normalized.contains('k')
            || normalized.contains("mil")
            || normalized.contains("тыс")
            || normalized.contains("tsd"));

    let mut num_str = String::new();
    for c in normalized.chars() {
        if c.is_ascii_digit() || c == '.' || c == ',' {
            num_str.push(c);
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
        if lower.contains("watching")
            || lower.contains("assistindo")
            || lower.contains("mirando")
            || lower.contains("zuschauer")
            || lower.contains("зрител")
        {
            return true;
        }
    }

    false
}

fn get_text_from_node(node: Option<&Value>) -> Option<String> {
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

    let channel_name = get_text_from_node(renderer.get("ownerText"))
        .or_else(|| get_text_from_node(renderer.get("shortBylineText")))
        .unwrap_or_else(|| "YouTube".to_string());

    let viewer_count = get_text_from_node(renderer.get("viewCountText"))
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
                if let Some(renderer) = map.get("videoRenderer") {
                    if let Some(stream) = parse_single_video_renderer(renderer) {
                        if !seen_ids.contains(&stream.channel) {
                            seen_ids.insert(stream.channel.clone());
                            results.push(stream);
                        }
                    }
                } else if let Some(renderer) = map.get("compactVideoRenderer") {
                    if let Some(stream) = parse_single_video_renderer(renderer) {
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
}
