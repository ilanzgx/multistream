use std::fs;
use std::path::{Path, PathBuf};

use chrono::Local;

use super::error::RecordingError;

pub fn recording_dir(base_dir: Option<String>) -> Result<PathBuf, RecordingError> {
    let videos = match base_dir.filter(|s| !s.is_empty()) {
        Some(path) => PathBuf::from(path),
        None => dirs::video_dir()
            .ok_or_else(|| RecordingError::PathError("cannot resolve video directory".into()))?
            .join("Multistream"),
    };
    let now = Local::now();
    let dir = videos
        .join(now.format("%Y").to_string())
        .join(now.format("%m").to_string());
    fs::create_dir_all(&dir)
        .map_err(|e| RecordingError::PathError(format!("cannot create recording dir: {e}")))?;
    Ok(dir)
}

pub fn temp_path(
    platform: &str,
    channel: &str,
    base_dir: Option<String>,
) -> Result<PathBuf, RecordingError> {
    let dir = recording_dir(base_dir)?;
    let now = Local::now();
    let stem = format!(
        "{}_{}_{}",
        platform,
        channel,
        now.format("%Y-%m-%d_%H-%M-%S")
    );
    Ok(dir.join(format!("{stem}.ts")))
}

pub fn final_path(temp: &Path) -> PathBuf {
    temp.with_extension("mp4")
}

pub fn orphan_scan_root(base_dir: Option<String>) -> Option<PathBuf> {
    match base_dir.filter(|s| !s.is_empty()) {
        Some(path) => Some(PathBuf::from(path)),
        None => dirs::video_dir().map(|v| v.join("Multistream")),
    }
}
