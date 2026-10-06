use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
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
#[serde(rename_all = "camelCase")]
pub struct TranscriptionTextPayload {
    pub text: String,
    pub timestamp: u64,
    pub end_timestamp: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detected_language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inference_duration_ms: Option<u64>,
}

/// Live handle to a running transcription session.
/// The `running` flag is shared with the background thread so that
/// `stop_transcription` can gracefully terminate it.
pub struct TranscriptionHandle {
    pub running: Arc<AtomicBool>,
    /// Chunk duration in seconds, readable from the capture thread at each iteration
    /// via `Ordering::Relaxed`. Valid range: 5-30 s.
    pub chunk_duration: Arc<AtomicU32>,
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

struct DownloadGuard {
    temp_path: PathBuf,
    success: bool,
}

impl Drop for DownloadGuard {
    fn drop(&mut self) {
        DOWNLOAD_IN_PROGRESS.store(false, Ordering::Relaxed);
        if !self.success {
            let _ = fs::remove_file(&self.temp_path);
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

/// Validates that `model_name` is non-empty and contains only alphanumeric characters, `-`, or `_`.
pub(crate) fn validate_model_name(model_name: &str) -> Result<&str, &'static str> {
    if model_name.is_empty() {
        return Err("Model name cannot be empty");
    }
    if !model_name
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Invalid model name");
    }
    Ok(model_name)
}

/// Returns the expected file path for a given model name.
/// Format: `<app_data>/whisper-models/ggml-<model_name>.bin`
fn model_path(app: &AppHandle, model_name: &str) -> Result<PathBuf, String> {
    let valid_name = validate_model_name(model_name).map_err(|e| e.to_string())?;
    Ok(models_dir(app)?.join(format!("ggml-{valid_name}.bin")))
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

static CANCEL_DOWNLOAD: AtomicBool = AtomicBool::new(false);
static DOWNLOAD_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

/// Signals an active Whisper model download to cancel on the next stream chunk.
#[tauri::command]
pub fn cancel_whisper_download() {
    CANCEL_DOWNLOAD.store(true, Ordering::Relaxed);
}

/// Returns whether local live transcription is supported on the current OS.
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

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3600))
        .build()
        .map_err(|e| format!("failed to build client: {e}"))?;

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
    // Append `.tmp` to the full filename (e.g. `ggml-base.bin` -> `ggml-base.bin.tmp`)
    // so that a partial download is never mistaken for a complete model on disk.
    // Stale `.tmp` files left by crashed sessions are cleaned up in `get_transcription_status`.
    let temp_name = format!(
        "{}.tmp",
        dest_path.file_name().unwrap_or_default().to_string_lossy()
    );
    let temp_path = dest_path.with_file_name(temp_name);

    // Reset cancellation flag before starting
    CANCEL_DOWNLOAD.store(false, Ordering::Relaxed);
    DOWNLOAD_IN_PROGRESS.store(true, Ordering::Relaxed);
    let mut guard = DownloadGuard {
        temp_path: temp_path.clone(),
        success: false,
    };

    use std::io::Write;
    let mut file = std::fs::File::create(&temp_path)
        .map_err(|e| format!("failed to create temp model file: {e}"))?;

    // Stream response body to a .tmp file. Only renamed to .bin on full success,
    // preventing corrupted models from appearing installed after interrupted downloads.
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let mut last_emit = std::time::Instant::now();
    let throttle_interval = std::time::Duration::from_millis(100);

