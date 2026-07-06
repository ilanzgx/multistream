use std::fs;
use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use super::disk::check_disk_space;
use super::error::RecordingError;
use super::orphan::OrphanRecording;
use super::paths::{final_path, temp_path};
use super::utils::{
    build_stream_url, ffmpeg_remux_args, is_recording_supported,
    streamlink_args,
};
use super::state::{RecordingEntry, RecordingManager, RecordingStatus, StopReason};
use super::validation::{
    validate_channel, validate_orphan_id, validate_platform, validate_quality, validate_stream_id,
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordingStartedPayload {
    stream_id: String,
    channel: String,
    platform: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordingIdPayload {
    stream_id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordingErrorPayload {
    stream_id: String,
    error: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordingStreamEndedPayload {
    stream_id: String,
    channel: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingInfo {
    stream_id: String,
    channel: String,
    platform: String,
    status: RecordingStatus,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OrphansFoundPayload {
    orphans: Vec<OrphanRecording>,
}

#[tauri::command]
pub async fn start_recording(
    app: AppHandle,
    state: State<'_, RecordingManager>,
    stream_id: String,
    channel: String,
    platform: String,
    quality: String,
) -> Result<(), RecordingError> {
    validate_stream_id(&stream_id)?;
    validate_channel(&channel)?;
    validate_platform(&platform)?;
    validate_quality(&quality)?;

    if !is_recording_supported() {
        return Err(RecordingError::UnsupportedOs);
    }

    {
        let entries = state.entries.lock().await;
        if entries.contains_key(&stream_id) {
            return Err(RecordingError::AlreadyRecording);
        }
    }

    let ts_path = temp_path(&channel)?;
    check_disk_space(ts_path.parent().unwrap_or(&ts_path))?;
    let mp4_path = final_path(&ts_path);

    let url = build_stream_url(&platform, &channel);
    let args = streamlink_args(&url, &quality, &ts_path);

    let python_exe = crate::recording::installer::get_python_exe(&app);
    let (mut rx, child) = app
        .shell()
        .command(python_exe.to_string_lossy().to_string())
        .args(&args)
        .spawn()
        .map_err(|e| RecordingError::SpawnFailed(e.to_string()))?;

    let child_arc = Arc::new(tokio::sync::Mutex::new(Some(child)));

    {
        let mut entries = state.entries.lock().await;
        entries.insert(
            stream_id.clone(),
            RecordingEntry {
                stream_id: stream_id.clone(),
                platform: platform.clone(),
                channel: channel.clone(),
                status: RecordingStatus::Recording,
                temp_path: ts_path.clone(),
                output_path: mp4_path.clone(),
                started_at: std::time::Instant::now(),
                streamlink_child: child_arc.clone(),
                stop_reason: None,
            },
        );
    }

    let _ = app.emit(
        "recording:started",
        RecordingStartedPayload {
            stream_id: stream_id.clone(),
            channel: channel.clone(),
            platform: platform.clone(),
        },
    );

    let app_clone = app.clone();
    let sid = stream_id.clone();
    let ch = channel.clone();
    tokio::spawn(async move {
        let mut exit_code: Option<i32> = None;
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Terminated(payload) = event {
                exit_code = payload.code;
                break;
            }
        }

        let state_ref = app_clone.state::<RecordingManager>();
        let stop_reason = {
            let entries = state_ref.entries.lock().await;
            entries
                .get(&sid)
                .and_then(|e| e.stop_reason.clone())
                .unwrap_or(StopReason::StreamEnded)
        };

        let is_user_stop = matches!(stop_reason, StopReason::UserRequested);

        if !is_user_stop {
            let clean_exit = exit_code == Some(0);
            if clean_exit {
                let _ = app_clone.emit(
                    "recording:stream-ended",
                    RecordingStreamEndedPayload {
                        stream_id: sid.clone(),
                        channel: ch.clone(),
                    },
                );
            } else {
                let _ = app_clone.emit(
                    "recording:error",
                    RecordingErrorPayload {
                        stream_id: sid.clone(),
                        error: "Streamlink process exited unexpectedly".into(),
                    },
                );
            }
        }
        run_remux(app_clone, sid).await;
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_recording(
    app: AppHandle,
    state: State<'_, RecordingManager>,
    stream_id: String,
) -> Result<(), RecordingError> {
    validate_stream_id(&stream_id)?;

    let child_arc = {
        let mut entries = state.entries.lock().await;
        let entry = entries
            .get_mut(&stream_id)
            .ok_or(RecordingError::NotRecording)?;
        entry.status = RecordingStatus::Stopping;
        entry.stop_reason = Some(StopReason::UserRequested);
        Arc::clone(&entry.streamlink_child)
    };

    {
        let mut guard = child_arc.lock().await;
        if let Some(child) = guard.take() {
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                let pid = child.pid();
                let _ = std::process::Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .creation_flags(0x08000000)
                    .spawn()
                    .and_then(|mut c| c.wait());
            }
            let _ = child.kill();
        }
    }

    let _ = app.emit(
        "recording:stopping",
        RecordingIdPayload {
            stream_id: stream_id.clone(),
        },
    );

    Ok(())
}

#[tauri::command]
pub async fn is_recording(
    state: State<'_, RecordingManager>,
    stream_id: String,
) -> Result<bool, RecordingError> {
    validate_stream_id(&stream_id)?;
    let entries = state.entries.lock().await;
    Ok(entries
        .get(&stream_id)
        .map(|e| matches!(e.status, RecordingStatus::Recording | RecordingStatus::Starting))
        .unwrap_or(false))
}

#[tauri::command]
pub async fn list_recordings(
    state: State<'_, RecordingManager>,
) -> Result<Vec<RecordingInfo>, RecordingError> {
    let entries = state.entries.lock().await;
    Ok(entries
        .values()
        .map(|e| RecordingInfo {
            stream_id: e.stream_id.clone(),
            channel: e.channel.clone(),
            platform: e.platform.clone(),
            status: e.status.clone(),
        })
        .collect())
}

#[tauri::command]
pub async fn open_recording_folder(
    app: AppHandle,
    _stream_id: String,
) -> Result<(), RecordingError> {
    use tauri_plugin_opener::OpenerExt;
    let folder = super::paths::recording_dir()?;
    app.opener()
        .open_path(folder.to_string_lossy().to_string(), None::<String>)
        .map_err(|e| RecordingError::SpawnFailed(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn recover_orphan_recording(
    app: AppHandle,
    state: State<'_, RecordingManager>,
    orphan_id: String,
) -> Result<(), RecordingError> {
    validate_orphan_id(&orphan_id)?;

    let orphan = {
        let orphans = state.orphans.lock().await;
        orphans
            .iter()
            .find(|o| o.id == orphan_id)
            .cloned()
            .ok_or(RecordingError::NotRecording)?
    };

    let ts_path = orphan.full_path.clone();
    let mp4_path = final_path(&ts_path);

    let _ = app.emit(
        "recording:remux-started",
        RecordingIdPayload {
            stream_id: orphan_id.clone(),
        },
    );

    let app_clone = app.clone();
    let oid = orphan_id.clone();
    tokio::spawn(async move {
        let result = run_ffmpeg_remux(&app_clone, &ts_path, &mp4_path).await;
        match result {
            Ok(()) => {
                let _ = fs::remove_file(&ts_path);
                let _ = app_clone.emit(
                    "recording:remux-finished",
                    RecordingIdPayload {
                        stream_id: oid.clone(),
                    },
                );
            }
            Err(e) => {
                let _ = app_clone.emit(
                    "recording:remux-failed",
                    RecordingErrorPayload {
                        stream_id: oid.clone(),
                        error: e.to_string(),
                    },
                );
            }
        }
        let state_ref = app_clone.state::<RecordingManager>();
        let mut orphans = state_ref.orphans.lock().await;
        orphans.retain(|o| o.id != oid);
    });

    Ok(())
}

#[tauri::command]
pub async fn dismiss_orphan_recording(
    state: State<'_, RecordingManager>,
    orphan_id: String,
) -> Result<(), RecordingError> {
    validate_orphan_id(&orphan_id)?;
    let mut orphans = state.orphans.lock().await;
    orphans.retain(|o| o.id != orphan_id);
    Ok(())
}

#[tauri::command]
pub fn is_recording_supported_cmd() -> bool {
    is_recording_supported()
}

pub async fn emit_orphans_if_any(app: &AppHandle) {
    let state = app.state::<RecordingManager>();
    let orphans = super::orphan::scan_orphans();
    if orphans.is_empty() {
        return;
    }
    {
        let mut guard = state.orphans.lock().await;
        *guard = orphans.clone();
    }
    let _ = app.emit("recording:orphans-found", OrphansFoundPayload { orphans });
}

pub async fn shutdown_all_recordings(app: &AppHandle) {
    let state = app.state::<RecordingManager>();
    let stream_ids: Vec<String> = {
        let mut entries = state.entries.lock().await;
        entries
            .values_mut()
            .filter(|e| {
                matches!(
                    e.status,
                    RecordingStatus::Recording | RecordingStatus::Starting
                )
            })
            .map(|e| {
                e.stop_reason = Some(StopReason::UserRequested);
                e.status = RecordingStatus::Stopping;
                e.stream_id.clone()
            })
            .collect()
    };

    let mut kill_futs = Vec::new();
    for sid in &stream_ids {
        let entries = state.entries.lock().await;
        if let Some(entry) = entries.get(sid) {
            let child_arc = Arc::clone(&entry.streamlink_child);
            kill_futs.push(async move {
                let mut guard = child_arc.lock().await;
                if let Some(child) = guard.take() {
                    #[cfg(target_os = "windows")]
                    {
                        use std::os::windows::process::CommandExt;
                        let pid = child.pid();
                        let _ = std::process::Command::new("taskkill")
                            .args(["/F", "/T", "/PID", &pid.to_string()])
                            .creation_flags(0x08000000)
                            .spawn()
                            .and_then(|mut c| c.wait());
                    }
                    let _ = child.kill();
                }
            });
        }
    }
    futures_util::future::join_all(kill_futs).await;

    // Wait for the background tasks to finish remuxing and remove the entries
    let start_time = std::time::Instant::now();
    loop {
        if start_time.elapsed() > Duration::from_secs(30) {
            break;
        }
        let entries = state.entries.lock().await;
        let mut all_done = true;
        for sid in &stream_ids {
            if entries.contains_key(sid) {
                all_done = false;
                break;
            }
        }
        if all_done {
            break;
        }
        drop(entries);
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}

async fn run_remux(app: AppHandle, stream_id: String) {
    let state = app.state::<RecordingManager>();

    let (ts_path, mp4_path) = {
        let mut entries = state.entries.lock().await;
        let Some(entry) = entries.get_mut(&stream_id) else {
            return;
        };
        entry.status = RecordingStatus::Remuxing;
        (entry.temp_path.clone(), entry.output_path.clone())
    };

    if std::fs::metadata(&ts_path).map(|m| m.len()).unwrap_or(0) == 0 {
        let _ = std::fs::remove_file(&ts_path);
        let mut entries = state.entries.lock().await;
        entries.remove(&stream_id);
        let _ = app.emit(
            "recording:error",
            RecordingErrorPayload {
                stream_id: stream_id.clone(),
                error: "Stream ended before any video was recorded.".into(),
            },
        );
        return;
    }

    let _ = app.emit(
        "recording:remux-started",
        RecordingIdPayload {
            stream_id: stream_id.clone(),
        },
    );

    match run_ffmpeg_remux(&app, &ts_path, &mp4_path).await {
        Ok(()) => {
            for i in 0..5 {
                if std::fs::remove_file(&ts_path).is_ok() {
                    break;
                }
                if i == 4 {
                    eprintln!("Failed to remove temporary .ts file after retries");
                }
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            }
            let mut entries = state.entries.lock().await;
            entries.remove(&stream_id);
            let _ = app.emit(
                "recording:remux-finished",
                RecordingIdPayload {
                    stream_id: stream_id.clone(),
                },
            );
        }
        Err(e) => {
            let mut entries = state.entries.lock().await;
            entries.remove(&stream_id);
            let _ = app.emit(
                "recording:remux-failed",
                RecordingErrorPayload {
                    stream_id: stream_id.clone(),
                    error: e.to_string(),
                },
            );
        }
    }
}

async fn run_ffmpeg_remux(
    app: &AppHandle,
    ts_path: &std::path::Path,
    mp4_path: &std::path::Path,
) -> Result<(), RecordingError> {
    let ffmpeg_exe = crate::recording::installer::get_ffmpeg_exe(app);
    let args = ffmpeg_remux_args(ts_path, mp4_path);
    let (mut rx, _child) = app
        .shell()
        .command(ffmpeg_exe.to_string_lossy().to_string())
        .args(&args)
        .spawn()
        .map_err(|e| RecordingError::SpawnFailed(e.to_string()))?;

    while let Some(event) = rx.recv().await {
        if let CommandEvent::Terminated(payload) = event {
            return if payload.code == Some(0) {
                Ok(())
            } else {
                Err(RecordingError::SpawnFailed(format!(
                    "ffmpeg exited with code {:?}",
                    payload.code
                )))
            };
        }
    }

    Ok(())
}
