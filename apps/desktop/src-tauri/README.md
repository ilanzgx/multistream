# Multistream — Rust Backend (`apps/desktop/src-tauri`)

Backend of the Multistream application, built with [Tauri 2](https://v2.tauri.app/) and Rust. Responsible for OAuth authentication, real-time chat, audio transcription, and exposing IPC commands to the Vue frontend.

---

## Table of Contents

1. [Twitch Authentication](#1-twitch-authentication)
2. [Kick Authentication](#2-kick-authentication)
3. [Whisper Transcription](#3-whisper-transcription)
4. [Global Commands (`lib.rs`)](#4-global-commands-librs)
5. [Auto-update](#5-auto-update)
6. [Build Script (`build.rs`)](#6-build-script-buildrs)
7. [Local Stream Recording](#7-local-stream-recording)
8. [Testing Strategy](#8-testing-strategy)

---

## 1. Twitch Authentication

**Protocol:** OAuth 2.0 Device Authorization Grant.

### Login flow

```
twitch_login
  └─ POST https://id.twitch.tv/oauth2/device
       → device_code, user_code, verification_uri, interval, expires_in
  └─ Emits twitch-auth-url → frontend displays the link/QR to the user
  └─ Polling loop (tokio::select! + oneshot abort channel)
       → POST /token every `interval` seconds
       → authorization_pending → keep polling
       → token received → GET /validate (fetches login + user_id)
       → Persists credentials → emits twitch-auth-changed
```

`twitch_cancel_login` signals the polling `oneshot::Sender`, stopping it immediately.

### Persistence

Credentials are saved to `%APPDATA%\multistream\twitch_auth.json`. Loaded on app startup — if the token is expired, a refresh is attempted in the background. Network errors **do not** clear credentials.

### IRC Chat

After authenticating, `twitch_set_channels` connects to `wss://irc-ws.chat.twitch.tv:443` with the `twitch.tv/tags` and `twitch.tv/commands` capabilities. The IRC loop runs in a separate task with **exponential backoff + jitter** (0s → ~2s → ~4s → ... → ~60s cap):

- `PING` / `PRIVMSG` / `NOTICE` are all processed in a **single pass** over each incoming WebSocket frame
- `PRIVMSG` → parses tags (id, color, badges, emotes) → emits `unified-chat-message`
- `NOTICE msg-id=msg_*` → emits `twitch-chat-error` (signals optimistic message rollback in the frontend)
- `NOTICE Login authentication failed` → stops the loop, emits `twitch-auth-expired`

**Heartbeat:** A timer checks every 60s whether any data was received in the last 6 minutes (Twitch sends `PING` every ~5 min). If the connection is idle beyond this threshold, it is presumed dead and the loop triggers a reconnect.

**Outbound channel:** If the `mpsc` sender is dropped (e.g. `update_subscriptions` replaced it), `outbound_rx.recv()` returns `None` and the loop exits cleanly to reconnect.

Outbound messages (`twitch_send_message`) are sent via an `mpsc` channel to the IRC loop. The message is injected into the local buffer and emitted to the frontend immediately (optimistic UI); the server confirms or rejects it via `NOTICE`.

### IPC Commands

| Command | Description |
|---|---|
| `twitch_login` | Starts the Device Flow, returns `DeviceFlowResponse` |
| `twitch_cancel_login` | Aborts the polling loop |
| `twitch_logout` | Disconnects IRC, clears state and credentials |
| `twitch_get_auth_state` | Returns `{ authenticated, username }` |
| `twitch_set_channels` | Sets IRC channels (validates/refreshes token first) |
| `twitch_get_messages` | Returns the message buffer (max 1,000) |
| `twitch_get_connection_state` | Returns the current connection state |
| `twitch_send_message` | Sends a message via the IRC channel |

### Emitted Events

| Event | When |
|---|---|
| `twitch-auth-changed` | Login, logout, or confirmed expiration |
| `twitch-auth-expired` | Token is unrecoverable |
| `twitch-auth-error` | Error or timeout in the Device Flow |
| `twitch-connection-state` | `connected / reconnecting / disconnected` |
| `unified-chat-message` | New message received or sent |
| `twitch-chat-error` | Message rejected by the IRC server |

---

## 2. Kick Authentication

**Protocol:** OAuth 2.0 Authorization Code with PKCE.

Kick is protected by Cloudflare. All HTTP traffic **must go through the Rust backend** using `rustls` (not `native-tls`), which avoids TLS fingerprint blocking.

### Login flow

```
kick_login
  └─ Generates PKCE: verifier  (32 random bytes, Base64 URL-safe no-pad)
                     challenge  (SHA-256 of verifier, Base64 URL-safe no-pad)
                     state      (16 random bytes — CSRF protection)
  └─ Opens TcpListener on 127.0.0.1:14832 (timeout: 2 min)
  └─ Emits kick-auth-url → frontend opens the browser
  └─ Waits for GET /callback?code=...&state=...
       → validates state (CSRF) — if invalid → HTTP 400
       → validates code is present — if missing → HTTP 400
  └─ POST https://id.kick.com/oauth/token (exchanges code + verifier for tokens)
  └─ GET https://api.kick.com/public/v1/users (fetches username)
  └─ Persists credentials → emits kick-auth-changed
```

`kick_cancel_login` connects to `127.0.0.1:14832` and sends `GET /cancel HTTP/1.1`, causing the listener to abort.

> `KICK_CLIENT_ID` and `KICK_CLIENT_SECRET` are injected via `option_env!()` **at compile time** from the `.env` file.

### Persistence

Credentials are saved to `%APPDATA%\multistream\kick_auth.json`. Legacy tokens missing the `has_chat_write = true` flag are discarded on startup, forcing a new login with the correct permissions.

### Chat via Pusher

After authenticating, `kick_set_channels` connects to Kick's Pusher WebSocket endpoint. It receives `(slug, chatroom_id)` pairs from the frontend and subscribes to `chatrooms.<chatroom_id>.v2` channels. The reconnection loop follows the same exponential backoff pattern as Twitch. A ping is sent every **120s** to keep the connection alive.

`App\Events\ChatMessageEvent` events arrive with `data` as a **JSON string inside the outer Pusher JSON** (double-encoded). The backend parses it and emits `kick-chat-message`.

### Sending messages

`kick_send_message` performs `POST https://api.kick.com/public/v1/chat`. On `401`/`403`, it automatically refreshes the token and retries — transparently to the frontend.

### IPC Commands

| Command | Description |
|---|---|
| `kick_login` | Starts the PKCE Flow |
| `kick_cancel_login` | Cancels the login in progress |
| `kick_logout` | Disconnects Pusher, clears credentials |
| `kick_get_auth_state` | Returns `{ authenticated, username }` |
| `kick_send_message` | Sends a message (with automatic retry after refresh) |
| `kick_set_channels` | Sets Pusher channels: `[slug, chatroom_id][]` |

### Emitted Events

| Event | When |
|---|---|
| `kick-auth-url` | PKCE authorization URL generated |
| `kick-auth-changed` | Login or logout |
| `kick-connection-state` | `connected / reconnecting / disconnected` |
| `kick-chat-message` | New chat message received |

---

## 3. Whisper Transcription

Local, offline audio transcription via the `whisper.cpp` sidecar. **Windows only** (WASAPI loopback capture).

### Capture pipeline

```
start_transcription
  └─ Opens the default output device in loopback mode (cpal)
  └─ Normalizes sample format (F32 / I16 / U16) to f32 [-1.0, 1.0]
  └─ sync_channel buffer of 10s (samples dropped if full)
  └─ Dedicated thread (outside the tokio runtime):
       ├─ Downmix to mono (arithmetic mean per frame)
       ├─ Linear resample to 16 kHz
       ├─ Accumulates a buffer of chunk_duration seconds [5–30s]
       ├─ Backlog protection: drops oldest samples if > chunk_duration * 2s
       ├─ Silence (RMS < 0.001) → skip (prevents Whisper hallucinations)
       ├─ Writes 16-bit PCM mono 16 kHz WAV to a temp directory
       └─ Spawns the whisper-cli sidecar:
            -m <model> -f <wav> -nt --suppress-nst -t <threads> [-tr] -l auto
```

The `whisper-cli` sidecar is a pre-compiled `whisper.cpp` binary bundled with the app. Output is collected from `stdout` with a 45s timeout.

### Output filters

Text is not emitted if it:
- Is empty or contains `[BLANK_AUDIO]`
- Starts with `[_` (Whisper internal token)
- Is entirely wrapped in `[...]` or `(...)` (action caption)

### Session control

`TranscriptionHandle` holds two `Arc<Atomic>` values:
- `running: AtomicBool` — signals the capture loop to stop
- `chunk_duration: AtomicU32` — allows changing chunk duration **in real time** without restarting the session

The `Drop` impl of `TranscriptionHandle` kills the `whisper-cli` process and sets `running = false` automatically — ensuring cleanup even on panics.

### Model download

`download_whisper_model` downloads from HuggingFace (`ggml-<model>.bin`) with direct streaming to disk. Emits `transcription:download-progress` every 100ms. Supports cancellation via a global atomic flag `CANCEL_DOWNLOAD`.

Available models: `tiny`, `base`, `small`.

### IPC Commands

| Command | Parameters | Description |
|---|---|---|
| `is_transcription_supported` | — | `true` on Windows only |
| `download_whisper_model` | `model_name` | Downloads model from HuggingFace |
| `cancel_whisper_download` | — | Cancels a download in progress |
| `delete_whisper_model` | `model_name` | Removes model from disk |
| `get_transcription_status` | — | `{ installed_models, active }` |
| `start_transcription` | `model_name, translate, chunk_duration` | Starts capture and transcription |
| `stop_transcription` | — | Stops the active session |
| `set_chunk_duration` | `seconds` [5–30] | Adjusts chunk duration in real time |

### Emitted Events

| Event | Payload | When |
|---|---|---|
| `transcription:download-progress` | `{ downloaded, total, percent }` | During download |
| `transcription:text` | `{ text, timestamp }` | Transcribed text available |
| `transcription:status` | `"processing" / "active" / "error"` | Pipeline phase change |

---

## 4. Global Commands (`lib.rs`)

In addition to the modules above, `lib.rs` registers two utility commands:

### `send_notification`

```
invoke("send_notification", { title, body })
```

Displays a native OS notification via `tauri-plugin-notification`. The text is already localized by the frontend before being sent.

### `save_screenshot`

```
invoke("save_screenshot", bytes, { headers: { "x-filename": encodedFilename } }) → string (file path)
```

Receives raw PNG image bytes (`Uint8Array`) directly across Tauri IPC with the sanitized filename in the `x-filename` header (or alternatively a base64 JSON payload for backwards compatibility) and saves the PNG to:
```
~/Pictures/Multistream/<filename>
```

Creates the directory if it does not exist. Returns the absolute path of the saved file.

---

## 5. Auto-update

Managed by `tauri-plugin-updater`, pointing to the GitHub Releases endpoint:

```
https://github.com/ilanzgx/multistream/releases/latest/download/latest.json
```

The `latest.json` file is generated automatically by GitHub Actions when a release is published. It contains the installer URLs per platform and a cryptographic signature (minisign).

The updater verifies the signature against the public key embedded in `tauri.conf.json` before applying any update — preventing unauthorized updates.

**Required permissions** (declared in `capabilities/default.json`):
```
updater:allow-check
updater:allow-download
updater:allow-install
```

---

## 6. Build Script (`build.rs`)

Run by Cargo before compiling the crate. Performs three tasks:

### Environment variable injection

Reads the `.env` file and exposes each `KEY=VALUE` as a compile-time variable via `cargo:rustc-env`. This enables:

```rust
let client_id = option_env!("KICK_CLIENT_ID").unwrap_or("");
```

Secrets never appear in source code — they are baked into the binary at compile time. In CI, they must be injected as `env:` in the build step of the workflow.

### whisper-cli download

On the `windows/x86_64` target, if the binary `whisper-cli-x86_64-pc-windows-msvc.exe` is missing or empty:

1. Downloads the ZIP from the `ggml-org/whisper.cpp` release via `curl`
2. Extracts it with `tar`
3. Moves `whisper-cli.exe` (renamed with the target triplet) and all `.dll` files to `binaries/`

On other targets, creates empty placeholder files so the Tauri bundler does not fail when the declared sidecar is not found.

### `tauri_build::build()`

Generates capability schemas and prepares the Tauri security manifest. Must be the last call in the script.

---

## 7. Local Stream Recording

Local live stream recording is powered by [Streamlink](https://streamlink.github.io/) for HLS/DASH chunk capture and [FFmpeg](https://ffmpeg.org/) for stream-copy remuxing (`.ts` to `.mp4`), executed directly via `tokio::process::Command`. **Supported on Windows (x86_64), Linux (x86_64), and macOS.**

### Architecture Insight: On-Demand Portable Sandbox

To maintain Multistream's core philosophy of being lightweight and performant, we intentionally avoid bundling Streamlink, Python, and FFmpeg as [Tauri Sidecars](https://v2.tauri.app/concept/sidecar/) in the installer.

Instead, an **On-Demand Portable Environment** is provisioned dynamically when the user installs the feature:
- **Windows:** Downloads official `python-3.11-embed-amd64.zip` and standalone `ffmpeg.exe`. Patches `python311._pth` to enable `site-packages`, downloads `get-pip.py`, and installs `streamlink` natively via pip.
- **Linux:** Downloads `Streamlink.AppImage` and a static `ffmpeg` build, extracting them natively without relying on system FUSE.
- **macOS:** Downloads a standalone Python build, installs `streamlink` via pip, and extracts a static macOS FFmpeg binary.
- The environment is completely sandboxed in `%APPDATA%\multistream\recording_env` (or its equivalent on Unix) and does not pollute or rely on the host system PATH.


### 2-Stage Recording & Remuxing Pipeline

```
start_recording
  ├─ Validates stream_id (UUID), channel, platform (twitch/kick/youtube), and quality
  ├─ Checks available disk space (minimum 2.00 GB free required)
  ├─ Resolves target path: <Videos>/Multistream/YYYY/MM/<platform>_<channel>_<timestamp>.ts
  ├─ Spawns Streamlink process:
  │    python.exe -m streamlink <url> <quality_fallbacks> --output <temp.ts> --force --retry-streams 5 --retry-open 5
  ├─ Emits recording:started
  └─ Monitors process exit in an asynchronous tokio task:
       ├─ Clean exit / User stop → runs FFmpeg remuxing pipeline
       ├─ Non-clean exit → emits recording:error
       └─ Empty file (< 1 byte) → removes temp file and alerts frontend

run_remux (Stream Copy)
  ├─ Emits recording:remux-started
  ├─ Checks disk space for conversion (free bytes >= ts_size)
  ├─ Spawns FFmpeg in stream-copy mode (0% transcoding CPU overhead):
  │    ffmpeg.exe -y -i <temp.ts> -c copy -movflags +faststart -progress pipe:1 -nostats <output.mp4>
  ├─ Parses stdout `total_size=<bytes>` and emits recording:remux-progress
  ├─ On success: deletes <temp.ts> and emits recording:remux-finished
  └─ On failure: retains <temp.ts> for recovery and emits recording:remux-failed
```

### Safety, Disk Space & Process Tree Management

- **Process Tree Termination (`taskkill`):** When stopping a recording on Windows, `taskkill /F /T /PID` is executed with `CREATE_NO_WINDOW` (`0x08000000`) flag, cleanly terminating all child worker threads spawned by Python without leaving zombie processes.
- **Pre-Flight Disk Space Checks:** Native OS APIs (`GetDiskFreeSpaceExW` on Windows) verify sufficient disk space before starting a stream and before launching FFmpeg remuxing.
- **Graceful Application Shutdown:** When the application window is closing or the app is shutting down, `shutdown_all_recordings` terminates all active Streamlink processes and awaits up to 30s for any in-flight remuxing tasks to complete before exit.
- **Input Sanitization:** All channel names, stream IDs, and qualities are validated against strict whitelists in `validation.rs` to eliminate command injection risks.

### Orphan Recording Recovery

If the application is terminated abruptly during recording (e.g., system crash, power outage), the captured `.ts` file remains intact on disk.
- `scan_orphans` scans the recording directory for `.ts` files without a matching `.mp4`.
- `recover_orphan_recording` triggers the FFmpeg remux pipeline on the selected orphan.
- `dismiss_orphan_recording` permanently deletes the unneeded `.ts` file.

### Folder Management

`open_recording_folder` uses `tauri-plugin-opener` to open the configured recording directory (or default `Videos/Multistream/YYYY/MM`) in Windows File Explorer.

### IPC Commands

| Command | Parameters | Description |
|---|---|---|
| `is_recording_supported_cmd` | — | Returns `true` on supported architectures (Windows x86_64, Linux x86_64, macOS) |
| `recording_check_dependencies` | — | Checks if Python, Streamlink, and FFmpeg are installed in `recording_env` |
| `recording_install_dependencies` | — | Downloads and sets up the portable environment with SHA-256 validation |
| `recording_uninstall_dependencies` | — | Completely deletes `%APPDATA%\multistream\recording_env` |
| `recording_get_env_size` | — | Calculates total size in bytes of `recording_env` |
| `start_recording` | `stream_id, channel, platform, quality, output_dir` | Starts Streamlink recording in the background |
| `stop_recording` | `stream_id` | Terminates the recording process tree |
| `is_recording` | `stream_id` | Checks if a specific stream is actively recording |
| `list_recordings` | — | Returns all active recording entries and statuses |
| `scan_orphans` | `output_dir` | Scans for incomplete `.ts` files |
| `recover_orphan_recording` | `orphan_id` | Remuxes an orphaned `.ts` file into `.mp4` |
| `dismiss_orphan_recording` | `orphan_id` | Deletes an orphaned `.ts` file from disk |
| `open_recording_folder` | `stream_id, output_dir` | Opens the recording destination directory in File Explorer |

### Emitted Events

| Event | Payload | When |
|---|---|---|
| `recording-install-progress` | `{ step: string, progress: number }` | Progress updates during dependency download/installation |
| `recording:started` | `{ streamId, channel, platform }` | Streamlink process successfully spawned |
| `recording:stopping` | `{ streamId }` | Recording stop requested |
| `recording:stream-ended` | `{ streamId, channel }` | Stream finished naturally (clean exit code 0) |
| `recording:error` | `{ streamId, error }` | Streamlink process error or non-zero exit |
| `recording:remux-started` | `{ streamId }` | FFmpeg `.ts` to `.mp4` remuxing started |
| `recording:remux-progress` | `{ streamId, bytes, totalBytes }` | Real-time byte conversion progress from FFmpeg |
| `recording:remux-finished` | `{ streamId }` | Remuxing completed successfully, `.ts` deleted |
| `recording:remux-failed` | `{ streamId, error }` | FFmpeg remuxing failed |
| `recording:orphans-found` | `{ orphans: OrphanRecording[] }` | Unconverted `.ts` files detected |

---

## 8. Testing Strategy

The Rust backend adopts a pragmatic **AAA (Arrange, Act, Assert)** unit testing methodology, heavily focused on separating pure business logic from side-effect-heavy Tauri/I/O boundaries.

Because testing deep IPC interactions or WebSocket lifecycles can be brittle and slow, we use the **Extract Method** pattern to isolate core logic.

### Pure Function Extraction

Functions containing complex business rules, conditional logic, or data formatting are extracted into pure `pub(crate)` helper functions so they can be comprehensively unit tested without invoking `tauri::AppHandle`, `reqwest::Client`, or actual network sockets.

**Examples:**
- `twitch/irc.rs`: The complex logic to parse IRC strings was extracted into `parse_tags` and `parse_privmsg`, which are now protected by exhaustive unit tests simulating real edge cases (missing attributes, malformed tags, empty payloads) without needing a real WebSocket.
- `kick/oauth.rs`: The username extraction from deeply nested HTTP JSON responses is isolated to `extract_username`, tested against empty arrays to prevent panics.
- `kick/api.rs`: Mapping HTTP status codes (401, 403, 429) to internal domain errors (`KickError::OAuth`) is isolated and tested in `map_api_status`.
- `audio/transcription.rs`: Determining the correct `whisper-cli` filename depending on the compilation target (`OS` + `ARCH`) is tested across matrix combinations without needing the actual file system.

This surgical approach ensures the highest code reliability across Windows, macOS, and Linux without the overhead of heavy Mocking libraries or End-to-End flaky tests for pure business rules.