    while let Some(chunk_result) = stream.next().await {
        if CANCEL_DOWNLOAD.load(Ordering::Relaxed) {
            drop(file);
            return Err("Download cancelled by user".to_string());
        }

        let chunk = chunk_result.map_err(|e| format!("stream error: {e}"))?;
        file.write_all(&chunk)
            .map_err(|e| format!("write error: {e}"))?;
        downloaded += chunk.len() as u64;

        if last_emit.elapsed() >= throttle_interval || downloaded == total {
            last_emit = std::time::Instant::now();
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
    }

    // Explicit drop ensures the file handle is flushed and closed on Windows
    // before `rename`, which would otherwise fail with a sharing violation (ERROR_SHARING_VIOLATION).
    drop(file);
    fs::rename(&temp_path, &dest_path)
        .map_err(|e| format!("failed to finalize model file: {e}"))?;
    guard.success = true;

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
            if name.starts_with("ggml-") && name.ends_with(".bin.tmp") {
                if !DOWNLOAD_IN_PROGRESS.load(Ordering::Relaxed) {
                    let _ = fs::remove_file(entry.path());
                }
                return None;
            }
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
/// Pipeline: the capture thread (WASAPI process loopback, 16 kHz mono) emits
/// complete chunks; this worker thread coalesces queued chunks up to 30s,
/// runs the `whisper-cli` sidecar, and emits `transcription:text`.
#[tauri::command]
pub fn start_transcription(
    model_name: String,
    translate: bool,
    chunk_duration: u32,
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
    let chunk_dur_atomic = Arc::new(AtomicU32::new(chunk_duration.clamp(5, 30)));

    let capture =
        super::capture::start_capture(Arc::clone(&running), Arc::clone(&chunk_dur_atomic))
            .map_err(|e| format!("Audio capture failed: {e}"))?;
    log::info!("Transcription capture source: {:?}", capture.source);

    let thread = std::thread::spawn(move || {
        let temp_dir = app_clone
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("."))
            .join("whisper-models")
            .join("temp");
        let _ = std::fs::create_dir_all(&temp_dir);

        let mut queue: std::collections::VecDeque<Vec<f32>> = std::collections::VecDeque::new();
        let mut last_rtf: f32 = 0.0;

        while running_clone.load(Ordering::SeqCst) {
            while let Ok(c) = capture.chunks.try_recv() {
                queue.push_back(c);
            }

            if queue.is_empty() {
                match capture
                    .chunks
                    .recv_timeout(std::time::Duration::from_millis(100))
                {
                    Ok(c) => queue.push_back(c),
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                        if running_clone.load(Ordering::SeqCst) {
                            log::error!("Audio capture channel disconnected");
                            let _ = app_clone.emit("transcription:status", "error");
                        }
                        break;
                    }
                }
            }

            while let Ok(c) = capture.chunks.try_recv() {
                queue.push_back(c);
            }

            let is_overloaded = last_rtf >= COALESCE_RTF_THRESHOLD;
            let backlog_limit = if is_overloaded {
                0
            } else {
                MAX_BACKLOG_SAMPLES
            };
            let dropped = trim_audio_backlog(&mut queue, backlog_limit);
            if dropped > 0 {
                if is_overloaded {
                    log::warn!(
                        "Inference running behind real-time (RTF {last_rtf:.2}), dropped {dropped} stale chunk(s) to recover"
                    );
                } else {
                    log::warn!(
                        "Audio backlog exceeded 30s limit, dropped {dropped} oldest chunk(s)"
                    );
                }
            }

            let window_limit = if is_overloaded {
                0
            } else {
                MAX_WHISPER_WINDOW_SAMPLES
            };
            let Some((mut chunk, merged_count)) =
                coalesce_next_batch(&mut queue, window_limit, SILENCE_RMS_THRESHOLD)
            else {
                continue;
            };

            if merged_count > 1 {
                let batch_secs = chunk.len() as f32 / super::capture::TARGET_SAMPLE_RATE as f32;
                log::info!("Coalesced {merged_count} queued chunks into {batch_secs:.1}s batch");
            }

            let duration_ms =
                (chunk.len() as u64 * 1000) / super::capture::TARGET_SAMPLE_RATE as u64;
            let remaining_ms = (queue.iter().map(Vec::len).sum::<usize>() as u64 * 1000)
                / super::capture::TARGET_SAMPLE_RATE as u64;
            let end_timestamp = timestamp_ms().saturating_sub(remaining_ms);
            let start_timestamp = end_timestamp.saturating_sub(duration_ms);

            let ctx = InferenceContext {
                app: &app_clone,
                model_name: &model_name,
                translate,
                temp_dir: &temp_dir,
                sidecar_child: &sidecar_child_clone,
                start_timestamp,
                end_timestamp,
            };
            match transcribe_chunk(&ctx, &mut chunk) {
                Ok(rtf) => last_rtf = rtf,
                Err(e) => {
                    log::error!("{e}");
                    break;
                }
            }
        }

        // Ensures the capture thread exits even when the worker stopped on its own.
        running_clone.store(false, Ordering::SeqCst);
        let _ = capture.thread.join();
    });

    *guard = Some(TranscriptionHandle {
        running,
        chunk_duration: chunk_dur_atomic,
        thread: Some(thread),
        sidecar_child,
    });

    Ok(())
}

