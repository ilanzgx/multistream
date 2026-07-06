use std::fs;

use serde::Serialize;
use uuid::Uuid;

use super::paths::orphan_scan_root;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrphanRecording {
    pub id: String,
    pub channel: String,
    pub filename: String,
    pub size_bytes: u64,
    pub full_path: std::path::PathBuf,
}

pub fn scan_orphans() -> Vec<OrphanRecording> {
    let Some(root) = orphan_scan_root() else {
        return Vec::new();
    };

    let mut orphans = Vec::new();
    collect_orphans(&root, &mut orphans);
    orphans
}

fn collect_orphans(dir: &std::path::Path, out: &mut Vec<OrphanRecording>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_dir() {
            collect_orphans(&path, out);
            continue;
        }
        if path.extension().and_then(|e| e.to_str()) != Some("ts") {
            continue;
        }
        let mp4 = path.with_extension("mp4");
        if mp4.exists() {
            continue;
        }

        let filename = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let channel = filename
            .split('_')
            .next()
            .unwrap_or("unknown")
            .to_string();

        let size_bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);

        out.push(OrphanRecording {
            id: Uuid::new_v4().to_string(),
            channel,
            filename,
            size_bytes,
            full_path: path,
        });
    }
}
