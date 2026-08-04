---
name: multistream-desktop-backend
description: Pragmatic architecture guide, IPC command patterns, Tokio async concurrency, error handling, security, and unit testing guidelines for the Multistream Tauri 2 Rust backend in apps/desktop/src-tauri/. Refer to apps/desktop/src-tauri/README.md for deep documentation. Use when adding IPC commands, modifying Rust backend logic, integrating APIs, or writing Rust unit tests.
---

# Multistream Tauri Backend Architecture Guide (`apps/desktop/src-tauri/`)

> [!NOTE]
> For the comprehensive module-by-module technical documentation of authentication flows, stream recording pipelines, and sidecar management, refer to [`apps/desktop/src-tauri/README.md`](apps/desktop/src-tauri/README.md).

This guide defines practical engineering patterns, module boundaries, security rules, and testing standards for the Rust backend layer of the Multistream desktop application.

---

## 1. Directory Structure & Core Modules

```
apps/desktop/src-tauri/
├── README.md                       # Comprehensive backend documentation & subsystem guides
├── Cargo.toml                      # Dependencies, profiles (opt-level = "s", LTO) & feature flags
├── tauri.conf.json                 # Tauri configuration, CSP, updater, external sidecars & permissions
├── build.rs                        # Build script for Tauri compilation
├── capabilities/                   # Security capabilities (default.json permissions)
├── permissions/                    # Custom permission definitions (custom.toml)
└── src/
    ├── main.rs                     # Entrypoint (disables WebKit DMABUF on Linux, calls app_lib::run())
    ├── lib.rs                      # Tauri Builder, plugins, IPC commands registration, window setup & script injection
    ├── models.rs                   # Shared data structures (FollowedChannel, etc.)
    ├── notifications.rs            # Native OS notifications (WinRT integration on Windows)
    ├── screenshot.rs               # Canvas/viewport screenshot saving helper
    ├── audio/                      # System audio loopback capture & Whisper.cpp transcription
    │   ├── capture.rs              # cpal WASAPI loopback capture & 16kHz mono resampling
    │   └── transcriber.rs          # Whisper.cpp sidecar process manager, model downloader & IPC events
    ├── kick/                       # Kick API integration & chat protocol
    │   ├── api.rs                  # Kick HTTP API client
    │   ├── commands.rs             # IPC commands (kick_login, kick_send_message, kick_set_channels)
    │   ├── error.rs                # KickError enum (thiserror)
    │   ├── oauth.rs                # PKCE OAuth flow & token refresh
    │   ├── pusher.rs               # WebSocket client for Kick Pusher chat
    │   └── state.rs                # KickState (Arc<Mutex<Option<KickAuthInfo>>>)
    ├── twitch/                     # Twitch API integration & IRC chat protocol
    │   ├── commands.rs             # IPC commands (twitch_login, twitch_send_message, twitch_get_hls_url)
    │   ├── error.rs                # TwitchError enum (thiserror)
    │   ├── irc.rs                  # Native IRC WebSocket connection manager & parser
    │   ├── oauth.rs                # Device Code Flow & token refresh
    │   └── state.rs                # TwitchState & message buffers
    └── recording/                  # Stream recording & remuxing pipeline
        ├── commands.rs             # IPC commands (start_recording, stop_recording, scan_orphans)
        ├── disk.rs                 # Disk space checks before recording/remuxing
        ├── error.rs                # RecordingError enum
        ├── installer.rs            # Python & FFmpeg sidecar dependency checkers
        ├── orphan.rs               # Orphaned .ts recording detection & recovery
        ├── paths.rs                # Target recording directory & file paths
        ├── state.rs                # RecordingManager state
        ├── utils.rs                # Streamlink & FFmpeg process CLI argument builders
        └── validation.rs           # Channel name, stream ID, and path sanitization
```

---

## 2. Core Architectural Principles & Security Rules

### A. Reqwest & Cloudflare Bypass (CRITICAL)
- **Always Use `rustls-tls`:** Default `native-tls` (Schannel on Windows) is aggressively blocked by Cloudflare (HTTP 403 Forbidden).
- **Configuration:** `reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "stream", "json"] }`.
- **User-Agent:** Always set a realistic Chrome User-Agent header when making requests to Twitch, Kick, or Usher GQL endpoints:
  ```rust
  const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  ```