const MAX_WHISPER_WINDOW_SAMPLES: usize = (super::capture::TARGET_SAMPLE_RATE * 30) as usize;
const MAX_BACKLOG_SAMPLES: usize = (super::capture::TARGET_SAMPLE_RATE * 30) as usize;
const COALESCE_RTF_THRESHOLD: f32 = 0.8;
const SILENCE_RMS_THRESHOLD: f32 = 0.008;
const MIN_NORMALIZATION_RMS: f32 = 0.015;
const TARGET_PEAK: f32 = 0.85;
const MAX_NORMALIZATION_GAIN: f32 = 3.0;

struct InferenceContext<'a> {
    app: &'a AppHandle,
    model_name: &'a str,
    translate: bool,
    temp_dir: &'a std::path::Path,
    sidecar_child: &'a Arc<Mutex<Option<tauri_plugin_shell::process::CommandChild>>>,
    start_timestamp: u64,
    end_timestamp: u64,
}

/// Atomically replaces the active `whisper-cli` child process handle and returns the previous one.
fn set_sidecar_child(
    slot: &Mutex<Option<tauri_plugin_shell::process::CommandChild>>,
    child: Option<tauri_plugin_shell::process::CommandChild>,
) -> Option<tauri_plugin_shell::process::CommandChild> {
    let mut guard = slot.lock().unwrap_or_else(|p| p.into_inner());
    std::mem::replace(&mut *guard, child)
}

/// Computes the root-mean-square (RMS) amplitude of an `f32` audio slice.
pub(crate) fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    (samples.iter().map(|v| v * v).sum::<f32>() / samples.len() as f32).sqrt()
}

/// Computes the optimal thread count (`-t`) for `whisper-cli` based on logical CPU count.
/// Uses ~75% of logical threads (clamped to `[2, 8]`) to balance low-latency inference
/// while leaving CPU headroom for live stream playback and the OS.
pub(crate) fn compute_inference_threads(logical_threads: usize) -> usize {
    (logical_threads * 3 / 4).clamp(2, 8)
}

/// Normalizes audio samples toward `TARGET_PEAK` (0.85) with a `MAX_NORMALIZATION_GAIN` (3x) cap
/// when RMS exceeds `MIN_NORMALIZATION_RMS` (0.015), preventing ambient background noise from
/// being over-amplified. Returns the applied gain factor.
pub(crate) fn normalize_audio_peak(samples: &mut [f32]) -> f32 {
    let peak = samples.iter().fold(0.0_f32, |p, s| p.max(s.abs()));
    if peak <= 1e-5 || rms(samples) < MIN_NORMALIZATION_RMS {
        return 1.0;
    }
    let gain = (TARGET_PEAK / peak).min(MAX_NORMALIZATION_GAIN);
    if (gain - 1.0).abs() > 1e-3 {
        for sample in samples.iter_mut() {
            *sample = (*sample * gain).clamp(-1.0, 1.0);
        }
    }
    gain
}

/// Drops the oldest chunks when total queued samples exceed `max_samples`.
pub(crate) fn trim_audio_backlog(
    queue: &mut std::collections::VecDeque<Vec<f32>>,
    max_samples: usize,
) -> usize {
    let mut total_samples: usize = queue.iter().map(Vec::len).sum();
    let mut dropped = 0;
    while total_samples > max_samples && queue.len() > 1 {
        if let Some(removed) = queue.pop_front() {
            total_samples = total_samples.saturating_sub(removed.len());
            dropped += 1;
        }
    }
    dropped
}

/// Pops the next non-silent chunk and merges subsequent non-silent chunks up to `max_window_samples`.
/// Silent chunks encountered in the queue are discarded immediately so they neither trigger
/// unnecessary inference nor consume space in a coalesced batch.
pub(crate) fn coalesce_next_batch(
    queue: &mut std::collections::VecDeque<Vec<f32>>,
    max_window_samples: usize,
    silence_threshold: f32,
) -> Option<(Vec<f32>, usize)> {
    let mut base = loop {
        let candidate = queue.pop_front()?;
        let candidate_rms = rms(&candidate);
        if candidate_rms >= silence_threshold {
            break candidate;
        }
        log::info!(
            "Audio chunk is silent (RMS {candidate_rms:.4}). Skipping inference to prevent hallucinations."
        );
    };

    let mut merged_count = 1;
    while let Some(next) = queue.front() {
        let next_rms = rms(next);
        if next_rms < silence_threshold {
            log::info!(
                "Audio chunk is silent (RMS {next_rms:.4}). Skipping inference to prevent hallucinations."
            );
            queue.pop_front();
            continue;
        }
        if base.len() + next.len() > max_window_samples {
            break;
        }
        if let Some(next_chunk) = queue.pop_front() {
            base.extend_from_slice(&next_chunk);
            merged_count += 1;
        }
    }

    Some((base, merged_count))
}

