use std::fs;
use std::path::{Path, PathBuf};

use chrono::Local;

use super::error::RecordingError;

pub fn recording_dir() -> Result<PathBuf, RecordingError> {
    let videos = dirs::video_dir()
        .ok_or_else(|| RecordingError::PathError("cannot resolve video directory".into()))?;
    let now = Local::now();
    let dir = videos
        .join("Multistream")
        .join(now.format("%Y").to_string())
        .join(now.format("%m").to_string());
    fs::create_dir_all(&dir)
        .map_err(|e| RecordingError::PathError(format!("cannot create recording dir: {e}")))?;
    Ok(dir)
}

pub fn temp_path(platform: &str, channel: &str) -> Result<PathBuf, RecordingError> {
    let dir = recording_dir()?;
    let now = Local::now();
    let stem = format!("{}_{}_{}", platform, channel, now.format("%Y-%m-%d_%H-%M-%S"));
    Ok(dir.join(format!("{stem}.ts")))
}

pub fn final_path(temp: &Path) -> PathBuf {
    temp.with_extension("mp4")
}

pub fn orphan_scan_root() -> Option<PathBuf> {
    dirs::video_dir().map(|v| v.join("Multistream"))
}
