use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum RecordingError {
    #[error("Platform '{0}' is not supported for recording")]
    UnsupportedPlatform(String),
    #[error("Recording is not yet available on this operating system")]
    UnsupportedOs,
    #[error("Sidecar binary not found: {0}")]
    SidecarNotFound(String),
    #[error("Failed to spawn process: {0}")]
    SpawnFailed(String),
    #[error("A recording is already active for this stream")]
    AlreadyRecording,
    #[error("No active recording found for this stream")]
    NotRecording,
    #[error("Path error: {0}")]
    PathError(String),
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    #[error("Insufficient disk space: {0}")]
    DiskSpace(String),
}

impl Serialize for RecordingError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