- Refer to [`apps/desktop/src-tauri/README.md`](apps/desktop/src-tauri/README.md#2-kick-authentication) for details on PKCE flows and TLS fingerprinting protection.

---

### B. IPC Commands & Serialization Standard
- **Macro Registration:** Every IPC function exposed to the frontend MUST use `#[tauri::command]`.
- **Parameter & Return Matching:** Parameter names in Rust (`snake_case`) map automatically to JS (`camelCase`). Structs returned to the frontend MUST derive `serde::Serialize` with `#[serde(rename_all = "camelCase")]`.
- **Error Handling in Commands:** Commands MUST return `Result<T, ModuleError>` where `ModuleError` implements `serde::Serialize` or string conversion via `thiserror`.

#### Example IPC Command (`src/example/commands.rs`):

```rust
use serde::Serialize;
use tauri::{AppHandle, State};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ExampleError {
    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Not authenticated")]
    Unauthenticated,
}

impl Serialize for ExampleError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExamplePayload {
    pub channel_id: String,
    pub is_active: bool,
}

#[tauri::command]
pub async fn example_get_info(
    app: AppHandle,
    state: State<'_, ExampleState>,
    channel_name: String,
) -> Result<ExamplePayload, ExampleError> {
    if channel_name.trim().is_empty() {
        return Err(ExampleError::Unauthenticated);
    }

    Ok(ExamplePayload {
        channel_id: channel_name.to_lowercase(),
        is_active: true,
    })
}
```

---

### C. Concurrency, State & Lock Safety
- **State Managed via AppHandle:** Store application state in `lib.rs` setup using `app.manage(StateStruct::new())`.
- **Async Locks:** Use `tokio::sync::Mutex` for state accessed across `.await` points.
- **Scope-Bound Guards:** Always keep lock guards scoped as tightly as possible to prevent deadlocks:
  ```rust
  // Good: Drop lock guard before making HTTP request
  let auth = {
      let guard = state.auth.lock().await;
      guard.clone()
  };
  let res = http_client.get(...).bearer_auth(&auth.token).send().await?;
  ```
- **Cancellation Safety:** In long-running background polling or OAuth loops, await HTTP requests inside `tokio::select!` blocks with cancellation tokens.

---

### D. WebView Injection & Graveyard Protection
- Global scripts injected in `lib.rs` via `initialization_script_for_all_frames(...)`:
  - `graveyard_script`: Intercepts `MULTISTREAM_GRAVEYARD_SUSPEND` postMessage to mute/pause `HTMLMediaElement` and monkey-patch `AudioContext` to silence dead iframe streams without unmounting them immediately (preventing WebView Mojo `ChannelError` crashes).

---

## 3. Writing Unit Tests in Rust (AAA Pattern)

All logic, parsers, and utility functions MUST have unit tests inside `#[cfg(test)]` modules using explicit **Arrange, Act, Assert** comments.

### Example Unit Test (`src/example/parser.rs`):

```rust
pub fn parse_channel_url(input: &str) -> Option<(&str, &str)> {
    if input.contains("twitch.tv/") {
        let name = input.split("twitch.tv/").nth(1)?.split('/').next()?;
        Some(("twitch", name))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_parse_valid_twitch_url() {
        // Arrange
        let url = "https://www.twitch.tv/gaules";

        // Act
        let result = parse_channel_url(url);

        // Assert
        assert_eq!(result, Some(("twitch", "gaules")));
    }

    #[test]
    fn should_return_none_for_invalid_url() {
        // Arrange
        let url = "https://invalid-website.com/user";

        // Act
        let result = parse_channel_url(url);

        // Assert
        assert!(result.is_none());
    }
}
```

---

## 4. Pragmatic Scaling & Quality Checklist

Before completing any backend modification in `apps/desktop/src-tauri/`:

1. 📖 **Read Subsystem Docs:** Consult [`apps/desktop/src-tauri/README.md`](apps/desktop/src-tauri/README.md) for detailed flowcharts and API tables for Twitch, Kick, Whisper, and Recording subsystems.
2. 🧪 **Check Compilation:** Run `cargo check` inside `apps/desktop/src-tauri/` to verify zero compiler errors or warnings.
3. 🛡️ **Check Security & Headers:** Ensure `reqwest` uses `rustls-tls` and passes a valid Chrome `User-Agent`.
4. 🔒 **No Unwraps in Production:** Replace `unwrap()` with `?`, `match`, or `.expect("descriptive failure reason")`.
5. 📝 **Sync Command in `lib.rs`:** Ensure any new `#[tauri::command]` function is registered in `tauri::generate_handler![...]` in `lib.rs` AND in capability permissions (`capabilities/default.json`).
6. ⚡ **Write Unit Tests:** Verify all parsing or data manipulation functions with `cargo test` using explicit `// Arrange`, `// Act`, `// Assert` blocks.
