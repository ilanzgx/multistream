use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::ShellExt;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Payload emitted on the `transcription:download-progress` event.
#[derive(Clone, Serialize, Deserialize)]
pub struct DownloadProgressPayload {
    pub downloaded: u64,
    pub total: u64,
    pub percent: f32,
}

/// Payload emitted on the `transcription:text` event.
#[derive(Clone, Serialize, Deserialize)]
pub struct TranscriptionTextPayload {
    pub text: String,
    pub timestamp: u64,
}

/// Live handle to a running transcription session.
/// The `running` flag is shared with the background thread so that
/// `stop_transcription` can gracefully terminate it.
pub struct TranscriptionHandle {
    pub running: Arc<AtomicBool>,
    pub thread: Option<std::thread::JoinHandle<()>>,
    pub sidecar_child: Arc<Mutex<Option<tauri_plugin_shell::process::CommandChild>>>,
}

/// Tauri-managed state that holds an optional running transcription handle.
/// Using `Mutex<Option<...>>` makes start/stop idempotent and thread-safe.
pub struct TranscriptionState(pub Mutex<Option<TranscriptionHandle>>);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Returns the path to the `whisper-models/` directory inside the Tauri
/// app-data directory, creating it if it does not exist.
fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;

    let dir = data_dir.join("whisper-models");
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create models dir: {e}"))?;
    Ok(dir)
}

/// Returns the expected file path for a given model name.
/// Format: `<app_data>/whisper-models/ggml-<model_name>.bin`
fn model_path(app: &AppHandle, model_name: &str) -> Result<PathBuf, String> {
    Ok(models_dir(app)?.join(format!("ggml-{model_name}.bin")))
}

/// Returns the current UNIX timestamp in milliseconds.
fn timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Downloads the GGML model file for the given model name from HuggingFace,
/// streaming it to disk while emitting `transcription:download-progress` events.
///
/// The file is saved to: `<app_data>/whisper-models/ggml-<model_name>.bin`
///
/// Supported model names: `tiny`, `base`, `small`
#[tauri::command]
pub async fn download_whisper_model(model_name: String, app: AppHandle) -> Result<(), String> {
    let url =
        format!("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{model_name}.bin");

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "download failed with HTTP {}: {}",
            response.status().as_u16(),
            response.status().canonical_reason().unwrap_or("unknown")
        ));
    }

    let total = response.content_length().unwrap_or(0);
    let dest_path = model_path(&app, &model_name)?;

    // Stream response body to disk, emitting progress events on each chunk.
    let mut downloaded: u64 = 0;
    let mut file_bytes: Vec<u8> = if total > 0 {
        Vec::with_capacity(total as usize)
    } else {
        Vec::new()
    };

    let mut stream = response.bytes_stream();
    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("stream error: {e}"))?;
        downloaded += chunk.len() as u64;
        file_bytes.extend_from_slice(&chunk);

        let percent = if total > 0 {
            (downloaded as f32 / total as f32) * 100.0
        } else {
            0.0
        };

        let _ = app.emit(
            "transcription:download-progress",
            DownloadProgressPayload {
                downloaded,
                total,
                percent,
            },
        );
    }

    fs::write(&dest_path, &file_bytes).map_err(|e| format!("failed to write model file: {e}"))?;

    Ok(())
}

/// Returns the current transcription status, including the list of installed
/// model names and whether a transcription session is currently active.
#[tauri::command]
pub fn get_transcription_status(
    app: AppHandle,
    state: State<'_, TranscriptionState>,
) -> Result<serde_json::Value, String> {
    let dir = models_dir(&app)?;

    // Collect model names from files matching `ggml-*.bin`
    let installed_models: Vec<String> = fs::read_dir(&dir)
        .map_err(|e| format!("failed to read models dir: {e}"))?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("ggml-") && name.ends_with(".bin") {
                // Extract the model name from `ggml-<name>.bin`
                let stripped = name
                    .strip_prefix("ggml-")
                    .and_then(|s| s.strip_suffix(".bin"))
                    .unwrap_or("")
                    .to_string();
                if stripped.is_empty() {
                    None
                } else {
                    Some(stripped)
                }
            } else {
                None
            }
        })
        .collect();

    let guard = state.0.lock().map_err(|_| "state lock poisoned")?;
    let active = guard
        .as_ref()
        .map(|h| h.running.load(Ordering::SeqCst))
        .unwrap_or(false);

    Ok(serde_json::json!({
        "installed_models": installed_models,
        "active": active,
    }))
}

