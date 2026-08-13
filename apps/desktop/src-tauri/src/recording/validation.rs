use super::error::RecordingError;

const ALLOWED_PLATFORMS: &[&str] = &["twitch", "kick", "youtube"];

const ALLOWED_QUALITIES: &[&str] = &[
    "best",
    "worst",
    "1080p",
    "720p",
    "480p",
    "360p",
    "audio_only",
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
    if ALLOWED_QUALITIES.contains(&quality) {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_validate_correct_channel_name() {
        // Arrange
        let valid_channel = "gaules";
        let valid_channel_with_chars = "some_user-123.ttv";

        // Act & Assert
        assert!(validate_channel(valid_channel).is_ok());
        assert!(validate_channel(valid_channel_with_chars).is_ok());
    }

    #[test]
    fn should_reject_invalid_channel_names() {
        // Arrange
        let empty_channel = "";
        let too_long_channel = "a".repeat(65);
        let malicious_channel1 = "ninja; rm -rf /";
        let malicious_channel2 = "user&whoami";
        let malicious_channel3 = "user|ls";

        // Act & Assert
        assert!(validate_channel(empty_channel).is_err());
        assert!(validate_channel(&too_long_channel).is_err());
        assert!(validate_channel(malicious_channel1).is_err());
        assert!(validate_channel(malicious_channel2).is_err());
        assert!(validate_channel(malicious_channel3).is_err());
    }

    #[test]
    fn should_validate_supported_platforms() {
        // Arrange
        let platforms = vec!["twitch", "kick", "youtube"];

        // Act & Assert
        for p in platforms {
            assert!(validate_platform(p).is_ok());
        }
    }

    #[test]
    fn should_reject_unsupported_platforms() {
        // Arrange
        let platforms = vec!["facebook", "tiktok", "rumble"];

        // Act & Assert
        for p in platforms {
            assert!(validate_platform(p).is_err());
        }
    }

    #[test]
    fn should_validate_supported_qualities() {
        // Arrange
        let valid_qualities = vec![
            "best",
            "worst",
            "1080p",
            "720p",
            "480p",
            "360p",
            "audio_only",
        ];

        // Act & Assert
        for q in valid_qualities {
            assert!(validate_quality(q).is_ok());
        }
    }

    #[test]
    fn should_reject_unsupported_qualities() {
        // Arrange
        let invalid_qualities = vec!["4k", "1080p60", "source", ""];

        // Act & Assert
        for q in invalid_qualities {
            assert!(validate_quality(q).is_err());
        }
    }

    #[test]
    fn should_validate_correct_uuids() {
        // Arrange
        let valid_uuid = "123e4567-e89b-12d3-a456-426614174000";

        // Act & Assert
        assert!(validate_stream_id(valid_uuid).is_ok());
    }

    #[test]
    fn should_reject_invalid_uuids() {
        // Arrange
        let invalid_length = "123e4567-e89b-12d3-a456-42661417400";
        let invalid_chars = "123e4567-e89b-12d3-a456-42661417400g";
        let invalid_format = "123e4567_e89b_12d3_a456_426614174000";

        // Act & Assert
        assert!(validate_stream_id(invalid_length).is_err());
        assert!(validate_stream_id(invalid_chars).is_err());
        assert!(validate_stream_id(invalid_format).is_err());
    }
}
