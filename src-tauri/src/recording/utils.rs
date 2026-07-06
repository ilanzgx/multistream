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
        "-i".to_string(),
        input.to_string_lossy().to_string(),
        "-c".to_string(),
        "copy".to_string(),
        "-movflags".to_string(),
        "+faststart".to_string(),
        output.to_string_lossy().to_string(),
        "-y".to_string(),
    ]
}
