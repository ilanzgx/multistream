# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Power live stream viewers, esports enthusiasts, multi-POV tournament watchers, and broadcast followers who monitor multiple streamers across Twitch, Kick, and YouTube simultaneously without opening browser tabs.

## Product Purpose

Multistream eliminates browser dependency ("Zero-Browser Workflow") by providing a dedicated, high-performance desktop multi-stream client. It enables users to watch multiple concurrent broadcasts with synchronized/unified chat, offline local AI transcription, zero-loss stream recording, and real-time live channel discovery—all running locally with low CPU and memory consumption.

## Positioning

100% local processing with zero telemetry, zero middleman proxy servers, and zero cloud API fees. Native desktop performance built with Tauri 2 and Rust, establishing direct connections to official platform endpoints and integrating deeply with the OS via custom deep-link protocols.

## Operating Context

- Desktop operating systems (Windows, macOS, Linux) across single, high-DPI, and multi-monitor setups.
- Real-time tournament marathons, speedrun events, and collabs where multiple high-bitrate video streams run simultaneously alongside rapid chat feeds.
- Offline and privacy-sensitive environments where cloud tracking is strictly avoided and AI transcription must execute on the local CPU.

## Capabilities and Constraints

- **Multi-Platform Video Engine:**
  - **Twitch:** Official embedded player or experimental native HLS player via `Hls.js` and `<video>` with stream quality selector, buffering backoff, and 30s offline auto-recovery polling.
  - **Kick:** Embedded player with automated Cloudflare bypass, OAuth token auto-refresh on 401/403, and Pusher WebSocket chat subscription.
  - **YouTube:** 100% local, zero-API-quota scraping in Rust. Two-phase discovery pipeline (Phase 1 gatekeeper `/@handle/live`, Phase 2 tiered discovery `/@handle/streams` and home shelf fallback to defeat the 30-item pagination trap). Throttled through a global 4-permit semaphore and a 45s TTL cache. Frontend requires a 10-minute continuous offline window before removing channels from the sidebar.
  - **Custom Streams:** Secure protocol normalization (strictly `http:`/`https:`) with immediate garbage collection.
- **Unified & Native Chat:**
  - **Unified Chat:** Strictly read-only multiplexing Twitch (IRC over WebSocket) and Kick (Pusher WebSocket) into a single feed with channel color strips, avatars, and inline platform icons.
  - **Native Individual Chat:** Message dispatching via Rust IPC with optimistic UI injection (`isPending=true`) and smart reverse-iteration rollback on IRC `NOTICE` or Pusher errors.
  - **Rich Chat Editor:** Contenteditable editor supporting inline 3rd-party emotes (Twitch, 7TV, BetterTTV, FrankerFaceZ), caret range preservation, and an emote picker with an iframe blur guard.
- **Local Stream Recording:**
  - Sidecar management for Streamlink and FFmpeg.
  - On-the-fly container remuxing directly into `.mp4` (`-c copy`) without lossy video re-encoding, preserving native source quality with negligible CPU overhead.
  - Strict path traversal sanitization, directory picking via native Tauri file dialogs, and automated recording termination on application reload (`stop_all_recordings_on_reload`).
- **Local AI Live Transcription (Whisper.cpp):**
  - Offline speech-to-text powered by Whisper.cpp (`whisper-cli`) executing on CPU.
  - System audio loopback capture via CPAL (Windows-only) without microphone access.
  - Multi-tier live subtitles overlay with receding opacity ladder (100% -> 60% -> 30%) and historical transcript sidebar with language detection and inference latency telemetry.
- **Deep Link Bridge Protocol (`multistream://`):**
  - Seamless inter-app communication: website (`apps/website`) generates `multistream://share?...` links, and the browser extension (`apps/extension`) auto-detects browser tabs to launch `multistream://add?streams=...`.
  - Tauri deep-link plugin integration and shareable URL query parsing.
- **WebView IPC & Graveyard Mechanism (CRITICAL):**
  - WebView2/Chromium crashes (`ChannelError` Mojo cascade) when active video iframes are abruptly unmounted from the DOM.
  - Two-phase teardown ("Graveyard"): Closing a stream marks it dead (`_isDead=true`), hides it visually (`v-show="false"`), and sends `MULTISTREAM_GRAVEYARD_SUSPEND` postMessage to mute audio and pause media.
  - Garbage collection occurs safely only when the last active stream of that platform is closed.
- **Session & Backup Management:**
  - Full configuration backup/restore to JSON files (streams, favorite channels, custom settings).

## Brand Commitments

- **Name:** Multistream
- **Visual Aesthetic:** Minimalist dark/neutral theme (`bg-[#0f1115]`, subtle borders `#2a2d33`, text `#e0e0e0` / `gray-400`), functional studio UI, strictly avoiding decorative noise or jarring colors.
- **Voice:** Pragmatic, power-user oriented, performant, transparent, and privacy-respecting.

## Evidence on Hand

- Architecture documentation: `docs/architecture.md` and `docs/youtube-live-architecture.md`
- Frontend code & composables: `apps/desktop/src/`
- Rust backend core & IPC: `apps/desktop/src-tauri/`
- Monorepo rules: `AGENTS.md`

## Product Principles

1. **Zero-Browser Workflow:** Discover, search, verify live status, and watch without ever opening a separate browser tab.
2. **Privacy by Design:** 100% local processing; direct platform connections; zero third-party tracking, analytics, or cloud AI fees.
3. **Lightweight & High-Performance:** Tauri 2 + Rust core ensuring minimal system overhead compared to traditional browser tabs or Electron wrappers.
4. **Resilience & Stability:** Bulletproof multi-stream stability using the Graveyard iframe lifecycle, optimistic UI with smart rollbacks, and rate-limited scraping.
5. **Universal Portability:** Seamless cross-app deep linking, full backup exports, and complete i18n parity across 10 locales.

## Accessibility & Inclusion

- Localized across 10 languages: English, Portuguese, Spanish, German, Russian, Chinese, French, Turkish, Hindi, and Indonesian.
- High-contrast readability on neutral dark backgrounds with headless, accessible UI primitives via Reka UI.
- Comprehensive keyboard navigation shortcuts (`D` to add stream, `F` for focus mode, arrows for navigation, escape for modals).
