# Multistream — Rust Backend (`src-tauri`)

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

- `PRIVMSG` → parses tags (id, color, badges, emotes) → emits `unified-chat-message`
- `NOTICE msg-id=msg_*` → emits `twitch-chat-error` (signals optimistic message rollback in the frontend)
- `NOTICE Login authentication failed` → stops the loop, emits `twitch-auth-expired`

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
invoke("save_screenshot", { data_url, filename }) → string (file path)
```

Receives a base64 data URL (`data:image/png;base64,...`) generated by the frontend via `canvas.toDataURL()`, decodes it, and saves the PNG to:
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

Local stream recording is powered by [Streamlink](https://streamlink.github.io/) (and `ffmpeg` for remuxing), executed natively via `std::process::Command`.

### Architecture Insight: Why not use Tauri Sidecars?

To maintain Multistream's core philosophy of being incredibly lightweight and performant, we intentionally avoided bundling Streamlink, Python, and FFmpeg as [Tauri Sidecars](https://v2.tauri.app/concept/sidecar/). 

Bundling these executables would bloat the initial application installer by hundreds of megabytes. Instead, we use an **On-Demand Portable Environment**:
- The dependencies are only downloaded if the user explicitly enables the Recording feature.
- When enabled, the app downloads a standalone Python embed, installs the `streamlink` pip package, and fetches a standalone `ffmpeg.exe`.
- Everything is kept isolated in `%APPDATA%\multistream\recording_env`.
- We then interact with them directly via Rust's native `std::process::Command`, avoiding any heavy wrappers (like Node.js servers) and maintaining near-zero overhead.

### Recording Process

```text
start_recording
  └─ Checks if the `recording_env` exists and is valid.
  └─ Resolves the correct platform URL (e.g., `twitch.tv/<channel>`).
  └─ Spawns the Streamlink process:
       streamlink <url> <quality> --output <Videos>/Multistream/<platform>/<channel>_...ts
  └─ Saves the `Child` process handle in a global `Arc<Mutex<HashMap<String, Child>>>`.
  └─ Spawns a background thread to wait for the process to exit and handle remuxing.
```

When a recording stops, the `.ts` file is automatically remuxed into an `.mp4` file using the portable `ffmpeg`, and the original `.ts` file is deleted. If the app closes abruptly, the `.ts` file remains as an "orphan". 

### Orphan Recovery

`get_orphan_recordings` scans the Videos directory for `.ts` files. The user can choose to convert them to `.mp4` (`remux_orphan_recording`) or discard them (`delete_orphan_recording`).

### Folder Management

`open_recording_folder` uses `tauri-plugin-opener` to natively open the `Videos/Multistream` directory in the OS file explorer without triggering deprecation warnings or blocking the main thread.

### IPC Commands

| Command | Description |
|---|---|
| `is_recording_supported` | `true` if OS is Windows, macOS, or Linux |
| `check_recording_dependencies` | Checks if Streamlink and FFmpeg are present |
| `install_recording_dependencies` | Downloads and sets up the portable environment |
| `start_recording` | Spawns Streamlink for a given channel and quality |
| `stop_recording` | Kills the Streamlink process |
| `get_orphan_recordings` | Returns a list of incomplete `.ts` files |
| `remux_orphan_recording` | Converts a `.ts` file to `.mp4` using FFmpeg |
| `delete_orphan_recording` | Deletes a `.ts` file |
| `open_recording_folder` | Opens the target directory in the OS explorer |
