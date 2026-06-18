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

impl Drop for TranscriptionHandle {
    fn drop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
        if let Ok(mut child_guard) = self.sidecar_child.lock() {
            if let Some(child) = child_guard.take() {
                let _ = child.kill();
            }
        }
    }
}

/// Tauri-managed state that holds an optional running transcription handle.
/// Using `Mutex<Option<...>>` makes start/stop idempotent and thread-safe.
pub struct TranscriptionState(pub Mutex<Option<TranscriptionHandle>>);

/// RAII guard to safely ensure temporary files are deleted when they go out of scope.
struct TempFileGuard {
    path: PathBuf,
    keep: bool,
}

impl Drop for TempFileGuard {
    fn drop(&mut self) {
        if !self.keep {
            let _ = fs::remove_file(&self.path);
        }
    }
}

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
    if !model_name
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Invalid model name".to_string());
    }
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

pub const TRANSCRIPTION_SUPPORTED: bool = cfg!(target_os = "windows");

#[tauri::command]
pub fn is_transcription_supported() -> bool {
    TRANSCRIPTION_SUPPORTED
}

/// Downloads the GGML model file for the given model name from HuggingFace,
/// streaming it to disk while emitting `transcription:download-progress` events.
///
/// The file is saved to: `<app_data>/whisper-models/ggml-<model_name>.bin`
///
/// Supported model names: `tiny`, `base`, `small`
#[tauri::command]
pub async fn download_whisper_model(model_name: String, app: AppHandle) -> Result<(), String> {
    if !TRANSCRIPTION_SUPPORTED {
        return Err("Live transcription is currently supported only on Windows".to_string());
    }

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

/// Deletes the GGML model file from disk.
#[tauri::command]
pub async fn delete_whisper_model(model_name: String, app: AppHandle) -> Result<(), String> {
    if !TRANSCRIPTION_SUPPORTED {
        return Err("Live transcription is currently supported only on Windows".to_string());
    }

    let dest_path = model_path(&app, &model_name)?;
    if dest_path.exists() {
        fs::remove_file(dest_path).map_err(|e| format!("failed to delete model file: {e}"))?;
    }
    Ok(())
}

/// Returns the current transcription status, including the list of installed
/// model names and whether a transcription session is currently active.
#[tauri::command]
pub fn get_transcription_status(
    app: AppHandle,
    state: State<'_, TranscriptionState>,
) -> Result<serde_json::Value, String> {
    if !TRANSCRIPTION_SUPPORTED {
        return Err("Live transcription is currently supported only on Windows".to_string());
    }

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
    if !TRANSCRIPTION_SUPPORTED {
        return Err("Live transcription is currently supported only on Windows".to_string());
    }

    let mut guard = state.0.lock().map_err(|_| "state lock poisoned")?;

    // Stop any existing session before starting a new one.
    if let Some(mut existing) = guard.take() {
        let thread = existing.thread.take();
        drop(existing); // This triggers the Drop trait to kill the child and set `running` to false

        if let Some(thread) = thread {
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

    let (tx_init, rx_init) = std::sync::mpsc::channel();

    let thread = std::thread::spawn(move || {
        let session = match super::capture::start_loopback() {
            Ok(s) => {
                let _ = tx_init.send(Ok(()));
                s
            }
            Err(e) => {
                let _ = tx_init.send(Err(format!("Audio capture failed: {e}")));
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
        let mut original_buffer = Vec::new();

        let max_backlog_samples = target_sample_rate * 15; // 15 seconds

        while running_clone.load(Ordering::SeqCst) {
            let mut new_samples = Vec::new();

            match session
                .rx
                .recv_timeout(std::time::Duration::from_millis(100))
            {
                Ok(sample) => {
                    new_samples.push(sample);
                    while let Ok(s) = session.rx.try_recv() {
                        new_samples.push(s);
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    log::error!("Audio capture channel disconnected");
                    break;
                }
            }

            if new_samples.is_empty() {
                continue;
            }

            original_buffer.extend_from_slice(&new_samples);

            let mono = super::capture::to_mono(&new_samples, session.channels);
            let resampled =
                super::capture::resample_mono(&mono, session.sample_rate, target_sample_rate);
            mono_16k_buffer.extend(resampled);

            // Backlog protection
            if mono_16k_buffer.len() > max_backlog_samples as usize {
                let excess = mono_16k_buffer.len() - max_backlog_samples as usize;
                log::warn!(
                    "Audio backlog exceeded limit, dropping oldest {:.2}s of samples",
                    excess as f32 / target_sample_rate as f32
                );
                mono_16k_buffer.drain(0..excess);

                let excess_orig = (excess as f32
                    * (session.sample_rate as f32 / target_sample_rate as f32))
                    .round() as usize
                    * session.channels as usize;
                if excess_orig <= original_buffer.len() {
                    original_buffer.drain(0..excess_orig);
                } else {
                    original_buffer.clear();
                }
            }

            let backlog_duration = mono_16k_buffer.len() as f32 / target_sample_rate as f32;

            if mono_16k_buffer.len() >= samples_per_chunk as usize {
                let chunk_samples = mono_16k_buffer
                    .drain(0..samples_per_chunk as usize)
                    .collect::<Vec<_>>();

                let orig_samples_to_drain = (samples_per_chunk as f32
                    * (session.sample_rate as f32 / target_sample_rate as f32))
                    .round() as usize
                    * session.channels as usize;
                let actual_drain = orig_samples_to_drain.min(original_buffer.len());
                let orig_chunk = original_buffer.drain(0..actual_drain).collect::<Vec<_>>();

                let calc_rms_peak = |s: &[f32]| -> (f32, f32) {
                    if s.is_empty() {
                        return (0.0, 0.0);
                    }
                    let mut sq = 0.0;
                    let mut peak = 0.0_f32;
                    for &v in s {
                        sq += v * v;
                        if v.abs() > peak {
                            peak = v.abs();
                        }
                    }
                    ((sq / s.len() as f32).sqrt(), peak)
                };

                let (in_rms, in_peak) = calc_rms_peak(&orig_chunk);
                let (out_rms, out_peak) = calc_rms_peak(&chunk_samples);

                log::info!("Audio Diagnostics:");
                log::info!(
                    "  Input: {} Hz, {} channels | RMS: {:.4}, Peak: {:.4}",
                    session.sample_rate,
                    session.channels,
                    in_rms,
                    in_peak
                );
                log::info!(
                    "  Output: 16000 Hz, 1 channel | RMS: {:.4}, Peak: {:.4}",
                    out_rms,
                    out_peak
                );

                // Skip transcription if audio is essentially silent.
                // This prevents Whisper from hallucinating repeating phrases on silent loopback (e.g. 0 streams playing),
                // which can cause the UI text to appear "frozen" because the same phrase is emitted repeatedly.
                if out_rms < 0.001 {
                    log::info!(
                        "Audio chunk is silent. Skipping inference to prevent hallucinations."
                    );
                    continue;
                }

                let orig_wav_path = temp_dir.join(format!("chunk_{}_original.wav", timestamp_ms()));
                let resampled_wav_path =
                    temp_dir.join(format!("chunk_{}_resampled.wav", timestamp_ms()));

                const KEEP_DEBUG_AUDIO: bool = false;

                let _orig_guard = TempFileGuard {
                    path: orig_wav_path.clone(),
                    keep: KEEP_DEBUG_AUDIO,
                };

                let _resampled_guard = TempFileGuard {
                    path: resampled_wav_path.clone(),
                    keep: KEEP_DEBUG_AUDIO,
                };

                if KEEP_DEBUG_AUDIO {
                    let _ = super::capture::write_wav(
                        &orig_wav_path,
                        &orig_chunk,
                        session.channels,
                        session.sample_rate,
                    );
                }

                if let Err(e) =
                    super::capture::write_wav(&resampled_wav_path, &chunk_samples, 1, 16000)
                {
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

                let mut sidecar = match app_clone.shell().sidecar("whisper-cli") {
                    Ok(s) => s,
                    Err(e) => {
                        log::error!("failed to setup sidecar: {}", e);
                        break;
                    }
                };
                sidecar = sidecar.env("PATH", new_path);
                sidecar = sidecar
                    .arg("-m")
                    .arg(model_path.to_string_lossy().to_string());
                sidecar = sidecar
                    .arg("-f")
                    .arg(resampled_wav_path.to_string_lossy().to_string());
                sidecar = sidecar.arg("-nt");
                sidecar = sidecar.arg("--suppress-nst"); // Suppress non-speech tokens like (speaking in foreign language)

                // Use available parallelism for threads
                let num_threads = std::thread::available_parallelism()
                    .map(|n| n.get())
                    .unwrap_or(4);
                sidecar = sidecar.arg("-t").arg(num_threads.to_string());

                if translate {
                    sidecar = sidecar.arg("-tr");
                }

                sidecar = sidecar.arg("-l").arg("auto");

                let start_time = std::time::Instant::now();
                let _ = app_clone.emit("transcription:status", "processing");
                let (mut rx, child) = match sidecar.spawn() {
                    Ok(res) => res,
                    Err(e) => {
                        log::error!("Failed to spawn sidecar: {e}");
                        let _ = app_clone.emit("transcription:status", "error");
                        continue;
                    }
                };

                {
                    let mut child_guard = sidecar_child_clone.lock().unwrap();
                    *child_guard = Some(child);
                }

                let sidecar_child_inner = Arc::clone(&sidecar_child_clone);
                let app_inner = app_clone.clone();
                let output = tauri::async_runtime::block_on(async move {
                    let rx_task = async {
                        let mut stdout_acc = String::new();
                        let mut stderr_acc = String::new();
                        while let Some(event) = rx.recv().await {
                            match event {
                                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                                    stdout_acc.push_str(&String::from_utf8_lossy(&line));
                                }
                                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                                    stderr_acc.push_str(&String::from_utf8_lossy(&line));
                                }
                                _ => {}
                            }
                        }
                        (stdout_acc, stderr_acc)
                    };

                    match tokio::time::timeout(std::time::Duration::from_secs(45), rx_task).await {
                        Ok(res) => res,
                        Err(_) => {
                            log::warn!("Whisper inference timed out after 45 seconds");
                            let mut child_guard = sidecar_child_inner.lock().unwrap();
                            if let Some(child) = child_guard.take() {
                                let _ = child.kill();
                            }
                            let _ = app_inner.emit("transcription:status", "error");
                            (String::new(), String::new())
                        }
                    }
                });

                let inference_duration = start_time.elapsed();
                let rtf = inference_duration.as_secs_f32() / chunk_duration as f32;

                // Extract language from stderr
                let mut detected_lang = String::new();
                for line in output.1.lines() {
                    let line = line.trim();
                    if line.contains("auto-detected language:") {
                        if let Some(idx) = line.find("auto-detected language:") {
                            detected_lang = line[idx + "auto-detected language:".len()..]
                                .trim()
                                .to_string();
                        }
                    } else if line.contains("Detected language:") {
                        if let Some(idx) = line.find("Detected language:") {
                            detected_lang =
                                line[idx + "Detected language:".len()..].trim().to_string();
                        }
                    }
                }
                // Strip out the confidence probability "(p = 0.99)" if present
                if let Some(idx) = detected_lang.find('(') {
                    detected_lang = detected_lang[..idx].trim().to_string();
                }

                log::info!("--- Audio Diagnostics ---");
                log::info!("Chunk: {:.1}s", chunk_duration);
                log::info!("Inference: {:.1}s", inference_duration.as_secs_f32());
                log::info!("RTF: {:.2}", rtf);
                log::info!("Backlog: {:.1}s", backlog_duration);
                if !detected_lang.is_empty() {
                    log::info!("Language: {}", detected_lang);
                }
                log::info!("-------------------------");

                {
                    let mut child_guard = sidecar_child_clone.lock().unwrap();
                    *child_guard = None;
                }

                let _ = app_clone.emit("transcription:status", "active");

                let cleaned = output.0.trim();
                let is_pure_caption = (cleaned.starts_with('[') && cleaned.ends_with(']'))
                    || (cleaned.starts_with('(') && cleaned.ends_with(')'));

                log::info!("Transcription output: {}", cleaned);
                if !cleaned.is_empty()
                    && !cleaned.contains("[BLANK_AUDIO]")
                    && !cleaned.starts_with("[_")
                    && !is_pure_caption
                {
                    let _ = app_clone.emit(
                        "transcription:text",
                        TranscriptionTextPayload {
                            text: cleaned.to_string(),
                            timestamp: timestamp_ms(),
                        },
                    );
                }

                if KEEP_DEBUG_AUDIO {
                    log::info!("WAV files saved for diagnostics at:");
                    log::info!("  Original: {}", orig_wav_path.display());
                    log::info!("  Resampled: {}", resampled_wav_path.display());
                }
            }
        }
    });

    rx_init
        .recv()
        .unwrap_or(Err("Capture thread died unexpectedly".to_string()))?;

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
    if !TRANSCRIPTION_SUPPORTED {
        return Err("Live transcription is currently supported only on Windows".to_string());
    }

    let mut guard = state.0.lock().map_err(|_| "state lock poisoned")?;

    if let Some(mut handle) = guard.take() {
        let thread = handle.thread.take();
        drop(handle); // Triggers Drop logic (kills child, sets running=false)

        if let Some(thread) = thread {
            let _ = thread.join();
        }
    }

    Ok(())
}
