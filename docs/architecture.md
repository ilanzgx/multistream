# Multistream Architecture & System Design
  
> **Last Updated:** 2026-09-26  

This document serves as the comprehensive, end-to-end architectural guide for **Multistream**. It details both high-level system interactions and low-level component designs across the desktop application, the Rust native backend, the landing website, the browser extension, the testing framework, and the multi-stage QA Gate CI/CD automation infrastructure.

---

## 1. High-Level System Overview & Philosophy

Multistream is a native, cross-platform desktop application built with **Tauri 2**, **Vue 3**, and **Rust**, allowing power users to watch multiple concurrent live streams (Twitch, Kick, YouTube, and Custom embeds) with unified real-time chat, stream recording, and local AI audio transcription.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                          MULTISTREAM MONOREPO                                          │
│                                                                                                        │
│   ┌───────────────────────────┐  ┌───────────────────────┐                                             │
│   │        apps/website       │  │     apps/extension    │                                             │
│   │   - Astro 7 (SSG)         │  │   - Manifest V3       │                                             │
│   │   - Landing Page & SEO    │  │   - Chromium & Gecko  │                                             │
│   │   - GitHub Releases API   │  │   - DOM / Iframe Scan │                                             │
│   │   - Share Link Generator  │  │   - One-Click Action  │                                             │
│   └─────────────┬─────────────┘  └───────────┬───────────┘                                             │
│                 │                            │                                                         │
│                 │ Generates                  │ Generates                                               │
│                 │ multistream://share?...    │ multistream://add?streams=...                           │
│                 ▼                            ▼                                                         │
│       ┌─────────────────────────────────────────────────┐                                              │
│       │        OS-LEVEL DEEP LINK BRIDGE PROTOCOL       │                                              │
│       │                 (multistream://)                │                                              │
│       └────────────────────────┬────────────────────────┘                                              │
│                                │ Launches / Injects Streams                                            │
│                                ▼                                                                       │
│   ┌──────────────────────────────────────────────────────────────────┐                                 │
│   │                           apps/desktop                           │                                 │
│   │                                                                  │                                 │
│   │   ┌────────────────────────────────┐    ┌────────────────────┐   │                                 │
│   │   │         Vue 3 Frontend         │◄──►│ Tauri 2 / Rust Core│   │                                 │
│   │   │ - useDeepLink / Router Sync    │IPC │ - Deep Link Plugin │   │                                 │
│   │   │ - StreamGrid (FLIP + Graveyard)│    │ - Tokio & Rustls   │   │                                 │
│   │   │ - Unified Chat (IRC + Pusher)  │    │ - Loopback Audio   │   │                                 │
│   │   └────────────────┬───────────────┘    └─────────┬──────────┘   │                                 │
│   └────────────────────┼──────────────────────────────┼──────────────┘                                 │
│                        │                              │                                                │
│                        │ WebViews                     │ Direct Rust TLS                                │
│                        ▼ (Iframes)                    ▼ Connections                                    │
│   ┌──────────────────────────────────────────────────────────────────┐                                 │
│   │                  THIRD-PARTY STREAMING PLATFORMS                 │                                 │
│   │                                                                  │                                 │
│   │   - Twitch (GQL, Helix REST, IRC WebSocket, Usher HLS)           │                                 │
│   │   - Kick (Public REST v1/v2, Pusher WebSocket, Cloudflare bypass)│                                 │
│   │   - YouTube (Zero-Quota Scraping: /@handle/live, /streams, Home) │                                 │
│   │   - Emote CDNs (7TV, BetterTTV, FrankerFaceZ, DecAPI, Adamcy)    │                                 │
│   └──────────────────────────────────────────────────────────────────┘                                 │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

> **Direct Connections & Deep Linking Architecture:**  
> Both the **Website** (`apps/website`) and the **Browser Extension** (`apps/extension`) operate as native OS deep link generators (`multistream://`). The Desktop Application (`apps/desktop`) intercepts these links via `tauri-plugin-deep-link` / `useDeepLink.ts` and automatically injects streams into the grid without any intermediary network proxy. The Desktop Application is the sole entity connecting end-to-end to official streaming platforms (Twitch, Kick, YouTube) via isolated WebViews and Rust native TLS sockets.

### 1.1 Core Architectural Principles

1. **Privacy by Design & Zero Middleman Servers:**
   - 100% client-side execution. No intermediary proxies, central databases, or tracking telemetry.
   - All external connections (API calls, WebSocket chat, stream iframes) terminate directly between the user's desktop client and official third-party platform endpoints.
2. **Resource Efficiency (Tauri vs. Electron):**
   - Built on Tauri 2 using the OS-native webview engine (WebView2 on Windows, WebKitGTK on Linux, WKWebView on macOS) backed by a lightweight async Rust runtime.
   - Drastically lower baseline memory and binary footprints compared to Chromium-bundled Electron apps.
3. **100% Offline AI Transcription:**
   - Real-time live audio transcription and English translation run entirely on the local CPU via embedded `whisper.cpp` (`whisper-cli`) sidecar binaries and GGML models, avoiding recurring cloud AI API costs or latency.
4. **Resilient Third-Party Integration:**
   - Graceful degradation in the presence of aggressive anti-bot protections (Cloudflare on Kick, bot-detection on YouTube) using Rust-level TLS fingerprint alignment, user-agent harmonization, and localized in-memory TTL caching.
5. **Fail-Safe Webview Stability:**
   - Elimination of WebView IPC Mojo cascades (`ChannelError`) caused by abrupt DOM unmounting of media iframes through a strictly orchestrated two-phase Graveyard mechanism.
6. **Zero-Browser Autonomous Workflow:**
   - Active elimination of the need for external browser tabs to find, verify, or import streams. Everything previously performed manually—hunting for active YouTube/Twitch/Kick live links, checking who is currently broadcasting, and copying URLs—is integrated directly into native in-app status polling, suggestions, and one-click deep linking.

---

## 2. Monorepo Structure

Multistream is structured as a Bun monorepo (`bun.lock`, root `package.json` workspaces):

```
multistream/
├── .agents/                      # Specialized Agent skills & operational playbooks
│   └── skills/                   # Domain guides (backend, frontend, testing, graveyard, etc.)
├── .github/                      # CI/CD Workflows & Issue/PR templates
│   ├── scripts/                  # Lighthouse summary generator
│   └── workflows/
│       ├── ci.yml                # Comprehensive test, lint, typecheck, Lighthouse & Rust cross-build
│       └── release.yml           # Cross-platform Tauri release bundler & updater publisher
├── apps/
│   ├── desktop/                  # Tauri 2 Desktop Application
│   │   ├── e2e/                  # Playwright end-to-end desktop test suite
│   │   ├── src/                  # Vue 3 Frontend source code
│   │   │   ├── assets/           # Static images, icons, and branding
│   │   │   ├── components/       # Vue UI components (chat, stream, main, dialogs, ui)
│   │   │   ├── composables/      # Shared reactive business logic (VueUse createSharedComposable)
│   │   │   ├── config/           # App, platform, API, and CDN configurations
│   │   │   ├── i18n/             # Vue I18n setup & 10 locale JSON dictionaries
│   │   │   ├── lib/              # URL parsing, stream resolving, HTTP fetch abstractions
│   │   │   ├── types.ts          # Global frontend TypeScript types
│   │   │   ├── App.vue           # Root desktop application shell
│   │   │   └── main.ts           # Frontend bootstrap & splashscreen dismiss entrypoint
│   │   └── src-tauri/            # Tauri 2 Rust Native Backend
│   │       ├── binaries/         # Precompiled sidecar executables (whisper-cli)
│   │       ├── capabilities/     # Tauri 2 ACL & window capability definitions (default.json)
│   │       ├── permissions/      # Custom IPC command permission manifests (custom.toml)
│   │       ├── icons/            # Platform-specific application icon assets
│   │       ├── src/              # Rust source code
│   │       │   ├── audio/        # System audio loopback capture (CPAL) & Whisper pipeline
│   │       │   ├── core/         # Injected Webview scripts (graveyard, shortcuts, screenshot)
│   │       │   ├── kick/         # Kick PKCE OAuth, Pusher WS chat, and REST API client
│   │       │   ├── recording/    # Streamlink / FFmpeg sidecar management & orphan recovery
│   │       │   ├── twitch/       # Twitch Device Flow, Helix REST, Usher HLS, & IRC client
│   │       │   ├── youtube/      # Zero-quota 2-phase scraping, concurrency semaphore, cache
│   │       │   ├── lib.rs        # Tauri builder, plugin chain, IPC registration, tray menu
│   │       │   ├── main.rs       # Application entrypoint
│   │       │   ├── models.rs     # Shared cross-domain serializable structs
│   │       │   ├── notifications.rs # Cross-platform desktop push notifications
│   │       │   └── screenshot.rs # Hardware-accelerated base64 frame capture
│   │       ├── Cargo.toml        # Rust backend dependencies & release profiles
│   │       └── tauri.conf.json   # Tauri bundle, window, CSP, and updater configuration
│   ├── extension/                # Multistream Browser Extension (Manifest V3)
│   │   ├── dist/                 # Packed distribution artifacts (multistream-extension.zip)
│   │   ├── icons/                # Extension toolbar & store icons (16, 32, 48, 128 px)
│   │   ├── background.js         # Service worker, DOM inspection, iframe heuristics & deep linking
│   │   ├── manifest.json         # Manifest V3 specification (Chromium & Gecko cross-compatible)
│   │   └── README.md             # Extension installation and usage instructions
│   └── website/                  # Product Landing Page & Deep Link Gateway
│       ├── src/
│       │   ├── components/       # Astro UI components (Header, Hero, Changelog)
│       │   ├── i18n/             # Static UI dictionaries & language route resolver
│       │   ├── layouts/          # Base HTML layout with Vercel Analytics & Speed Insights
│       │   ├── lib/              # GitHub REST API client (stars, releases, download assets)
│       │   ├── pages/            # Multi-language routes (/en/, /pt-br/) and auto-redirect
│       │   └── styles/           # Tailwind CSS v4 configuration & styles
│       ├── astro.config.mjs      # Astro configuration, sitemap, and robots.txt
│       └── package.json          # Website dependencies & scripts
├── docs/                         # Architectural documentation & technical specifications
├── scripts/                      # Developer tooling & repository maintenance scripts
│   ├── cargo-test.ts             # Fast cargo check / backend test runner
│   ├── check-endpoints.ts        # Health check probe for 17 external APIs & CDNs
│   ├── i18n.ts                   # CLI tool for 10-language key parity & translation updates
│   ├── pack-extension.ts         # Browser extension bundler & packaging validation
│   └── sync-version.ts           # Semantic version synchronizer across all 6 config files
├── AGENTS.md                     # Engineering standards & constraints for AI pair programmers
└── package.json                  # Root monorepo scripts & linting configurations
```

---

## 3. Desktop Application Architecture (`apps/desktop/`)

The desktop application pairs a reactive Vue 3 frontend with an asynchronous Rust backend through Tauri 2's secure Inter-Process Communication (IPC) bridge.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TAURI 2 DESKTOP ARCHITECTURE                     │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                        FRONTEND (Vue 3)                        │   │
│   │                                                                │   │
│   │   [App.vue] Shell                                              │   │
│   │     ├── [StreamGrid.vue] ─── FLIP Grid + Graveyard Iframes     │   │
│   │     ├── [SidebarPanel.vue] ── Chat Tabs, Recents, Settings     │   │
│   │     └── [FollowedChannelsSidebar.vue] ── Live Channel Statuses │   │
│   │                                                                │   │
│   │   [Composables Layer] (useStreams, useLiveStatus, etc.)        │   │
│   └──────────────────────────────┬─────────────────────────────────┘   │
│                                  │                                     │
│                     invoke() / listen() / emit()                       │
│                                  │                                     │
│   ┌──────────────────────────────▼─────────────────────────────────┐   │
│   │                      BACKEND (Rust / Tokio)                    │   │
│   │                                                                │   │
│   │   [lib.rs] Tauri Builder & Core Event Router                   │   │
│   │     ├── [twitch]    Helix REST, Usher HLS, IRC WebSocket       │   │
│   │     ├── [kick]      PKCE OAuth, Pusher WS, Cloudflare bypass   │   │
│   │     ├── [youtube]   2-Phase Scraping, Semaphore, 45s Cache     │   │
│   │     ├── [audio]     WASAPI Loopback Capture + Whisper Sidecar  │   │
│   │     ├── [recording] Streamlink Acquisition + FFmpeg Remuxer    │   │
│   │     └── [core]      Injected Scripts & Window Lifecycle        │   │
│   └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Inter-Process Communication (IPC) & Event Contract Matrix

Tauri 2 strictly gates IPC commands through capabilities (`capabilities/default.json`). Below is the complete contract matrix between the Vue frontend and the Rust backend:

| Domain | IPC Command | Input Arguments | Return Type | Emitted Tauri Events |
| :--- | :--- | :--- | :--- | :--- |
| **System** | `splashscreen_ready` | None | `Result<(), String>` | None |
| **System** | `close_splashscreen` | None | `Result<(), String>` | None |
| **Notifications** | `send_notification` | `title, body, avatarUrl, watchText, ignoreText, channel, platform` | `Result<(), String>` | `notification-watch` |
| **Screenshots** | `save_screenshot` | `base64Data, filename` | `Result<String, String>` | None |
| **Screenshots** | `open_screenshot_folder` | `filename` | `Result<(), String>` | None |
| **Twitch Auth** | `twitch_login` | None | `Result<DeviceFlowResponse, TwitchError>` | `twitch-auth-changed`, `twitch-auth-error` |
| **Twitch Auth** | `twitch_cancel_login` | None | `Result<(), TwitchError>` | None |
| **Twitch Auth** | `twitch_logout` | None | `Result<(), TwitchError>` | `twitch-auth-changed`, `twitch-auth-expired` |
| **Twitch Auth** | `twitch_get_auth_state`| None | `Result<AuthState, TwitchError>` | None |
| **Twitch Channels** | `twitch_set_channels` | `channels: Vec<String>` | `Result<(), TwitchError>` | `unified-chat-message`, `twitch-chat-error` |
| **Twitch Chat** | `twitch_get_messages` | None | `Result<Vec<UnifiedChatMessage>, TwitchError>` | None |
| **Twitch Chat** | `twitch_get_connection_state` | None | `Result<ConnectionStateEvent, TwitchError>` | `twitch-connection-state` |
| **Twitch Chat** | `twitch_send_message` | `channel: String, text: String` | `Result<(), TwitchError>` | `unified-chat-message` |
| **Twitch HLS** | `twitch_get_hls_url` | `channel: String` | `Result<String, TwitchError>` | None |
| **Twitch Follows** | `twitch_get_followed_streams` | None | `Result<Vec<FollowedChannel>, TwitchError>` | None |
| **Kick Auth** | `kick_login` | `locale: Option<String>` | `Result<(), KickError>` | `kick-auth-changed`, `kick-auth-error` |
| **Kick Auth** | `kick_cancel_login` | None | `Result<(), KickError>` | None |
| **Kick Auth** | `kick_handle_callback` | `code: String, oauth_state: String` | `Result<(), KickError>` | `kick-auth-changed`, `kick-auth-error` |
| **Kick Auth** | `kick_logout` | None | `Result<(), KickError>` | `kick-auth-changed` |
| **Kick Auth** | `kick_get_auth_state` | None | `Result<KickAuthState, KickError>` | None |
| **Kick Chat** | `kick_send_message` | `broadcaster_user_id: u64, message: String` | `Result<(), KickError>` | `kick-chat-message` |
| **Kick Channels** | `kick_set_channels` | `channels: Vec<(String, u64)>` | `Result<(), KickError>` | `kick-chat-message` |
| **YouTube** | `youtube_check_channels_status` | `channels: Vec<String>` | `Result<Vec<YouTubeChannelStatus>, String>` | None |
| **YouTube** | `youtube_resolve_live_id` | `channel_or_handle: String` | `Result<Option<String>, String>` | None |
| **YouTube** | `youtube_get_suggested_streams` | `locale: Option<String>, limit: Option<usize>` | `Result<Vec<YouTubeSuggestedStream>, String>` | None |
| **YouTube** | `youtube_search_channels` | `query: String` | `Result<Vec<YouTubeSearchResult>, String>` | None |
| **Recording** | `start_recording` | `streamId, channel, platform, quality, outputDir` | `Result<(), String>` | `recording:started`, `recording:error` |
| **Recording** | `stop_recording` | `streamId: String` | `Result<(), String>` | `recording:stopping`, `recording:remux-started`, `recording:remux-progress`, `recording:remux-finished`, `recording:remux-failed` |
| **Recording** | `is_recording` | `streamId: String` | `Result<bool, String>` | None |
| **Recording** | `list_recordings` | None | `Result<Vec<RecordingInfo>, String>` | None |
| **Recording** | `open_recording_folder` | `streamId: String, outputDir: Option<String>` | `Result<(), String>` | None |
| **Recording** | `scan_orphans` | `outputDir: Option<String>` | `Result<Vec<OrphanRecording>, String>` | `recording:orphans-found` |
| **Recording** | `recover_orphan_recording` | `orphanId: String` | `Result<(), String>` | `recording:remux-started`, `recording:remux-finished` |
| **Recording** | `dismiss_orphan_recording` | `orphanId: String` | `Result<(), String>` | None |
| **Recording Deps**| `recording_check_dependencies` | None | `Result<bool, String>` | None |
| **Recording Deps**| `recording_install_dependencies` | None | `Result<(), String>` | `recording-install-progress` |
| **Recording Deps**| `recording_uninstall_dependencies` | None | `Result<(), String>` | None |
| **Recording Deps**| `recording_get_env_size` | None | `Result<u64, String>` | None |
| **Audio AI** | `is_transcription_supported` | None | `bool` | None |
| **Audio AI** | `get_transcription_status` | None | `Result<Value, String>` | None |
| **Audio AI** | `download_whisper_model` | `model_name: String` | `Result<(), String>` | `transcription:download-progress` |
| **Audio AI** | `cancel_whisper_download` | None | `()` | None |
| **Audio AI** | `delete_whisper_model` | `model_name: String` | `Result<(), String>` | None |
| **Audio AI** | `start_transcription` | `model_name: String, translate: bool, chunk_duration: u32` | `Result<(), String>` | `transcription:status`, `transcription:text` |
| **Audio AI** | `stop_transcription` | None | `Result<(), String>` | `transcription:status` |
| **Audio AI** | `set_chunk_duration` | `seconds: u32` | `Result<(), String>` | None |

---

### 3.2 Frontend Architecture (`src/`)

#### 3.2.1 Composables & Reactive State Management
Global application state is managed cleanly without external stores (such as Pinia) by utilizing `@vueuse/core`'s `createSharedComposable`. Each composable encapsulates isolated domain logic:

| Composable | Persistence | Key Responsibilities | Tauri IPC / Network Calls |
| :--- | :--- | :--- | :--- |
| `useStreams.ts` | LocalStorage (`streams`) | Active stream collection, grid calculation (1 to 12 items), 2-phase deletion animation (`leavingIds`), session & historical watch-time tracking (`watchHistory`). | None directly (delegates to recording/codecs). |
| `useLiveStatus.ts` | In-Memory | Single-flight `checkAll()` polling with progressive commits: commits fast platforms (Twitch GraphQL, Kick REST v2) immediately in ~500ms, then merges YouTube scraping results asynchronously; maintains offline confirmation windows, and triggers desktop notifications on offline→online transitions. | `youtube_check_channels_status`, `youtube_get_suggested_streams`, `send_notification`. |
| `useFollowedChannels.ts` | In-Memory | Manages followed and favorite sidebar channels across Twitch, Kick, and YouTube; unblocks initial skeleton loading as soon as fast platforms resolve without waiting for long-tail YouTube scraping. | `twitch_get_followed_streams`, delegates to `useLiveStatus`. |
| `useUnifiedChat.ts` | In-Memory (bounded to 1,000 msgs) | Multiplexes IRC (Twitch) and Pusher (Kick) messages into a unified feed, assigns deterministic neon channel colors, manages optimistic pending messages and rollback. | `twitch_get_messages`, `twitch_set_channels`, `twitch_send_message`, `kick_send_message`. |
| `useTwitchAuth.ts` | In-Memory + AppData | Manages Twitch OAuth Device Flow, token refresh lifecycle, and connection states. | `twitch_login`, `twitch_cancel_login`, `twitch_logout`, `twitch_get_auth_state`. |
| `useKickAuth.ts` | In-Memory + AppData | Manages Kick PKCE OAuth lifecycle, localhost HTTP callback exchange, and token refresh. | `kick_login`, `kick_cancel_login`, `kick_logout`, `kick_get_auth_state`. |
| `useRecording.ts` | In-Memory | Manages stream recording sessions, remuxing status, orphan file scanning and recovery, and sidecar dependencies. | `start_recording`, `stop_recording`, `scan_orphans`, `recover_orphan_recording`, `recording_check_dependencies`. |
| `useTranscription.ts`| In-Memory | Manages local Whisper.cpp session state, model downloading with progress and cancellation, chunk duration tuning (5–30s), and live caption text events. | `is_transcription_supported`, `download_whisper_model`, `start_transcription`, `stop_transcription`, `set_chunk_duration`. |
| `useFavorites.ts` | LocalStorage (`favorites`) | User-pinned favorite channels across platforms. | None. |
| `useRecents.ts` | LocalStorage (`recents`) | History of recently watched channels (bounded to 30 items). | None. |
| `usePreferences.ts`| LocalStorage (`preferences`) | User settings: notifications enabled, hardware acceleration, native player toggles, custom recording output directory, language selection. | None. |
| `useDeepLink.ts` | Lifecycle Listener | Intercepts `multistream://` URL schemes (e.g. `multistream://share?twitch=gaules&youtube=...`) and automated Kick OAuth callbacks. | `onOpenUrl`, `getCurrent`, `kick_handle_callback`. |
| `useUpdater.ts` | In-Memory | Polls GitHub Releases for signed OTA desktop updates, downloads delta packages, and restarts. | `@tauri-apps/plugin-updater`. |
| `useScreenshot.ts` | In-Memory | Triggers canvas capture of focused video streams and invokes native save dialog. | `save_screenshot`, `open_screenshot_folder`. |

---

### 3.3 State Machine Diagrams & Core Workflows

#### 3.3.1 Stream Lifecycle & The Graveyard Mechanism (`StreamGrid.vue`)

In Tauri and Chromium-based WebViews (WebView2), immediately removing an `iframe` with active media pipelines or WebSocket connections from the DOM can trigger a catastrophic Mojo IPC crash (`ChannelError`), bringing down the entire application window.

Multistream resolves this through a **Two-Phase Graveyard Architecture**:

```
[User clicks Close on a Stream]
               │
               ▼
[Step 1: Leaving Animation] ──► Sets `isLeaving(id) = true` (opacity 0, scale 0.95 over 250ms)
               │
               ▼ (After 250ms timeout)
[Step 2: Remove from streams array] ──► Flushes watch time, stops active recordings
               │
               ▼
[Step 3: Graveyard Watcher in StreamGrid]
  ├── If custom stream or Native HLS Twitch:
  │     └── Bypasses graveyard ──► Unmounts immediately from DOM
  └── If standard iframe stream:
        ├── Marks `_isDead = true` in domStreams array
        ├── Applies `v-show="false"` (keeps iframe mounted in DOM)
        └── Sends postMessage: `{ type: 'MULTISTREAM_GRAVEYARD_SUSPEND' }`
               │
               ▼
[Step 4: Script Interception inside WebView]
  ├── Intercepted by Rust-injected `graveyard_script`
  ├── HTMLMediaElement.prototype.play monkey-patched to Promise.reject("Graveyard mode")
  ├── AudioContext.prototype.createGain locked at volume = 0
  ├── All existing <video> and <audio> elements silenced, muted, and paused
  └── MutationObserver chokes any audio/video element spawned asynchronously
               │
               ▼
[Step 5: Garbage Collection (GC) Sweep]
  ├── Checks if ANY active stream of that platform remains open
  ├── IF count > 0: Dead iframes remain dormant in background
  └── IF count === 0: GC safely unmounts ALL dead iframes of that platform at once
```

```
[Focus Mode FLIP Animation Flow]
  1. FIRST:   Query DOM and record getBoundingClientRect() of all cells in `prevRects` map
  2. LAST:    Update Vue CSS grid template (e.g. 25% side column / 75% focused main column)
  3. INVERT:  Apply inverse CSS transform: translate(dx, dy) scale(scaleX, scaleY)
  4. PLAY:    Double requestAnimationFrame clears transform and triggers a 300ms cubic-bezier transition
```

#### 3.3.2 Recording Lifecycle State Machine (`src/recording/`)

```
      [User requests recording]
                 │
                 ▼
         ┌───────────────┐
         │    IDLE       │
         └───────┬───────┘
                 │ invoke("start_recording", { streamId, quality })
                 ▼
         ┌───────────────┐
         │   STARTING    │ ◄─── Validate channel name & resolve Streamlink sidecar
         └───────┬───────┘
                 │ Process spawned & stdout pipe connected
                 ▼
         ┌───────────────┐
         │   RECORDING   │ ◄─── Periodic ticker increments elapsed timer every 1s
         └───────┬───────┘      Raw MPEG-TS/HLS stream piped directly to disk
                 │
        ┌────────┴──────────────────────────┐
        │ User requests stop                │ Stream ended / Network disconnect
        ▼                                   ▼
 ┌───────────────┐                  ┌───────────────┐
 │   STOPPING    │                  │ STREAM_ENDED  │
 └───────┬───────┘                  └───────┬───────┘
         │ Streamlink process killed gracefully
         ▼
 ┌───────────────┐
 │   REMUXING    │ ◄─── FFmpeg invoked: -c copy -movflags +faststart (Zero lossy re-encoding)
 └───────┬───────┘      Emits `recording:remux-progress` (bytes / totalBytes)
         │
    ┌────┴──────────────────────────┐
    │ Remuxing completes            │ Remuxing encounters error
    ▼                               ▼
┌───────────────┐           ┌───────────────┐
│     SAVED     │           │     ERROR     │
└───────────────┘           └───────┬───────┘
                                    │
                                    ▼
                            ┌───────────────┐
                            │ ORPHAN FILE   │ ◄─── Discovered on next app launch via `scan_orphans`
                            └───────┬───────┘      Recoverable into playable .mp4 via `recover_orphan`
                                    │
                                    ▼
                            ┌───────────────┐
                            │   RECOVERED   │
                            └───────────────┘
```

#### 3.3.3 YouTube Live Discovery & Anti-429 State Machine (`src/youtube/`)

```
               [Incoming Channel Check (@handle or videoId)]
                                     │
                                     ▼
                    ┌───────────────────────────────────┐
                    │ Multi-Key TTL Cache (45 Seconds)  │
                    └────────────────┬──────────────────┘
                                     │
                     ┌───────────────┴───────────────┐
                     │ Cache Hit                     │ Cache Miss
                     ▼                               ▼
           ┌───────────────────┐           ┌───────────────────┐
           │ Return cached     │           │ Global Semaphore  │
           │ status instantly  │           │ (Limit: 4 max)    │
           └───────────────────┘           └─────────┬─────────┘
                                                     │
                                                     ▼
                                   ┌───────────────────────────────────┐
                                   │ Phase 1: Mandatory Gatekeeper     │
                                   │ GET /@{handle}/live               │
                                   └─────────────────┬─────────────────┘
                                                     │
                             ┌───────────────────────┴───────────────────────┐
                             │ Live signal detected                          │ Channel confirmed offline
                             ▼                                               ▼
           ┌───────────────────────────────────┐           ┌───────────────────────────────────┐
           │ Phase 2: Tier 1 Discovery         │           │ Instant Fast-Path Exit            │
           │ GET /@{handle}/streams (4s)       │           │ Skip Phase 2 (Save 50% bandwidth) │
           └─────────────────┬─────────────────┘           │ isLive = false, liveStreams = []  │
                             │                             └─────────────────┬─────────────────┘
             ┌───────────────┴───────────────┐                               │
             │ Lives found >= 1              │ 0 Lives found                 │
             │ (Active stream exists)        │ (30-item upcoming trap)       │
             ▼                               ▼                               │
   ┌───────────────────┐           ┌───────────────────┐                     │
   │ Skip Tier 2!      │           │ Phase 2: Tier 2   │                     │
   │ Save bandwidth    │           │ GET /@{handle}    │                     │
   └─────────┬─────────┘           │ (Channel Home)    │                     │
             │                     └─────────┬─────────┘                     │
             │                               │                               │
             └───────────────┬───────────────┘                               │
                             │                                               │
                             ▼                                               │
           ┌───────────────────────────────────┐                             │
           │ Populate liveStreams vector       │                             │
           │ Extract concurrent viewers regex  │                             │
           └─────────────────┬─────────────────┘                             │
                             │                                               │
                             ▼                                               │
           ┌───────────────────────────────────────────────────┐             │
           │ In-Memory Cache Write (45s TTL multi-key)         │◄────────────┘
           │ Key aliases: @handle, handle, displayName, vid    │
           └───────────────────────────────────────────────────┘
```

> **YouTube Optimization & Anti-429 Resilience Details:**
> - **Global Semaphore:** Concurrency throttled to 4 concurrent scrapes (`Semaphore::new(4)`) to balance high throughput against HTTP 429 rate limiting.
> - **Aggressive Timeouts:** Phase 1 client timeout set to 6s; Phase 2 `/streams` and channel home timeouts set to 4s.
> - **Offline Fallback Caching:** When a channel or video ID fails resolution or returns offline, an explicit `is_live = false` fallback status is written to `STATUS_CACHE` for 45s. This prevents repeated slow scraping requests across rapid subsequent polls.
> - **Batch Concurrency:** `check_channels_status_batch` spawns concurrent Tokio tasks and resolves them via `futures_util::future::join_all`, maximizing I/O concurrency within the semaphore bounds.

#### 3.3.4 Audio Transcription Pipeline State Machine (`src/audio/`)

```
   [User activates Transcription]
                 │
                 ▼
   ┌───────────────────────────┐
   │ CPAL WASAPI Capture Loop  │ ◄─── Windows Audio Session API loopback (No virtual cables)
   └─────────────┬─────────────┘
                 │
                 ▼
   ┌───────────────────────────┐
   │ Resample to 16kHz Mono f32│
   └─────────────┬─────────────┘
                 │
                 ▼
   ┌───────────────────────────┐
   │ Backlog Bounded Buffer    │ ◄─── Backlog ceiling drops oldest audio if inference slows down
   └─────────────┬─────────────┘
                 │ Buffer length >= chunk_duration (5–30s dynamic)
                 ▼
   ┌───────────────────────────┐
   │ Silence Gate (RMS Check)  │
   └─────────────┬─────────────┘
                 │
         ┌───────┴───────────────────────┐
         │ RMS < 0.001 (Silent audio)    │ RMS >= 0.001 (Speech detected)
         ▼                               ▼
   ┌───────────┐                   ┌───────────────────────────┐
   │ Skip loop │                   │ Write 16kHz WAV Chunk     │
   │ iteration │                   └─────────────┬─────────────┘
   └───────────┘                                 │
                                                 ▼
                                   ┌───────────────────────────┐
                                   │ Spawn whisper-cli Sidecar │
                                   │ - Model: ggml-{name}.bin  │
                                   │ - Suppress non-speech     │
                                   │ - Optional --translate    │
                                   └─────────────┬─────────────┘
                                                 │
                                                 ▼
                                   ┌───────────────────────────┐
                                   │ Clean output & Emit Text  │
                                   │ event: transcription:text │
                                   └───────────────────────────┘
```

---

## 4. Website Architecture (`apps/website/`)

The Multistream public landing page (`usemultistream.vercel.app`) is built with **Astro 7** and **Tailwind CSS v4** deployed statically on Vercel.

```
┌──────────────────────────────────────────────────────────────────┐
│                     apps/website ARCHITECTURE                    │
│                                                                  │
│   [Astro SSG Static Pages]                                       │
│     ├── /                      Auto language detection & redirect│
│     ├── /en/                   English Landing Page              │
│     └── /pt-br/                Portuguese (Brazil) Landing Page  │
│                                                                  │
│   [Dynamic GitHub Integration] (`src/lib/github.ts`)             │
│     ├── fetchRepoStars()       Live GitHub Stargazer Count       │
│     ├── fetchLatestAssets()    Direct Windows/macOS/Linux URLs   │
│     └── fetchRecentReleases()  Dynamic Changelog Markdown        │
│                                                                  │
│   [Deep Link Gateway]                                            │
│     └── Direct redirection to desktop app (`multistream://`)     │
│                                                                  │
│   [Observability]                                                │
│     ├── @vercel/analytics                                        │
│     └── @vercel/speed-insights                                   │
└──────────────────────────────────────────────────────────────────┘
```

1. **Static Site Generation (SSG):** Zero runtime JavaScript overhead by default; interactive components hydrate only as needed.
2. **Dynamic GitHub Release Integration:** Build step fetches GitHub repository stars and releases from `https://api.github.com/repos/ilanzgx/multistream/releases/latest`, populating direct installer download buttons for Windows (`.msi`, `.exe`), macOS (`.dmg`), and Linux (`.AppImage`, `.deb`).
3. **Deep Link Gateway:** Web links using the `multistream://` protocol launch the local desktop application and automatically inject shared multi-stream configurations.

---

## 5. Browser Extension Architecture (`apps/extension/`)

The **Multistream Browser Extension** (`apps/extension/`) provides a one-click bridge between standard desktop browsers and the Multistream desktop application. It detects live streams and custom HTML5 video players on any active web page and instantly dispatches them to the running desktop grid via OS-level deep linking.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    BROWSER EXTENSION ARCHITECTURE                                      │
│                                                                                                        │
│   [User Trigger]                                                                                       │
│     ├── Browser Action Click (Toolbar Icon)                                                            │
│     └── Context Menu Right-Click ("Add to Multistream" on page, link, or iframe)                       │
│                                           │                                                            │
│                                           ▼                                                            │
│   [background.js Service Worker]                                                                       │
│     ├── 1. Direct URL Route (info.linkUrl / info.frameUrl)                                              │
│     └── 2. Active Tab DOM Inspection (chrome.scripting.executeScript)                                  │
│                                           │                                                            │
│                                           ▼                                                            │
│   [Multi-Tier Platform & Player Heuristic Detection]                                                   │
│     ├── Twitch: Extract login handle, reject static paths, verify live badge / playing video           │
│     ├── Kick: Extract channel slug, reject directory paths, verify active video player                 │
│     ├── YouTube: Extract 11-char ID from URL params or DOM meta itemprop="videoId" + live badge check │
│     └── Custom Video Players:                                                                          │
│           ├── Heuristic Iframe Scorer (Dimensions >= 300x160, Aspect Ratio 1.1-2.6, Tracker Filter)   │
│           │   - Bonus Scoring: allowfullscreen (+50k), media permissions (+50k), player regex (+100k) │
│           └── HTML5 <video> Detector (Controls, readyState, .m3u8 source, player dimensions)           │
│                                           │                                                            │
│                                           ▼                                                            │
│   [Deep Link Generation]                                                                               │
│     ├── Twitch:  multistream://add?streams=twitch:{channel}                                            │
│     ├── Kick:    multistream://add?streams=kick:{channel}                                              │
│     ├── YouTube: multistream://add?streams=youtube:{videoId}                                           │
│     └── Custom:  multistream://add?c={safeBase64([{ u: iframeUrl, n: streamName }])}                   │
│                                           │                                                            │
│                                           ▼                                                            │
│   [Visual User Feedback & Protocol Launch]                                                             │
│     ├── Injected Dark Toast: #multistream-extension-toast (Slide-in animation, dot indicator)          │
│     ├── Toolbar Badge State: "✓" in emerald (#059669) or "✕" in zinc (#3f3f46)                        │
│     └── chrome.tabs.update(tab.id, { url: deepLink }) ──► Multistream Desktop App Window Focus       │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Manifest V3 & Cross-Browser Engine Compatibility

The extension is designed around **Manifest V3** with cross-engine manifest normalization:
- **Chromium Engines (Chrome, Brave, Edge, Opera):** Uses the `background.service_worker: "background.js"` worker architecture.
- **Gecko Engine (Firefox):** Uses `background.scripts: ["background.js"]` alongside strict extension ID declarations in `browser_specific_settings.gecko` (`id: "extension@multistream.app"`, `strict_min_version: "121.0"`).
- **Permissions Footprint:** Minimized strictly to:
  - `activeTab`: Access only to the currently focused tab upon explicit user invocation.
  - `scripting`: Programmatic execution of extraction heuristics and feedback toasts.
  - `contextMenus`: Right-click contextual integration for links and iframe elements.

### 5.2 Stream & Player Extraction Engine

#### 1. Known Platform Fast-Path
- **Twitch:** Detects channel paths from `twitch.tv/{channel}` while filtering out reserved routes (`directory`, `videos`, `settings`, `drops`, `subscriptions`, etc.). Checks DOM for active broadcast indicators (`.tw-channel-status-text-indicator`, viewer counts, and playing `<video>` elements), preventing offline channels from being mistakenly added.
- **Kick:** Detects channels from `kick.com/{channel}` while filtering out system routes (`categories`, `video`, `following`, etc.). Verifies playing state on `#main-view video` or `.vjs-tech` while verifying that offline flags (`.stream-offline`) are absent.
- **YouTube:** Prioritizes active playback:
  - Resolves standard watch URLs (`v=VIDEO_ID`), short URLs (`youtu.be/VIDEO_ID`), and `/live/VIDEO_ID` paths.
  - On channel pages (`youtube.com/@handle`), queries `<meta itemprop="videoId">` and verifies active live indicators (`.ytp-live-badge:not([disabled])`, `badge-style-type-live-now`, `ytd-watch-flexy[is-live]`), ignoring static homepage trailers.

#### 2. Custom Player & Iframe Heuristic Scoring Engine
For non-standard streaming websites, the extension inspects all `<iframe>` elements and evaluates a multi-factor fitness score:
1. **Tracker & Ad Network Filter:** Filters out trackers, advertising networks, CAPTCHAs, and payment frames via regex:
   ```javascript
   /(googleads|doubleclick|googletag|recaptcha|hcaptcha|turnstile|stripe|paypal|facebook|twitter|instagram|tiktok\.com\/embed|disqus|zendesk|intercom|crisp|trustpilot|spotify|soundcloud|hubspot|onetrust|cookie|analytics|adservice)/i
   ```
2. **Dimensional Boundaries:** Requires genuine player dimensions: `width >= 300px` and `height >= 160px`.
3. **Aspect Ratio Sanity Check:** Requires landscape video ratios: `1.1 <= width / height <= 2.6`.
4. **Attribute & Keyword Scoring:**
   - Base Score = `width * height`
   - +50,000 points if `allowfullscreen` is enabled
   - +50,000 points if media permissions (`autoplay`, `encrypted-media`, `picture-in-picture`) are present
   - +100,000 points if URL contains player keywords (`player`, `embed`, `stream`, `live`, `m3u8`, `hls`, `broadcast`)
The highest-scoring candidate is selected, preserving the page title as the stream display name.

### 5.3 Extension Build & Packaging Pipeline

- **Validation:** `bun run extension:check` compiles `background.js` via `Bun.build({ target: "browser" })` to ensure zero syntax errors before distribution.
- **Packaging:** `bun run extension:pack` bundles `manifest.json`, `background.js`, `icons/`, and `README.md` into `apps/extension/dist/multistream-extension.zip` using native system archivers (`tar` on Windows/macOS, `zip` on Linux).
- **Version Alignment:** `scripts/sync-version.ts` includes `apps/extension/manifest.json` in semantic version updates across the monorepo.

---

## 6. Security & Isolation Model

Multistream implements strict security boundaries across both Tauri IPC and embedded WebViews:

1. **Content Security Policy (CSP):**
   ```text
   default-src 'self' http://ipc.localhost;
   script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:;
   style-src 'self' 'unsafe-inline';
   img-src 'self' data: https:;
   frame-src https://player.twitch.tv https://www.twitch.tv https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com https://youtube-nocookie.com https://player.kick.com https://kick.com https:;
   connect-src 'self' http://ipc.localhost http://localhost https: data: blob:;
   media-src 'self' blob: data: https:;
   worker-src 'self' blob:;
   child-src 'self' blob:;
   ```
2. **Tauri 2 Access Control List (ACL) & Runtime Authority:**
   In Tauri 2, exposing a Rust function with `#[tauri::command]` and registering it inside `generate_handler![...]` does **not** grant the webview permission to call it. The Tauri Runtime Authority enforces an affirmative-security model: any unpermitted IPC call from JavaScript is rejected instantly at runtime.

   Multistream structures its ACL into two complementary layers:
   
   ```
   ┌────────────────────────────────────────────────────────────────────────┐
   │                       TAURI 2 SECURITY ACL RESOLUTION                   │
   │                                                                        │
   │   [Frontend Webview] invoke("twitch_login")                            │
   │           │                                                            │
   │           ▼                                                            │
   │   [Tauri Runtime Authority]                                            │
   │     ├── Check Window Origin: Is caller window in allowed targets?      │
   │     │   - Target Windows: capabilities/default.json ("*")              │
   │     │   - Allowed Remote Origins: "http://localhost:*"                 │
   │     ├── Check Capability Set: Does window possess the capability?      │
   │     │   - Capability: "default" contains "custom-commands"             │
   │     └── Resolve Permission Manifest:                                   │
   │         - Manifest: permissions/custom.toml                            │
   │         - Permission Identifier: "custom-commands"                     │
   │         - commands.allow: Includes "twitch_login"                      │
   │           │                                                            │
   │           ├── If YES ──► Dispatch to Rust handler in lib.rs            │
   │           └── If NO  ──► Security Exception: Command not allowed       │
   └────────────────────────────────────────────────────────────────────────┘
   ```

   - **Command Permission Manifests (`apps/desktop/src-tauri/permissions/custom.toml`):**
     Defines the explicit permissions for custom native application commands. The `custom-commands` identifier establishes an exhaustive allowlist containing all 47 application IPC commands:
     ```toml
     [[permission]]
     identifier = "custom-commands"
     description = "Enables all custom app commands"
     commands.allow = [
         "send_notification",
         "save_screenshot",
         "open_screenshot_folder",
         "is_transcription_supported",
         "download_whisper_model",
         "cancel_whisper_download",
         "delete_whisper_model",
         "get_transcription_status",
         "start_transcription",
         "stop_transcription",
         "set_chunk_duration",
         "twitch_login",
         "twitch_cancel_login",
         "twitch_logout",
         "twitch_get_auth_state",
         "twitch_set_channels",
         "twitch_get_messages",
         "twitch_get_connection_state",
         "twitch_send_message",
         "kick_login",
         "kick_cancel_login",
         "kick_handle_callback",
         "kick_logout",
         "kick_get_auth_state",
         "kick_send_message",
         "kick_set_channels",
         "twitch_get_followed_streams",
         "twitch_get_hls_url",
         "start_recording",
         "stop_recording",
         "is_recording",
         "list_recordings",
         "open_recording_folder",
         "recover_orphan_recording",
         "dismiss_orphan_recording",
         "is_recording_supported_cmd",
         "recording_check_dependencies",
         "recording_install_dependencies",
         "recording_uninstall_dependencies",
         "recording_get_env_size",
         "scan_orphans",
         "splashscreen_ready",
         "close_splashscreen",
         "youtube_get_suggested_streams",
         "youtube_resolve_live_id",
         "youtube_check_channels_status",
         "youtube_search_channels"
     ]
     ```
     Any command added to Rust that is omitted from `commands.allow` is automatically blocked by the runtime authority, preventing accidental exposure of internal commands.

   - **Window Capabilities Specification (`apps/desktop/src-tauri/capabilities/default.json`):**
     Maps the defined permissions and official Tauri plugin permissions to application windows and origins:
     - **Window Scoping:** Applied to all windows (`"windows": ["*"]`).
     - **Localhost Remote Scope:** Configures `"remote": { "urls": ["http://localhost:*"] }` to grant IPC access to assets served via `tauri-plugin-localhost` (port 14831 in production) or the Vite development server (port 5173).
     - **Granular Plugin Allowlist:** Restricts official plugin capabilities to the minimum necessary surface:
       - `core:default`, `core:window:allow-create`: Window lifecycle control.
       - `updater:*`: Download and install signed desktop updates.
       - `process:allow-restart`: App restarts following updates.
       - `notification:*`: Native OS push notifications.
       - `http:allow-fetch`: Scoped exclusively to official platform domains (`https://api.twitch.tv/**`, `https://gql.twitch.tv/**`, `https://id.twitch.tv/**`, `https://kick.com/api/**`, `https://kick.com/stream/**`).
       - `shell:allow-open`: Shell execution restricted strictly to default browser URL opening.
       - `deep-link:*`: OS scheme handler registration and URL ingestion.
       - `store:default`: Persistent key-value configuration storage.
       - `dialog:default`: Native file and folder picker dialogs.
       - `fs:allow-write-text-file`: File export and backup capabilities.
       - `custom-commands`: The full custom application command set defined in `permissions/custom.toml`.

3. **Single Instance Enforcement (`tauri-plugin-single-instance`):**
   - Prevents port collisions and multiple competing sidecars by focusing the existing main window when subsequent instances or deep link URLs are launched.

4. **Input Sanitization & Path Traversal Prevention:**
   - Channel names, recording filenames, and model names are strictly validated (`validate_model_name`, `sanitize_filename`) against directory traversal characters (`..`, `/`, `\`) before spawning filesystem or sidecar operations.

---

## 7. Multi-Stage QA Gate & Testing Architecture

Multistream employs a zero-compromise, multi-stage Quality Assurance (QA) Gate system. Code cannot be merged into `main` or packaged into releases without successfully completing every validation gate in sequence.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               MULTI-STAGE QA GATE PIPELINE                              │
│                                                                                        │
│   [Gate 0: Local Developer Machine]                                                    │
│     ├── Husky Pre-Commit Hook ──► Staged i18n key consistency (check:i18n)             │
│     ├── Lint-Staged ────────────► Oxlint, ESLint fix, Prettier, Cargo fmt              │
│     └── Commitlint ─────────────► Conventional Commits grammar check                   │
│                                           │                                            │
│                                           ▼                                            │
│   [Gate 1: Static Code Analysis & Type Safety (CI)]                                    │
│     ├── Frontend Type Check ────► vue-tsc -b (Strict mode, zero errors allowed)        │
│     ├── Website Type Check ─────► astro check                                          │
│     ├── Browser Extension ──────► bun run extension:check && extension:pack            │
│     └── Rust Clippy Linter ─────► cargo clippy -- -D warnings                          │
│                                           │                                            │
│                                           ▼                                            │
│   [Gate 2: Unit & Integration Verification (AAA Protocol)]                             │
│     ├── Frontend Unit Tests ────► Vitest (AAA structure, isolated effectScopes)        │
│     ├── Backend Unit Tests ─────► Cargo Nextest (Native Rust async tests)              │
│     └── Perimeter Health Probe ─► check-endpoints.ts (17 live stream APIs & CDNs)      │
│                                           │                                            │
│                                           ▼                                            │
│   [Gate 3: Cross-Platform Native Compilation Matrix]                                   │
│     ├── Linux x86_64 ───────────► WebKitGTK 4.1, ALSA, AppIndicator                    │
│     ├── macOS ARM64 (Apple Sil.)► Universal Binary Clang & Nextest                     │
│     ├── macOS x86_64 (Intel) ───► Universal Binary Clang & Nextest                     │
│     └── Windows x86_64 (MSVC) ──► WinRT notifications, WebView2 SDK, WASAPI CPAL       │
│                                           │                                            │
│                                           ▼                                            │
│   [Gate 4: End-to-End System Tests (Playwright)]                                       │
│     ├── Chromium Desktop Run ───► Complete user journey & state isolation              │
│     ├── Grid Manipulation ──────► FLIP animations, drag-and-drop, stream additions     │
│     └── Artifact Preservation ──► Screenshots, DOM snapshots, network traces          │
│                                           │                                            │
│                                           ▼                                            │
│   [Gate 5: Automated Performance, Accessibility & SEO Audits (Lighthouse CI)]          │
│     ├── Desktop App Audit ──────► Desktop preset (1280x720): Perf >= 70, A11y >= 90   │
│     └── Website SSG Audit ──────► Multi-locale (/en/, /pt-br/): A11y >= 95, SEO >= 95 │
│                                           │                                            │
│                                           ▼                                            │
│   [Gate 6: Release & Binary Verification Gate]                                         │
│     ├── Semantic Version Sync ──► 6 configuration files kept in strict sync            │
│     ├── Minisign Code Signing ──► Ed25519 payload signing with encrypted private key   │
│     └── Tauri Updater Artifact ─► latest.json signature manifest generation           │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 7.1 Gate 0: Local Developer Machine (Git Hooks & Lint-Staged)

Before any commit or push is accepted locally, Husky triggers automated validation:
1. **i18n Consistency Check (`.husky/pre-commit`):**
   - If any file within `apps/desktop/src/i18n/` is staged, the hook executes `bun run check:i18n`. If a key exists in `en.json` but is missing from any of the other 9 locales, the commit is immediately blocked.
2. **Lint-Staged Pipeline:**
   - `*.{js,ts,vue}`: Formatted with Prettier, statically analyzed with Oxlint, and linted with ESLint.
   - `*.rs`: Formatted via `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --`.
3. **Commitlint Grammar Verification:**
   - Enforces Conventional Commits: `<type>(<optional scope>): <description>`. Valid types: `feat`, `fix`, `chore`, `style`, `refactor`, `test`, `ci`, `perf`, `debug`. Multiline commit messages require a blank separating line.

---

### 7.2 Gate 1: Static Code Analysis & Type Safety (CI)

Executed on GitHub Actions on every Pull Request and branch push:
1. **Frontend Type Verification:** Runs `vue-tsc -b` in `apps/desktop`. No implicit `any`, unresolved imports, or invalid template prop bindings are permitted.
2. **Website Type Verification:** Runs `astro check` in `apps/website` to ensure strict prop and content schema conformance.
3. **Rust Clippy Gate:** Runs `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings`. Warnings are treated as compile errors, enforcing zero compiler warnings, idiomatic borrow checking, and memory safety.
4. **Extension Pack Verification:** Runs `scripts/pack-extension.ts` to validate manifest syntax and bundle integrity.

---

### 7.3 Gate 2: Unit & Integration Verification (The AAA Protocol)

Multistream mandates the **Arrange, Act, Assert (AAA)** pattern across all unit test suites. Every test case must explicitly delineate each phase using explicit code comments (`// Arrange`, `// Act`, `// Assert`).

#### 7.3.1 The 5 Iron Laws of Testing
1. **Strict State Isolation:** Composables must be evaluated inside an isolated Vue `effectScope()`. All `localStorage` keys, singletons, and mocks must be cleared in `beforeEach()`, and `scope.stop()` called in `afterEach()`.
2. **Zero Order Dependencies:** Test cases must execute deterministically in any random sequence without leaking global state.
3. **Assert Specific Outcomes:** Strict assertions (`.toBe()`, `.toEqual()`) are required; loose boolean checks (`.toBeTruthy()`) are prohibited.
4. **No Production Network Calls:** All Tauri IPC commands (`invoke`), event listeners (`listen`), and browser network calls (`fetch`) must be mocked.
5. **Leak Prevention:** Mocked globals (`vi.stubGlobal("fetch", ...)`) must be restored via `vi.unstubAllGlobals()` in `afterEach()`.

#### 7.3.2 Third-Party Perimeter Health Check (`scripts/check-endpoints.ts`)
As part of CI, Multistream executes an automated probe across 17 external HTTP endpoints:
- Twitch GQL API & Helix endpoints
- Kick API v1, v2, and featured livestreams endpoints
- YouTube channel page HTML responses and embed URLs
- Emote CDNs: 7TV Global & User endpoints, BetterTTV Global & User endpoints, Adamcy Global emotes, and DecAPI avatar endpoints.
This probe detects third-party upstream breaking changes, bot-perimeter shifts, or rate-limiting events proactively.

---

### 7.4 Gate 3: Cross-Platform Native Compilation Matrix

The Tauri Rust backend is compiled and tested across 4 distinct native architectures in parallel:

| Platform Runner | Target Architecture | Key System Libraries Tested |
| :--- | :--- | :--- |
| `ubuntu-latest` | `x86_64-unknown-linux-gnu` | `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `libasound2-dev` |
| `macos-latest` | `aarch64-apple-darwin` (Apple Silicon) | Native CoreAudio, AppKit, WKWebView |
| `macos-latest` | `x86_64-apple-darwin` (Intel Mac) | Universal binary target parity |
| `windows-latest` | `x86_64-pc-windows-msvc` | Windows SDK, WinRT notifications, WebView2 SDK, WASAPI loopback capture |

Testing is executed with `cargo nextest run --profile ci` combined with cross-compilation caches (`Swatinem/rust-cache@v2`), ensuring fast build times and zero platform-specific regressions.

---

### 7.5 Gate 4: End-to-End System Tests (Playwright E2E)

Desktop end-to-end tests live in `apps/desktop/e2e/` and execute against a headless Chromium browser in GitHub Actions:
- **Decoupled Test IDs:** UI elements are targeted via explicit `data-testid` attributes (e.g. `page.getByTestId('stream-item-gaules')`) to prevent tests from failing on CSS or layout changes.
- **State Initialization:** Local storage state is explicitly initialized or reset before test runs using `page.evaluate()` to guarantee test repeatability.
- **Interaction Coverage:** Tests validate user journeys: stream addition via input bar, stream deletion, grid transitions, focus mode toggles, chat switching, and settings persistence.
- **Failure Artifacts:** Playwright automatically captures and stores trace logs, screenshots, and video recordings as CI artifacts retained for 7 days upon test failure.

---

### 7.6 Gate 5: Automated Performance, Accessibility & SEO Audits (Lighthouse CI)

Multistream enforces strict performance and accessibility thresholds on both the desktop application and the landing website using `@lhci/cli` (`treosh/lighthouse-ci-action`):

#### 7.6.1 Desktop Application Thresholds (`apps/desktop/lighthouserc.json`)
- **Emulation:** Desktop preset, 1280x720 screen resolution, 3 independent runs.
- **Threshold Assertions:**
  - **Performance:** `minScore: 0.70` (warn)
  - **Accessibility:** `minScore: 0.90` (warn)
  - **Best Practices:** `minScore: 0.90` (warn)

#### 7.6.2 Website Landing Page Thresholds (`apps/website/lighthouserc.json`)
- **Emulation:** Desktop preset, 1280x720 screen resolution, 3 independent runs across both `/en/` and `/pt-br/` localized routes.
- **Threshold Assertions:**
  - **Performance:** `minScore: 0.90` (warn)
  - **Accessibility:** `minScore: 0.95` (warn)
  - **Best Practices:** `minScore: 0.90` (warn)
  - **Search Engine Optimization (SEO):** `minScore: 0.95` (warn)
- **Job Summary Reporting:** Evaluated runs trigger `.github/scripts/lighthouse-summary.mjs` to render interactive summary tables directly inside GitHub Actions PR workflow summaries.

---

### 7.7 Gate 6: Release & Binary Verification Gate

When a new version tag is pushed, the `release.yml` pipeline triggers:
1. **Semantic Version Synchronization:** `scripts/sync-version.ts` validates that version numbers match across all 6 configuration files:
   - Root `package.json`
   - `apps/desktop/package.json`
   - `apps/website/package.json`
   - `apps/extension/manifest.json`
   - `apps/desktop/src-tauri/tauri.conf.json`
   - `apps/desktop/src-tauri/Cargo.toml`
2. **Minisign Cryptographic Signing:** Release binaries (`.msi`, `.exe`, `.dmg`, `.AppImage`, `.deb`) are signed using Tauri's Minisign Ed25519 key (`TAURI_SIGNING_PRIVATE_KEY`).
3. **Updater Manifest Generation:** Generates the signed `latest.json` updater manifest, allowing deployed desktop installations to update seamlessly via `tauri-plugin-updater`.

---

## 8. Developer & Operator Quick Reference

### 8.1 Monorepo Commands

| Command | Action |
| :--- | :--- |
| `bun run desktop:tauri:dev` | Launch Desktop Tauri application in local development mode |
| `bun run desktop:typecheck` | Run `vue-tsc` type checker across the desktop frontend |
| `bun run desktop:test` | Run Vitest frontend unit tests |
| `bun run desktop:test:backend` | Run Rust backend tests via `cargo nextest` |
| `bun run desktop:test:e2e` | Run Playwright end-to-end tests |
| `bun run website:dev` | Start Astro development server for the landing website |
| `bun run website:build` | Build static production assets for the landing website |
| `bun run extension:check` | Statically validate browser extension background syntax |
| `bun run extension:pack` | Package browser extension into distribution zip archive |
| `bun run i18n:check` | Verify key parity across all 10 localization files |
| `bun run check:endpoints` | Probe health of external Twitch, Kick, and YouTube endpoints |
| `bun run version <version>` | Synchronize semantic version across all 6 configuration files |

---

*Multistream Architecture Specification — Living Document.*
