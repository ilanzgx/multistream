use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;

use serde::Serialize;
use tauri_plugin_shell::process::CommandChild;
use tokio::sync::Mutex;

use super::orphan::OrphanRecording;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RecordingStatus {
    #[allow(dead_code)]
    Starting,
    Recording,
    Stopping,
    Remuxing,
}

#[derive(Debug, Clone)]
pub enum StopReason {
    UserRequested,
    StreamEnded,
    #[allow(dead_code)]
    ProcessError,
}

#[derive(Debug)]
pub struct RecordingEntry {
    pub stream_id: String,
    pub platform: String,
    pub channel: String,
    pub status: RecordingStatus,
    pub temp_path: PathBuf,
    pub output_path: PathBuf,
    #[allow(dead_code)]
    pub started_at: Instant,
    pub streamlink_child: Arc<Mutex<Option<CommandChild>>>,
    pub stop_reason: Option<StopReason>,
}

pub struct RecordingManager {
    pub entries: Mutex<HashMap<String, RecordingEntry>>,
    pub orphans: Mutex<Vec<OrphanRecording>>,
}

impl RecordingManager {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            orphans: Mutex::new(Vec::new()),
        }
    }
}
