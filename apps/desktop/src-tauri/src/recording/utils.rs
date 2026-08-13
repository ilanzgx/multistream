use std::path::Path;

pub fn is_recording_supported() -> bool {
    cfg!(all(target_os = "windows", target_arch = "x86_64"))
}

pub fn build_stream_url(platform: &str, channel: &str) -> String {
    match platform {
        "twitch" => format!("https://twitch.tv/{channel}"),
        "kick" => format!("https://kick.com/{channel}"),
        "youtube" => format!("https://youtube.com/watch?v={channel}"),
        _ => unreachable!("platform must be validated before calling build_stream_url"),
    }
}

pub fn streamlink_args(url: &str, quality: &str, output: &Path) -> Vec<String> {
    let resolved_quality = match quality {
        "1080p" => "1080p60,1080p,1080p50,best",
        "720p" => "720p60,720p,720p50,best",
        "480p" => "480p,worst",
        "audio_only" => "audio_only,audio",
        _ => quality, // "best", "worst", etc.
    };

    vec![
        "-m".to_string(),
        "streamlink".to_string(),
        url.to_string(),
        resolved_quality.to_string(),
        "--output".to_string(),
        output.to_string_lossy().to_string(),
        "--force".to_string(),
        "--retry-streams".to_string(),
        "5".to_string(),
        "--retry-open".to_string(),
        "5".to_string(),
    ]
}

pub fn ffmpeg_remux_args(input: &Path, output: &Path) -> Vec<String> {
    vec![
        "-y".to_string(), // put -y at the beginning
        "-i".to_string(),
        input.to_string_lossy().to_string(),
        "-c".to_string(),
        "copy".to_string(),
        "-movflags".to_string(),
        "+faststart".to_string(),
        "-progress".to_string(),
        "pipe:1".to_string(),
        "-nostats".to_string(),
        output.to_string_lossy().to_string(),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn should_build_correct_stream_url() {
        assert_eq!(
            build_stream_url("twitch", "gaules"),
            "https://twitch.tv/gaules"
        );
        assert_eq!(build_stream_url("kick", "xqc"), "https://kick.com/xqc");
        assert_eq!(
            build_stream_url("youtube", "lofigirl"),
            "https://youtube.com/watch?v=lofigirl"
        );
    }

    #[test]
    fn should_build_streamlink_args_with_resolved_quality() {
        let path = PathBuf::from("output.ts");

        let args = streamlink_args("https://twitch.tv/test", "1080p", &path);

        // Assert streamlink module invocation
        assert_eq!(args[0], "-m");
        assert_eq!(args[1], "streamlink");

        // Assert URL and resolved quality
        assert_eq!(args[2], "https://twitch.tv/test");
        assert_eq!(args[3], "1080p60,1080p,1080p50,best");

        // Assert output path and flags
        assert_eq!(args[4], "--output");
        assert_eq!(args[5], "output.ts");
        assert!(args.contains(&"--force".to_string()));
    }

    #[test]
    fn should_build_ffmpeg_remux_args() {
        let input = PathBuf::from("in.ts");
        let output = PathBuf::from("out.mp4");

        let args = ffmpeg_remux_args(&input, &output);

        assert_eq!(args[0], "-y");
        assert_eq!(args[1], "-i");
        assert_eq!(args[2], "in.ts");
        assert_eq!(args[3], "-c");
        assert_eq!(args[4], "copy");
        assert_eq!(args[5], "-movflags");
        assert_eq!(args[6], "+faststart");

        // Output must be the last argument
        assert_eq!(args.last().unwrap(), "out.mp4");
    }
}