/// Extracts the detected language code from `whisper-cli` stderr diagnostic output.
pub(crate) fn parse_detected_language(stderr: &str) -> String {
    let mut detected_lang = String::new();
    for line in stderr.lines() {
        for marker in ["auto-detected language:", "Detected language:"] {
            if let Some(idx) = line.find(marker) {
                detected_lang = line[idx + marker.len()..].trim().to_string();
            }
        }
    }
    // Strip out the confidence probability "(p = 0.99)" if present
    if let Some(idx) = detected_lang.find('(') {
        detected_lang = detected_lang[..idx].trim().to_string();
    }
    detected_lang
}

/// Runs `whisper-cli` on `chunk` and returns the measured real-time factor (`RTF`),
/// or `f32::INFINITY` if inference timed out. Returns `Err` only for unrecoverable session errors.
fn transcribe_chunk(ctx: &InferenceContext, chunk: &mut [f32]) -> Result<f32, String> {
    let chunk_seconds = chunk.len() as f32 / super::capture::TARGET_SAMPLE_RATE as f32;
    let chunk_rms = rms(chunk);

    if chunk_rms < SILENCE_RMS_THRESHOLD {
        log::info!(
            "Audio chunk is silent (RMS {chunk_rms:.4}). Skipping inference to prevent hallucinations."
        );
        return Ok(0.0);
    }

    let applied_gain = normalize_audio_peak(chunk);

    let wav_path = ctx.temp_dir.join(format!("chunk_{}.wav", timestamp_ms()));
    let _wav_guard = TempFileGuard {
        path: wav_path.clone(),
        keep: false,
    };

    if let Err(e) =
        super::capture::write_wav(&wav_path, chunk, 1, super::capture::TARGET_SAMPLE_RATE)
    {
        log::error!("Failed to write WAV: {}", e);
        return Ok(0.0);
    }

    let model_path = model_path(ctx.app, ctx.model_name)?;

    let resource_dir = ctx
        .app
        .path()
        .resource_dir()
        .unwrap_or_default()
        .join("binaries");
    let current_path = std::env::var("PATH").unwrap_or_default();
    let new_path = format!("{};{}", resource_dir.to_string_lossy(), current_path);

    let mut sidecar = ctx
        .app
        .shell()
        .sidecar("whisper-cli")
        .map_err(|e| format!("failed to setup sidecar: {e}"))?;
    sidecar = sidecar.env("PATH", new_path);
    sidecar = sidecar
        .arg("-m")
        .arg(model_path.to_string_lossy().to_string());
    sidecar = sidecar
        .arg("-f")
        .arg(wav_path.to_string_lossy().to_string());
    sidecar = sidecar.arg("-nt");
    sidecar = sidecar.arg("--suppress-nst"); // Suppress non-speech tokens like (speaking in foreign language)

    let logical_threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let num_threads = compute_inference_threads(logical_threads);
    sidecar = sidecar.arg("-t").arg(num_threads.to_string());

    if ctx.translate {
        sidecar = sidecar.arg("-tr");
    }

    sidecar = sidecar.arg("-l").arg("auto");

    let start_time = std::time::Instant::now();
    let _ = ctx.app.emit("transcription:status", "processing");
    let (mut rx, child) = match sidecar.spawn() {
        Ok(res) => res,
        Err(e) => {
            log::error!("Failed to spawn sidecar: {e}");
            let _ = ctx.app.emit("transcription:status", "error");
            return Ok(0.0);
        }
    };
    set_sidecar_child(ctx.sidecar_child, Some(child));

    let mut timed_out = false;
    let (stdout, stderr) = tauri::async_runtime::block_on(async {
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
                timed_out = true;
                log::warn!("Whisper inference timed out after 45 seconds");
                if let Some(child) = set_sidecar_child(ctx.sidecar_child, None) {
                    let _ = child.kill();
                }
                let _ = ctx.app.emit("transcription:status", "error");
                (String::new(), String::new())
            }
        }
    });
    set_sidecar_child(ctx.sidecar_child, None);

    let inference_duration = start_time.elapsed();
    let rtf = inference_duration.as_secs_f32() / chunk_seconds;
    let detected_lang = parse_detected_language(&stderr);

    log::info!("--- Audio Diagnostics ---");
    log::info!(
        "Chunk: {:.1}s | RMS: {:.4} | Gain: {:.2}x",
        chunk_seconds,
        chunk_rms,
        applied_gain
    );
    log::info!("Inference: {:.1}s", inference_duration.as_secs_f32());
    log::info!("RTF: {:.2}", rtf);
    if !detected_lang.is_empty() {
        log::info!("Language: {}", detected_lang);
    }
    log::info!("-------------------------");

    let _ = ctx.app.emit("transcription:status", "active");

    let cleaned = stdout.trim();
    let is_pure_caption = (cleaned.starts_with('[') && cleaned.ends_with(']'))
        || (cleaned.starts_with('(') && cleaned.ends_with(')'));

    log::info!("Transcription output: {}", cleaned);
    if !cleaned.is_empty()
        && !cleaned.contains("[BLANK_AUDIO]")
        && !cleaned.starts_with("[_")
        && !is_pure_caption
    {
        let _ = ctx.app.emit(
            "transcription:text",
            TranscriptionTextPayload {
                text: cleaned.to_string(),
                timestamp: ctx.start_timestamp,
                end_timestamp: ctx.end_timestamp,
                detected_language: if detected_lang.is_empty() {
                    None
                } else {
                    Some(detected_lang)
                },
                inference_duration_ms: Some(inference_duration.as_millis() as u64),
            },
        );
    }

    Ok(if timed_out { f32::INFINITY } else { rtf })
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