/// Starts the transcription pipeline for the given model.
///
/// If a session is already active, it is stopped first (idempotent).
///
/// **Current implementation:** The audio capture and Whisper inference layers
/// are stubbed. The command spawns a background thread that emits a placeholder
/// `transcription:text` event every 5 seconds so the full frontend pipeline
/// (composable → overlay → event flow) can be validated end-to-end.
///
/// When `translate` is `true` the future real implementation will pass
/// `--translate` to the whisper.cpp sidecar, producing English output regardless
/// of the source language.
///
/// TODO(audio-capture): Replace the stub loop with:
///   1. cpal process-scoped WASAPI loopback capture
///   2. Resample PCM to 16 kHz mono f32
///   3. Write 5-second WAV chunks to a temp dir
///   4. Invoke the `whisper-main` sidecar with `--model`, `-f`, optionally
///      `--translate`, `--language auto`, `--no-timestamps`, `--no-prints`
///   5. Parse stdout and emit `transcription:text`
///   6. Delete the temp WAV file
#[tauri::command]
pub fn start_transcription(
    model_name: String,
    translate: bool,
    app: AppHandle,
    state: State<'_, TranscriptionState>,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "state lock poisoned")?;

    // Stop any existing session before starting a new one.
    if let Some(existing) = guard.take() {
        existing.running.store(false, Ordering::SeqCst);
        if let Some(thread) = existing.thread {
            let _ = thread.join();
        }
    }

    // Verify that the requested model file exists before starting.
    let path = model_path(&app, &model_name)?;
    if !path.exists() {
        return Err(format!(
            "model '{model_name}' is not installed; download it first"
        ));
    }

    let running = Arc::new(AtomicBool::new(true));
    let running_clone = Arc::clone(&running);
    let app_clone = app.clone();
    let sidecar_child: Arc<Mutex<Option<tauri_plugin_shell::process::CommandChild>>> =
        Arc::new(Mutex::new(None));
    let sidecar_child_clone = Arc::clone(&sidecar_child);

    let thread = std::thread::spawn(move || {
        let session = match super::capture::start_loopback() {
            Ok(s) => s,
            Err(e) => {
                let _ = app_clone.emit(
                    "transcription:text",
                    TranscriptionTextPayload {
                        text: format!("[Error] Audio capture failed: {e}"),
                        timestamp: timestamp_ms(),
                    },
                );
                return;
            }
        };

        let temp_dir = app_clone
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("."))
            .join("whisper-models")
            .join("temp");
        let _ = std::fs::create_dir_all(&temp_dir);

        let target_sample_rate = 16000;
        let chunk_duration = 10;
        let samples_per_chunk = target_sample_rate * chunk_duration;
        let mut mono_16k_buffer = Vec::with_capacity(samples_per_chunk as usize);

        while running_clone.load(Ordering::SeqCst) {
            let mut new_samples = Vec::new();
            while let Ok(sample) = session.rx.try_recv() {
                new_samples.push(sample);
            }

            if new_samples.is_empty() {
                std::thread::sleep(std::time::Duration::from_millis(50));
                continue;
            }

            let mono = super::capture::to_mono(&new_samples, session.channels);
            let resampled =
                super::capture::resample_mono(&mono, session.sample_rate, target_sample_rate);
            mono_16k_buffer.extend(resampled);

            let backlog_duration = mono_16k_buffer.len() as f32 / target_sample_rate as f32;
            log::info!("Transcription backlog: {:.2}s", backlog_duration);

            if mono_16k_buffer.len() >= samples_per_chunk as usize {
                let chunk_samples = mono_16k_buffer
                    .drain(0..samples_per_chunk as usize)
                    .collect::<Vec<_>>();
                let wav_path = temp_dir.join(format!("chunk_{}.wav", timestamp_ms()));

                if let Err(e) = super::capture::write_wav(&wav_path, &chunk_samples) {
                    log::error!("Failed to write WAV: {}", e);
                    continue;
                }

                let model_path = match model_path(&app_clone, &model_name) {
                    Ok(p) => p,
                    Err(_) => continue,
                };

                let resource_dir = app_clone
                    .path()
                    .resource_dir()
                    .unwrap_or_default()
                    .join("binaries");
                let current_path = std::env::var("PATH").unwrap_or_default();
                let new_path = format!("{};{}", resource_dir.to_string_lossy(), current_path);

                let mut sidecar = app_clone
                    .shell()
                    .sidecar("whisper-cli")
                    .expect("failed to setup sidecar");
                sidecar = sidecar.env("PATH", new_path);
                sidecar = sidecar
                    .arg("-m")
                    .arg(model_path.to_string_lossy().to_string());
                sidecar = sidecar
                    .arg("-f")
                    .arg(wav_path.to_string_lossy().to_string());
                sidecar = sidecar.arg("-nt");
                sidecar = sidecar.arg("--no-prints");

                if translate {
                    sidecar = sidecar.arg("-tr");
                } else {
                    sidecar = sidecar.arg("-l").arg("auto");
                }

                let start_time = std::time::Instant::now();
                let (mut rx, child) = match sidecar.spawn() {
                    Ok(res) => res,
                    Err(e) => {
                        log::error!("Failed to spawn sidecar: {e}");
                        continue;
                    }
                };

                {
                    let mut child_guard = sidecar_child_clone.lock().unwrap();
                    *child_guard = Some(child);
                }

                let output = tauri::async_runtime::block_on(async move {
                    let mut stdout_acc = String::new();
                    let mut detected_lang = String::new();
                    while let Some(event) = rx.recv().await {
                        match event {
                            tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                                stdout_acc.push_str(&String::from_utf8_lossy(&line));
                            }
                            tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                                let stderr_str = String::from_utf8_lossy(&line);
                                if stderr_str.contains("Detected language:") {
                                    detected_lang = stderr_str.to_string();
                                }
                            }
                            _ => {}
                        }
                    }
                    if !detected_lang.is_empty() {
                        log::info!("Whisper {}", detected_lang.trim());
                    }
                    stdout_acc
                });

                let inference_duration = start_time.elapsed();
                log::info!("Whisper invocation (startup + inference) took: {:?}", inference_duration);

                {
                    let mut child_guard = sidecar_child_clone.lock().unwrap();
                    *child_guard = None;
                }

                let cleaned = output.trim();
                log::info!("Transcription output: {}", cleaned);
                if !cleaned.is_empty()
                    && !cleaned.contains("[BLANK_AUDIO]")
                    && !cleaned.starts_with("[_")
                {
                    let _ = app_clone.emit(
                        "transcription:text",
                        TranscriptionTextPayload {
                            text: cleaned.to_string(),
                            timestamp: timestamp_ms(),
                        },
                    );
                }

                let _ = std::fs::remove_file(wav_path);
            }
        }
    });

    *guard = Some(TranscriptionHandle {
        running,
        thread: Some(thread),
        sidecar_child,
    });

    Ok(())
}

/// Stops the active transcription session, if any.
///
/// Sets the shared `running` flag to `false` and joins the capture thread.
/// Calling this when no session is active is a safe no-op.
#[tauri::command]
pub fn stop_transcription(state: State<'_, TranscriptionState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "state lock poisoned")?;

    if let Some(handle) = guard.take() {
        handle.running.store(false, Ordering::SeqCst);

        if let Ok(mut child_guard) = handle.sidecar_child.lock() {
            if let Some(child) = child_guard.take() {
                let _ = child.kill();
            }
        }

        if let Some(thread) = handle.thread {
            let _ = thread.join();
        }
    }

    Ok(())
}
