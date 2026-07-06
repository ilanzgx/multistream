use std::path::Path;

pub fn is_recording_supported() -> bool {
    cfg!(all(target_os = "windows", target_arch = "x86_64"))
}

pub fn streamlink_sidecar_name() -> &'static str {
    "streamlink"
}

pub fn ffmpeg_sidecar_name() -> &'static str {
    "ffmpeg"
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
    vec![
        url.to_string(),
        quality.to_string(),
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