/// Updates the chunk duration for the currently running transcription session.
///
/// The new value is clamped to the valid range [5, 30] seconds and stored in the
/// shared `AtomicU32`. The capture thread reads it at the beginning of every loop
/// iteration, so the change takes effect on the next chunk boundary without any
/// restart. If no session is active the call is a safe no-op (logged for debugging).
#[tauri::command]
pub fn set_chunk_duration(
    seconds: u32,
    state: State<'_, TranscriptionState>,
) -> Result<(), String> {
    let clamped = seconds.clamp(5, 30);
    let guard = state.0.lock().map_err(|_| "state lock poisoned")?;
    match guard.as_ref() {
        Some(handle) => {
            handle.chunk_duration.store(clamped, Ordering::Relaxed);
            log::info!("chunk_duration updated to {}s", clamped);
        }
        None => {
            log::info!(
                "set_chunk_duration called with {}s but no active session; \
                 value will be applied when transcription starts",
                clamped
            );
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    #[test]
    fn should_accept_valid_model_names() {
        // Arrange
        let names = ["base", "tiny-en", "small_en-v2", "123"];

        // Act & Assert
        for name in names {
            assert!(validate_model_name(name).is_ok());
        }
    }

    #[test]
    fn should_reject_invalid_model_names_and_path_traversal() {
        // Arrange
        let invalid_names = [
            "",
            "../base",
            "base/../",
            "base\\model",
            "base model",
            "base.bin",
            "rm -rf",
        ];

        // Act & Assert
        for name in invalid_names {
            assert!(validate_model_name(name).is_err());
        }
    }

    #[test]
    fn should_compute_inference_threads_without_saturating_logical_cores() {
        // Arrange & Act & Assert
        assert_eq!(compute_inference_threads(2), 2);
        assert_eq!(compute_inference_threads(4), 3);
        assert_eq!(compute_inference_threads(8), 6);
        assert_eq!(compute_inference_threads(12), 8);
        assert_eq!(compute_inference_threads(16), 8);
    }

    #[test]
    fn should_normalize_quiet_audio_to_target_peak_with_gain_cap() {
        // Arrange
        let mut quiet_samples = vec![-0.425_f32, 0.2125, 0.425];
        let mut capped_samples = vec![0.10_f32, -0.10];
        let mut ambient_noise_samples = vec![0.01_f32, -0.01];

        // Act
        let gain_quiet = normalize_audio_peak(&mut quiet_samples);
        let gain_capped = normalize_audio_peak(&mut capped_samples);
        let gain_noise = normalize_audio_peak(&mut ambient_noise_samples);

        // Assert
        assert!((gain_quiet - 2.0).abs() < 1e-3);
        assert!((quiet_samples[2] - 0.85).abs() < 1e-3);
        assert!((gain_capped - MAX_NORMALIZATION_GAIN).abs() < 1e-3);
        assert!((capped_samples[1] - (-0.30)).abs() < 1e-3);
        assert!((gain_noise - 1.0).abs() < 1e-3);
    }

    #[test]
    fn should_coalesce_multiple_chunks_up_to_max_window() {
        // Arrange
        let mut queue = VecDeque::from([
            vec![0.1_f32; 160_000], // 10s
            vec![0.2_f32; 160_000], // 10s
            vec![0.3_f32; 160_000], // 10s
            vec![0.4_f32; 160_000], // 10s (exceeds 30s window, must stay in queue)
        ]);

        // Act
        let result = coalesce_next_batch(&mut queue, 480_000, 0.008);

        // Assert
        let (batch, count) = result.expect("should produce a coalesced batch");
        assert_eq!(count, 3);
        assert_eq!(batch.len(), 480_000);
        assert_eq!(queue.len(), 1);
        assert_eq!(queue[0][0], 0.4);
    }

    #[test]
    fn should_skip_silent_chunks_when_coalescing() {
        // Arrange
        let mut queue = VecDeque::from([
            vec![0.0_f32; 160_000],   // silent leading chunk
            vec![0.1_f32; 160_000],   // speech 10s
            vec![0.004_f32; 160_000], // background ambient noise chunk (< 0.008)
            vec![0.2_f32; 160_000],   // speech 10s
        ]);

        // Act
        let result = coalesce_next_batch(&mut queue, 480_000, 0.008);

        // Assert
        let (batch, count) = result.expect("should coalesce non-silent chunks");
        assert_eq!(count, 2);
        assert_eq!(batch.len(), 320_000);
        assert!(queue.is_empty());
    }

    #[test]
    fn should_return_none_when_all_queued_chunks_are_silent() {
        // Arrange
        let mut queue = VecDeque::from([vec![0.0_f32; 80_000], vec![0.005_f32; 80_000]]);

        // Act
        let result = coalesce_next_batch(&mut queue, 480_000, 0.008);

        // Assert
        assert!(result.is_none());
        assert!(queue.is_empty());
    }

    #[test]
    fn should_trim_oldest_chunks_when_backlog_exceeds_sample_limit() {
        // Arrange
        let mut queue = VecDeque::from([
            vec![0.1_f32; 320_000], // 20s
            vec![0.2_f32; 320_000], // 20s
            vec![0.3_f32; 320_000], // 20s
            vec![0.4_f32; 320_000], // 20s -> total 80s (1_280_000 samples)
        ]);

        // Act
        let dropped = trim_audio_backlog(&mut queue, 960_000); // max 60s

        // Assert
        assert_eq!(dropped, 1);
        assert_eq!(queue.len(), 3);
        assert_eq!(queue[0][0], 0.2);
    }

    #[test]
    fn should_drop_stale_chunks_and_process_only_newest_chunk_when_overloaded() {
        // Arrange
        let mut queue = VecDeque::from([
            vec![0.1_f32; 160_000],
            vec![0.2_f32; 160_000],
            vec![0.3_f32; 160_000],
        ]);

        // Act
        let dropped = trim_audio_backlog(&mut queue, 0);
        let result = coalesce_next_batch(&mut queue, 0, 0.008);

        // Assert
        assert_eq!(dropped, 2);
        let (batch, count) = result.expect("should keep newest chunk");
        assert_eq!(count, 1);
        assert_eq!(batch.len(), 160_000);
        assert_eq!(batch[0], 0.3);
        assert!(queue.is_empty());
    }

    #[test]
    fn should_parse_detected_language_from_stderr() {
        // Arrange
        let stderr = "whisper_full_with_state: auto-detected language: pt (p = 0.987123)\n";

        // Act
        let lang = parse_detected_language(stderr);

        // Assert
        assert_eq!(lang, "pt");
    }

    #[test]
    fn should_serialize_transcription_text_payload_to_camel_case() {
        // Arrange
        let payload = TranscriptionTextPayload {
            text: "Hello world".to_string(),
            timestamp: 1000,
            end_timestamp: 11000,
            detected_language: Some("en".to_string()),
            inference_duration_ms: Some(1250),
        };

        // Act
        let json = serde_json::to_string(&payload).expect("should serialize");

        // Assert
        assert!(json.contains("\"endTimestamp\":11000"));
        assert!(json.contains("\"detectedLanguage\":\"en\""));
        assert!(json.contains("\"inferenceDurationMs\":1250"));
    }
}
