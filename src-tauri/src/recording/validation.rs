use super::error::RecordingError;

const ALLOWED_PLATFORMS: &[&str] = &["twitch", "kick", "youtube"];

const ALLOWED_QUALITY_PREFIXES: &[&str] = &[
    "best", "worst", "1080p", "720p", "480p", "360p", "audio_only",
];

pub fn validate_channel(channel: &str) -> Result<&str, RecordingError> {
    if channel.is_empty() || channel.len() > 64 {
        return Err(RecordingError::InvalidInput(
            "channel must be 1–64 characters".into(),
        ));
    }
    if !channel
        .chars()
        .all(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '.'))
    {
        return Err(RecordingError::InvalidInput(
            "channel contains invalid characters".into(),
        ));
    }
    Ok(channel)
}

pub fn validate_platform(platform: &str) -> Result<&str, RecordingError> {
    if ALLOWED_PLATFORMS.contains(&platform) {
        Ok(platform)
    } else {
        Err(RecordingError::UnsupportedPlatform(platform.to_string()))
    }
}

pub fn validate_quality(quality: &str) -> Result<&str, RecordingError> {
    if ALLOWED_QUALITY_PREFIXES
        .iter()
        .any(|prefix| quality == *prefix || quality.starts_with(prefix))
    {
        Ok(quality)
    } else {
        Err(RecordingError::InvalidInput(format!(
            "unsupported quality selector: {quality}"
        )))
    }
}

pub fn validate_stream_id(id: &str) -> Result<&str, RecordingError> {
    let is_valid_uuid = id.len() == 36
        && id.chars().enumerate().all(|(i, c)| {
            if matches!(i, 8 | 13 | 18 | 23) {
                c == '-'
            } else {
                c.is_ascii_hexdigit()
            }
        });

    if is_valid_uuid {
        Ok(id)
    } else {
        Err(RecordingError::InvalidInput(
            "stream_id must be a valid UUID".into(),
        ))
    }
}

pub fn validate_orphan_id(id: &str) -> Result<&str, RecordingError> {
    validate_stream_id(id)
}
