# YouTube Live Detection & Scraping Architecture

## 1. Executive Summary & Design Overview

YouTube does not provide a public, unauthenticated WebSocket or push API for real-time live stream statuses without paid Google Cloud API quotas. Multistream resolves YouTube stream states (online/offline, viewer count, title, game/category, and avatar) entirely locally through lightweight HTTP scraping directly from the user's desktop client via Tauri's Rust backend (`apps/desktop/src-tauri/src/youtube/`).

### 1.1 Key Architectural Decisions

1. **Zero Push Notifications for YouTube**:
   - Unlike Twitch (IRC/GQL) and Kick (Pusher WebSocket / API), YouTube stream scraping over raw HTML lacks sub-second determinism. Due to YouTube's CDN edge caching, geo-distributed servers, and recommendation sidebar shifts, transient status oscillations can occur.
   - Consequently, **desktop push notifications are explicitly disabled for YouTube channels**. YouTube live state is strictly reflected within the in-app UI (the sidebar badge, live indicator, and channel list in `FollowedChannelsSidebar.vue`).
2. **Fast-Path for Offline Channels**:
   - Scraping offline channels bypasses deserialization and traversal of the ~1MB `ytInitialData` JSON AST, extracting metadata in sub-millisecond time via HTML `<meta>` tags.
3. **Timestamp-Based Offline Confirmation (10-Minute Window)**:
   - To eliminate UI flickering and prevent channels from dropping out during transient CDN glitches or stream end transitions, YouTube channels utilize a timestamp-based confirmation window (`offlineSinceMs >= 10 * 60 * 1000`). A channel requires 10 continuous minutes of offline readings before being confirmed offline and removed from the sidebar. Any live poll immediately resets the timer, and previous confirmed live state is defensively preserved via `previousStatuses.value[key]`.
4. **Global Scraping Rate-Limiting & Concurrency Control**:
   - To prevent HTTP 429 ("Too Many Requests") rate limits from YouTube's anti-scraping perimeter, all outgoing YouTube HTTP requests across all application components are gated through a process-wide global static semaphore (`Semaphore::new(2)`).
5. **Global In-Memory 45-Second Multi-Key TTL Cache**:
   - All live channel scrape results are cached for 45 seconds in an in-memory `Mutex<HashMap<String, (Instant, YouTubeLiveResponse)>>`. Caches are indexed across `@handle`, clean handle, display name, primary `videoId`, and all discovered sub-stream `videoId`s. Queries matching sub-streams dynamically clone and update `res.video_id` to preserve distinct stream IDs.
6. **Optimized Two-Tier Phase 2 Multiplexing**:
   - Instead of blindly fetching both `/streams` and the Channel Home page simultaneously on every live check, Phase 2 queries `/@{handle}/streams` first with a 10s timeout. If active live broadcasts are found, the Home page request is skipped entirely (saving 50% bandwidth). The Home page is queried only if `/streams` returns 0 live broadcasts (defeating the 30-item upcoming pagination trap).

---

## 2. YouTube Data Ingestion Pipeline

YouTube responses contain two major JavaScript data islands injected into the HTML:
1. `ytInitialPlayerResponse`: Active player state for the specific stream/video (`/watch?v=...` or `/@handle/live` redirect).
2. `ytInitialData`: Channel page layout, stream tabs, and recommendations sidebar (`/@handle/streams` or channel home).

```
                              [Channel Handle / URL]
                                         │
                                         ▼
                     ┌───────────────────────────────────────┐
                     │ Global In-Memory TTL Cache (45s)      │
                     │ (Matches handle, videoId, sub-streams)│
                     └───────────────────┬───────────────────┘
                                         │
                         ┌───────────────┴───────────────┐
                         │ Cache Hit                     │ Cache Miss
                         ▼                               ▼
               ┌───────────────────┐     ┌───────────────────────────────────────┐
               │ Return cached     │     │ Global Static Semaphore (Limit: 2)    │
               │ status instantly  │     │ (Prevents HTTP 429 rate limiting)     │
               └─────────┬─────────┘     └───────────────────┬───────────────────┘
                         │                                   │
                         │                                   ▼
                         │               ┌───────────────────────────────────────┐
                         │               │ Phase 1: Primary Gatekeeper           │
                         │               │ GET /@{handle}/live                   │
                         │               │ (reqwest + rustls, custom UA & lang)  │
                         │               └───────────────────┬───────────────────┘
                         │                                   │
                         │           ┌───────────────────────┴───────────────────────┐
                         │           │                                               │
                         │           ▼ (Redirects to /watch or Live Player)          ▼ (Offline Channel Page)
                         │ ┌───────────────────────────┐                   ┌───────────────────────────┐
                         │ │  ytInitialPlayerResponse  │                   │ No Active Live Broadcast  │
                         │ │  - isLive: true           │                   │ - is_not_currently_live   │
                         │ │  - isUpcoming: false      │                   │ - Skip /streams & home    │
                         │ │  - playability: "OK"      │                   │ - Sub-ms metadata extract │
                         │ │  - liveBroadcastDetails   │                   │ Latency: < 0.1ms parse    │
                         │ └─────────────┬─────────────┘                   └─────────────┬─────────────┘
                         │               │                                               │
                         │               ▼                                               ▼
                         │ ┌───────────────────────────┐                   ┌───────────────────────────┐
                         │ │ Gatekeeper PASSED (Live)  │                   │ is_live = false           │
                         │ │ Channel is confirmed live │                   │ display_name, avatar_url  │
                         │ └─────────────┬─────────────┘                   │ live_streams: []          │
                         │               │                                 └─────────────┬─────────────┘
                         │               ▼                                               │
                         │ ┌─────────────────────────────────────────┐                   │
                         │ │ Phase 2: Tiered Multiplexer             │                   │
                         │ │ Tier 1: GET /@{handle}/streams (10s)    │                   │
                         │ │ (If lives found -> skip Tier 2!)        │                   │
                         │ │ Tier 2 (Fallback): GET /@{handle} (Home)│                   │
                         │ │ (Only if /streams has 0 lives)          │                   │
                         │ │ - Bypasses 30-item upcoming trap        │                   │
                         │ │ - Merges & deduplicates active streams  │                   │
                         │ │ - Populates live_streams: Vec<Stream>   │                   │
                         │ └─────────────────────┬───────────────────┘                   │
                         │                       │                                       │
                         │                       ▼                                       │
                         │ ┌─────────────────────────────────────────┐                   │
                         │ │ Cache Write (45s TTL multi-key)         │                   │
                         │ │ is_live = true, live_streams: [...]     │                   │
                         │ └─────────────────────┬───────────────────┘                   │
                         │                       │                                       │
                         └───────────────────────┼───────────────────────────────────────┘
                                                 │
                                             │
                                             ▼
                         ┌───────────────────────────────────────┐
                         │ Tauri IPC: youtube_check_channels     │
                         └───────────────────┬───────────────────┘
                                             │
                                             ▼
                         ┌───────────────────────────────────────┐
                         │ Frontend Composable (useLiveStatus)   │
                         │ - 10-min timestamp confirmation window│
                         │ - Resilient against CDN/poll jitter   │
                         │ - Populates status.liveStreams        │
                         └───────────────────┬───────────────────┘
                                             │
                                             ▼
                         ┌───────────────────────────────────────┐
                         │ useFollowedChannels Composable        │
                         │ - Expands 1 favorite -> N live cards  │
                         │ - Unique ID: stream.videoId           │
                         │ - Injected into Sidebar Component     │
                         └───────────────────────────────────────┘
```

---

## 3. The 14 YouTube Broadcast States & Classification Matrix

YouTube broadcasts exist in multiple subtle states. The scraper classifies them strictly through scoped node checks rather than global string scans:

| # | Broadcast State | `isLive` (videoDetails) | `isUpcoming` | `playabilityStatus` | `liveBroadcastDetails.isLiveNow` | Scraper Classification | UI Behavior |
|---|---|---|---|---|---|---|---|
| **1** | **Active Live Stream** | `true` | `false` | `"OK"` | `true` | **LIVE** | Displays red Live badge + viewer count |
| **2** | **Scheduled / Waiting Room** | `false` or `true` | `true` | `"LIVE_STREAM_OFFLINE"` | `false` (has `startTimestamp`) | **OFFLINE** | Shown as offline; stream not yet active |
| **3** | **Stream Just Ended (VOD Processing)** | `false` | `false` | `"ENDED"` or `"OK"` | `false` (has `endTimestamp`) | **OFFLINE** | Transitions to offline after hysteresis |
| **4** | **Multiple Simultaneous Lives** | `true` on video A, `true` on video B | `false` | `"OK"` | `true` | **LIVE** (Specific `videoId`) | Resolves active `videoId` |
| **5** | **Premiere (Countdown)** | `false` | `true` | `"LIVE_STREAM_OFFLINE"` | `false` | **OFFLINE** | Offline |
| **6** | **Premiere (Broadcasting)** | `true` | `false` | `"OK"` | `true` | **LIVE** | Live badge |
| **7** | **Shorts Live** | `true` | `false` | `"OK"` | `true` | **LIVE** | Live badge |
| **8** | **Member-Only Live** | `true` | `false` | `"UNPLAYABLE"` (Members only) | `true` | **LIVE** | Live (plays when user logs in via webview) |
| **9** | **Age-Restricted Live** | `true` | `false` | `"LOGIN_REQUIRED"` | `true` | **LIVE** | Live (requires webview session) |
| **10** | **Geo-Restricted Live** | `true` | `false` | `"UNPLAYABLE"` (Region block) | `true` | **OFFLINE** | Inaccessible in user locale |
| **11** | **Anti-Bot / Consent Page** | N/A | N/A | N/A | N/A | **NETWORK ERROR** | Retains previous state, logs debug warning |
| **12** | **Channel Home (No Active Live)** | N/A | N/A | N/A | N/A | **OFFLINE** | Fast-path metadata extraction |
| **13** | **Transient CDN Reconnect** | `true` | `false` | `"OK"` (Buffer gap) | `true` | **LIVE** | Hysteresis prevents UI drop |
| **14** | **Custom URL / Handle Redirect** | `true` (303 -> `/watch`) | `false` | `"OK"` | `true` | **LIVE** | Follows redirects and extracts canonical ID |

---

## 4. Analysis of Flaws & Historical Pitfalls

### 4.1 Global HTML Substring Matching (Fixed)
- **Problem**: Earlier iterations performed naive string matching across the entire 500KB HTML body:
  ```rust
  // DEPRECATED ANTI-PATTERN:
  html.contains(r#""isUpcoming":true"#) || html.contains(r#""status":"ENDED""#)
  ```
- **Consequence**: The recommendation sidebar (`twoColumnWatchNextResults.secondaryResults`) frequently contains recommended upcoming streams or past VODs from other creators. A live stream with 50,000 viewers would be falsely marked offline whenever a recommended video in the sidebar was upcoming or had ended.
- **Remedy**: All status indicators are strictly scoped to `ytInitialPlayerResponse.videoDetails` and `playerMicroformatRenderer.liveBroadcastDetails`.

### 4.2 The Channel Page Trailer Trap (`is_not_currently_live` on Channel Pages) (Fixed)
- **Problem**: When inspecting a channel page (such as `/@handle/streams` or channel home), YouTube injects a `ytInitialPlayerResponse` representing the channel's featured trailer video or channel preview clip.
- **Consequence**: The featured trailer video almost always has `isLive: false` and duration timestamps. Calling `is_not_currently_live(player_data)` indiscriminately on channel page HTML caused immediate, false offline classifications for actively broadcasting channels (e.g. CNN Brasil, Lofi Girl).
- **Remedy**: Player-based offline validation is strictly scoped to watch pages (`/watch?v=...`) or `/@handle/live` responses. On channel pages, the presence of active live stream cards in `ytInitialData` takes precedence, and featured trailers are never treated as channel broadcast status indicators.

### 4.3 The `/@handle/streams` Primary URL Pitfall & 16M-View VOD Leakage (Fixed)
- **Problem**: In an attempt to discover multiple concurrent streams in a single network request, `/@handle/streams` was tested as the primary detection URL.
- **Consequence**: When a channel is offline (e.g. `@getv`), YouTube's `/@handle/streams` tab renders past recorded live streams (VODs) sorted by recency or popularity. For example, channel `@getv` returned a popular past broadcast with 16 million views (`NiqY3agWAQM`). Because `/streams` contains no live player response to reject, the scraper mistakenly treated the top VOD as an active live stream with millions of viewers.
- **Remedy**: Never use `/@handle/streams` as an unauthenticated gatekeeper. The pipeline enforces `/@handle/live` as the strict Phase 1 gatekeeper. Offline channels exit immediately at Phase 1 and `/streams` is never fetched for offline channels.

### 4.4 Cumulative View Count vs Real-Time Concurrent Viewers (Fixed)
- **Problem**: YouTube watch pages provide two types of viewer counts:
  1. `videoDetails.viewCount`: The *cumulative, rotative lifetime views* accumulated since the stream started (e.g. 977K on a 24/7 live stream or tournament).
  2. `videoViewCountRenderer.originalViewCount` / HTML text `"X assistindo agora"` / `"X watching now"`: The *actual real-time concurrent viewers* watching at that exact second (e.g. 1.7K or 3K).
- **Consequence**: In `FollowedChannelsSidebar.vue`, channels showed astronomical viewer numbers (e.g. 977K viewers) that represented total views instead of concurrent audience.
- **Remedy**:
  - Removed `videoDetails.viewCount` fallback from `find_viewer_count`.
  - Prioritized `extract_viewer_count_from_html` (`originalViewCount` and regex `"([0-9.,]+...)\s*(?:assistindo agora|watching now|assistindo|watching|espectadores)"`).
  - Scoped JSON viewer extraction strictly to `videoViewCountRenderer`.

### 4.5 Video Thumbnail Injected as Channel Profile Picture (Fixed)
- **Problem**: `apps/desktop/src-tauri/src/youtube/api.rs` used `<meta property="og:image">` as a fallback when `avatar_url` was missing. On YouTube watch/live pages, `og:image` is **always the video thumbnail** (`https://i.ytimg.com/vi/<id>/maxresdefault.jpg`), never the channel's profile avatar.
- **Consequence**: `FollowedChannelsSidebar.vue` displayed the video preview thumbnail in the round avatar circle instead of the creator's real profile picture.
- **Remedy**:
  - Completely removed `og:image` as an avatar fallback.
  - Implemented `extract_channel_avatar_from_html(&html)` targeting:
    1. `videoOwnerRenderer.thumbnails`: Channel owner avatar rendered in the video info box.
    2. `channelThumbnailWithLinkRenderer.thumbnails`: Channel header avatar.
    3. Official YouTube CDN regex: `https://yt3.ggpht.com/...=s(48|68|88|176)...` or `yt3.googleusercontent.com`.

### 4.6 The 30+ Scheduled Upcoming Streams Pagination Trap (`/@handle/streams` vs Channel Home) (Fixed)
- **Problem**: When a large sports or event channel (e.g. `@CazeTV`) schedules dozens of future matches, YouTube's `/@handle/streams` tab lists all scheduled broadcasts in chronological order. Because YouTube's initial HTML payload strictly caps the initial `richGridRenderer` contents to the first **30 items** (with subsequent items loaded asynchronously via client-side pagination / continuation tokens), channels with 30+ upcoming events pushed active live broadcasts down to indexes 34, 35, etc.
- **Consequence**: An HTTP GET to `/@handle/streams` returned only the 30 scheduled upcoming streams in the initial HTML. The active concurrent live streams were completely absent from the initial response, resulting in 0 live streams parsed during Phase 2. The sidebar fell back to only the single stream captured by Phase 1's redirect.
- **Remedy**:
  - In Phase 2, `apps/desktop/src-tauri/src/youtube/api.rs` executes concurrent queries using `tokio::join!` to **both** `/@handle/streams` AND the Channel Home page (`https://www.youtube.com/@handle` or `https://www.youtube.com/channel/<id>`).
  - While the `/streams` tab is cluttered with future schedules, YouTube's Channel Home page **always pins active live broadcasts to the prominent "Live Now" ("Ao Vivo Agora") shelf** at the very top of the initial HTML.
  - Active streams found across either tab are merged and deduplicated by canonical 11-character `videoId`.

### 4.7 Cycle-Counting Flaws & Transition to Timestamp-Based Offline Confirmation (Fixed)
- **Problem**: Earlier iterations tracked offline channels using an in-memory integer count of consecutive offline poll cycles (`count < maxGraceCycles`). Because polling intervals can vary due to OS throttling, app visibility changes, network delays, or manual refreshes, cycle counting caused unpredictable timing. Channels would either drop prematurely or linger erratically. Furthermore, reading `statuses.value[key]` directly during grace cycles risked reading stale or unconfirmed reactive state.
- **Consequence**: Channels that ended a broadcast could get stuck in the sidebar with old viewer counts, or channels experiencing brief network blips would flicker out of the sidebar.
- **Remedy**:
  - Replaced cycle counting with **monotonic timestamp tracking**: `offlineCounters.set(key, Date.now())`.
  - Enforced a strict **10-minute continuous offline confirmation window** (`offlineSinceMs >= 10 * 60 * 1000`) for YouTube channels (2 minutes for other platforms).
  - Any poll that returns `isLive: true` immediately deletes the counter and resets the timer completely.
  - While within the confirmation window, the composable defensively pulls confirmed state from `previousStatuses.value[key]`, ensuring no reactive state degradation or UI flicker occurs before the 10-minute window completes.

---

## 5. Performance, Concurrency & Rate-Limiting Architecture

### 5.1 Fast-Path for Offline Channels
Channels that are offline represent >80% of checks in typical usage. Parsing `ytInitialData` for every offline channel consumed noticeable CPU during polling:
1. **Pre-Check**: If `player_data` is `None` and the raw HTML does not contain `"style":"LIVE"` or `"BADGE_STYLE_TYPE_LIVE_NOW"`, the channel is guaranteed offline.
2. **Bypass**: The engine skips deserializing `ytInitialData` entirely.
3. **Metadata Extraction**: Display name and avatar are parsed in $< 0.1\text{ ms}$ using standard `<meta property="og:title">` and targeted channel avatar patterns.

### 5.2 Global Static Semaphore (Anti-429 Rate Limiting)
YouTube's perimeter blocks aggressive bursts of concurrent HTTP requests with HTTP 429 ("Too Many Requests").
- Previously, local semaphores (`Semaphore::new(4)`) were instantiated per batch call. When multiple `BaseStream` components mounted concurrently or polling overlapped with user interactions, independent tasks spawned up to 20 parallel HTTP requests to YouTube, quickly tripping IP-level rate limits.
- **Architectural Solution**: Enforce a process-wide, static global semaphore (`GLOBAL_SCRAPE_SEMAPHORE: OnceLock<Semaphore>` initialized to `Semaphore::new(2)`) across all channel and stream requests in `api.rs`.
- Even if the UI requests status checks for 10 streams simultaneously, requests are serialized through the 2-permit gatekeeper, completely eliminating HTTP 429 spikes.

### 5.3 Global In-Memory Multi-Key TTL Cache (45-Second TTL)
To prevent duplicate network queries across multiple components (sidebar, stream grid, share import dialog) querying the same channel or stream:
- `GLOBAL_CACHE`: A process-wide in-memory cache wrapped in `LazyLock<Mutex<HashMap<String, (Instant, YouTubeLiveResponse)>>>` with `CACHE_TTL = Duration::from_secs(45)`.
- **Symmetric Multi-Key Indexing**: When a channel status is resolved, the resulting payload is stored under:
  1. `raw_handle` (e.g. `"@cazetv"`)
  2. `clean_handle` (e.g. `"cazetv"`)
  3. `display_name` (e.g. `"CazéTV"`)
  4. Primary `video_id` (e.g. `"Zm5YJptWpa4"`)
  5. Each sub-stream `video_id` in `live_streams` (e.g. `"cDvqBEla-Vc"`, `"QQbVDgHCW-g"`)
- **Sub-Stream Identity Preservation**: When `get_cached_status(key)` matches an entry via a sub-stream `video_id`, it clones the cached response and dynamically rewrites `res.video_id = Some(sub.video_id.clone())`. This ensures importing or mounting distinct simultaneous broadcasts from the same creator retains their unique playback IDs rather than collapsing into the primary stream ID.

### 5.4 Tiered Phase 2 Discovery (Streams First, Home on Fallback)
Instead of unconditionally firing simultaneous network requests to both `/@handle/streams` AND the Channel Home page on every live check:
1. **Tier 1 (`/@{handle}/streams`)**: Phase 2 queries the `/streams` tab with an expanded 10-second timeout.
2. **Early Completion**: If active live broadcasts are found on `/streams`, the Channel Home request is skipped entirely. This reduces Phase 2 network traffic by 50% for standard broadcasters.
3. **Tier 2 Fallback (`/@{handle}`)**: Only if `/streams` returns 0 active live streams (the 30-item pagination trap where upcoming tournament matches push live items past index 30), Phase 2 queries the Channel Home page to inspect the top "Live Now" ("Ao Vivo Agora") shelf.

### 5.5 Frontend Deduplication & Zero-Request Skeleton Avatar Integration
1. **Batch Deduplication**: `useLiveStatus.ts` filters out candidate YouTube video IDs in `checkAll()` when their parent channel handle is already present in the polling batch.
2. **Mount Guard**: `BaseStream.vue` inspects `statuses.value` before invoking `youtube_check_channels_status` on mount, skipping the IPC roundtrip if status is already in memory.
3. **Skeleton Loader Avatar**: `BaseStream.vue` computes `effectiveAvatarUrl` from `liveStatus.value?.avatarUrl` (which is already populated by Rust during status scraping), rendering channel profile pictures inside the loading skeleton with zero extra network requests.

### 5.6 Polling Frequency & Batch Coordination
- Global polling interval is configured at `60000ms` (60 seconds) in `apps/desktop/src/config/api.ts`.
- In `useFollowedChannels.ts`, background polling calls are desynchronized and deduplicated, ensuring `checkAll()` is managed strictly by `useLiveStatus`.

---

## 6. Verification & Test Coverage

The YouTube architecture is verified across backend and frontend test suites:

1. **Rust Backend (`apps/desktop/src-tauri/src/youtube/`)**:
   - `should_detect_consent_or_challenge_pages`: Prevents clearing state when YouTube returns bot detection or cookie consent pages.
   - `should_detect_not_currently_live_broadcasts`: Ensures scheduled premieres, waiting rooms, and finished VODs (`isLiveContent: true` with `isLive: false`) are classified offline.
   - `should_extract_canonical_video_id_from_standard_link`: Verifies video ID extraction across various link variants.
   - `should_extract_viewer_count_from_html_original_view_count`: Verifies concurrent viewers from `originalViewCount`.
   - `should_extract_viewer_count_from_html_watching_text`: Verifies concurrent viewers from `"14.2K assistindo agora"`.
   - `should_extract_channel_avatar_from_video_owner_renderer_html`: Verifies avatar extraction from `videoOwnerRenderer`.
   - `should_extract_channel_avatar_from_channel_thumbnail_renderer_html`: Verifies avatar extraction from `channelThumbnailWithLinkRenderer`.
   - `should_extract_channel_avatar_from_yt3_avatar_regex`: Verifies avatar extraction from `yt3.ggpht.com` CDN URLs.
   - `should_find_channel_avatar_from_json_tree`: Verifies deep JSON traversal for channel avatars.
   - `should_extract_yt_initial_player_response_with_trailing_inline_js`: Verifies robust JSON streaming deserialization even with trailing inline JavaScript (`var meta = ...`).
   - `should_parse_various_viewer_count_formats`: Verifies localized viewer strings (`"1.2K watching"`, `"50.320 assistindo"`).
   - `test_is_live_lockup_detects_live_overlay`: Validates `lockupViewModel` with modern `thumbnailBottomOverlayViewModel` live badges.
   - `test_is_live_lockup_rejects_vods_with_duration`: Validates rejection of VOD items possessing duration text (`"3:45:10"`, `TIME_STATUS`).
   - `test_is_live_lockup_rejects_upcoming_broadcasts`: Validates rejection of upcoming scheduled broadcasts.
   - `test_extract_live_streams_from_initial_data`: Validates extraction of multiple concurrent live streams from `ytInitialData`.
   - `should_parse_live_lockup_view_model_with_metadata_parts`: Verifies viewer count parsing from modern `metadataParts[]` array inside lockup view models.
   - `should_parse_live_lockup_with_thumbnail_overlay_badge_view_model`: Validates live lockup detection via structural `thumbnailOverlayBadgeViewModel` with `THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE`.
   - `should_parse_live_lockup_with_is_live_flag_fallback`: Validates structural fallback when card contains `"isLive": true` or `"isLiveNow": true`.
   - `should_extract_multiple_concurrent_live_streams_from_initial_data`: Validates concurrent extraction of multiple simultaneous live streams from a single channel's initial data payload.

2. **Frontend Composables (`apps/desktop/src/composables/__tests__/`)**:
   - `should_ignore_custom_or_youtube_favorites_for_desktop_notifications`: Guarantees YouTube favorites never trigger desktop OS notifications.
   - `should_still_send_desktop_notifications_for_twitch_and_kick_favorites`: Verifies Twitch and Kick push notifications remain fully functional.
   - `should_retain_youtube_live_status_in_ui_statuses_map_during_offline_confirmation_window_and_confirm_offline_after_10_minutes`: Verifies that a channel remains visible in the UI during the 10-minute confirmation window and transitions to offline strictly after 10 continuous minutes without live signals.
   - `should_correctly_populate_avatarUrl_thumbnailUrl_and_real_time_viewerCount_for_YouTube_channels`: Verifies correct avatar, thumbnail, and concurrent viewer count mapping from IPC into frontend reactive state.
   - `useFollowedChannels.spec.ts`: Validates 1:N expansion of multiple concurrent YouTube live streams into distinct sidebar items with direct `videoId` targets.

---

## 7. Two-Phase Concurrent Live Streams & VOD Prevention Engine (What Worked)

This section documents the battle-tested architecture that successfully solved two opposing constraints:
1. Supporting multiple concurrent live streams for a single YouTube channel (e.g. CazeTV running 7 simultaneous matches or Lofi Girl running multiple streams).
2. Completely preventing past recorded broadcasts (VODs) from leaking into the UI as active streams for offline channels (e.g. `@getv` displaying a 16-million-view past video).

### 7.1 Two-Phase Discovery Architecture

```
                                   Channel Polling Triggered
                                              │
                                              ▼
                    ┌──────────────────────────────────────────────────┐
                    │ Phase 1: Deterministic Gatekeeper                │
                    │ GET https://www.youtube.com/@{handle}/live       │
                    └─────────────────────────┬────────────────────────┘
                                              │
                    ┌─────────────────────────┴────────────────────────┐
                    │                                                  │
                    ▼ (is_live == true && !is_offline)                 ▼ (is_offline == true || !is_live)
      ┌───────────────────────────────┐                  ┌───────────────────────────────┐
      │ Gatekeeper PASSED             │                  │ Gatekeeper FAILED             │
      │ Channel is verified online    │                  │ - Immediate early return      │
      └──────────────┬────────────────┘                  │ - live_streams is empty       │
                     │                                   │ - /streams is NEVER queried   │
                     ▼                                   │ - Zero risk of VOD leakage    │
      ┌───────────────────────────────────────────────┐                  └───────────────────────────────┘
      │ Phase 2: Tiered Multiplexer                   │
      │ 1. GET /@{handle}/streams (10s timeout)       │
      │ 2. GET /@{handle} (Home) ONLY if 0 lives      │
      │ Extract & merge all active broadcasts         │
      └───────────────────────┬───────────────────────┘
                              │
          ┌───────────────────┴───────────────────┐
          │                                       │
          ▼ (Found >= 1 streams)                  ▼ (Found 0 streams / fallback)
    ┌───────────────────────────────┐       ┌───────────────────────────────┐
    │ Return all discovered         │       │ Fallback to Phase 1           │
    │ concurrent streams in         │       │ primary live stream           │
    │ live_streams vector           │       │ (Ensures no drops)            │
    └───────────────────────────────┘       └───────────────────────────────┘
```

#### Why Phase 1 is Mandatory
- If a channel is offline, YouTube's `/@{handle}/live` URL either stays on the channel home page or serves an offline shell with no live player response. The backend's `is_not_currently_live` and `is_live_now` checks deterministically tag the channel as offline.
- Because offline channels **never reach Phase 2**, the backend never fetches `/@{handle}/streams` or channel home for offline channels. Past VODs residing on the `/streams` tab are never parsed or seen.

#### Why Phase 2 Uses a Tiered Discovery (Streams First, Home on Fallback)
- When a channel is confirmed live (Phase 1 passes), `apps/desktop/src-tauri/src/youtube/api.rs` executes a prioritized tiered discovery:
  1. **Tier 1 (`/@{handle}/streams`)**: First queries the dedicated streams tab with an expanded 10-second timeout.
  2. **Early Completion**: Standard channels (e.g. ESPN Brasil, Lofi Girl) have their broadcasts clearly listed on `/streams`. If active streams are found here, the Channel Home request is skipped completely, saving 50% of the network overhead.
  3. **Tier 2 Fallback (`/@{handle}`)**: Channels scheduling **30+ upcoming matches** (e.g. CazéTV during tournaments) push active broadcasts beyond the 30-item initial payload on `/streams`. When Tier 1 returns 0 live broadcasts, Phase 2 immediately falls back to querying the Channel Home page (`https://www.youtube.com/@handle`), where active broadcasts are **always pinned to the top "Live Now" ("Ao Vivo Agora") shelf**.
  4. Active streams discovered across tabs are deduplicated by canonical 11-character `videoId`.
- If Phase 2 yields 0 streams, the system gracefully falls back to the single live stream already confirmed in Phase 1.

### 7.2 Modern YouTube Component Parsing (`lockupViewModel`)

YouTube's modern UI framework replaces legacy renderers (`gridVideoRenderer`) with nested `lockupViewModel` components.

```
lockupViewModel
 ├── contentId: "videoId (11 chars)"
 ├── isLive: true (Optional structural boolean fallback)
 ├── contentImage
 │    └── thumbnailViewModel
 │         ├── image.sources[].url (Stream Thumbnail)
 │         └── overlays[]
 │              ├── thumbnailBottomOverlayViewModel
 │              │    └── badges[]
 │              │         └── thumbnailBadgeViewModel
 │              │              ├── badgeStyle: "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE"
 │              │              ├── text: "LIVE" | "AO VIVO"
 │              │              └── icon.sources[0].clientResource.imageName: "LIVE"
 │              └── thumbnailOverlayBadgeViewModel
 │                   └── thumbnailBadgeViewModel
 │                        ├── badgeStyle: "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE"
 │                        └── text: "LIVE" | "AO VIVO"
 └── metadata
      └── lockupMetadataViewModel
           ├── title: { content: "...", runs: [...], simpleText: "..." }
           └── metadata.contentMetadataViewModel.metadataRows[]
                └── (Contains viewer text: "14.2K assistindo agora")
```

### 7.3 Multi-Layered VOD & Upcoming Stream Rejection Rules

To guarantee that only active broadcasts are accepted, `is_live_lockup` in `parser.rs` enforces strict positive and negative heuristics:

#### 1. Negative Filters (Immediate Rejection)
- **Upcoming / Scheduled Streams**:
  - Structural check: `lockup.get("upcomingEventData").is_some()`.
  - Raw JSON string contains: `"upcomingeventdata"`, `"thumbnail_overlay_badge_style_upcoming"`, `"premieres"`, `"estreia"`, `"programado para"`, `"\"programado\""`, or `"\"text\":\"upcoming\""` (strictly avoiding bare `"programado"` substring matching so titles containing the word are not rejected).
  - Badge style contains `"UPCOMING"` or badge text is `"upcoming"`.
- **Recorded Broadcasts (VODs)**:
  - Duration timestamps containing colon (`:`), such as `"2:35:59"` or `"42:15"`.
  - Badge style containing `"TIME_STATUS"`.
  - Row text containing past tense markers: `"streamed"`, `"transmitido"`, `"views"`, `"visualiz"`, `"aufruf"`.

#### 2. Positive Filters (Strict Live Confirmation)
A lockup is classified as **LIVE** if any of these positive markers are satisfied:
- Overlay badge style contains `"LIVE"` (`badgeStyle.contains("LIVE")` handles `THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE`, `BADGE_STYLE_TYPE_LIVE_NOW`, `LIVE`).
- Badge text equals `"LIVE"` or `"AO VIVO"` (case-insensitive) in `thumbnailBottomOverlayViewModel`, `thumbnailOverlayBadgeViewModel`, or direct `thumbnailBadgeViewModel`.
- Badge icon client resource equals `"LIVE"`.
- Legacy `thumbnailOverlayTimeStatusRenderer` has `style == "LIVE"` or text `"LIVE"` / `"AO VIVO"` without duration colons.
- Metadata rows explicitly match concurrent watching terms (`"watching"`, `"assistindo"`, `"espectadores"`, `"zuschauer"`, `"зрител"`, `"regardent"`, `"izleyici"`, `"penonton"`) without past tense terms.
- **Structural JSON Fallback**: If the card JSON explicitly contains `"\"isLive\":true"`, `"\"isLiveNow\":true"`, `"thumbnail_overlay_badge_style_live"`, or `"badge_style_type_live_now"` (after passing the negative filters).

#### 3. Resilient Title Extraction
- Stream titles are extracted via `get_text_from_node(metadata.get("title"))`, cleanly resolving titles whether YouTube renders them as `runs[]`, `simpleText`, `content`, or raw string properties, falling back to `"YouTube Live"` only if completely omitted.

### 7.4 Real-time Concurrent Viewers in Multi-Stream Listings

For items in `live_streams`:
- Viewers are extracted from `metadata.lockupMetadataViewModel.metadata.contentMetadataViewModel.metadataRows`.
- Filtered to require active watching indicators (`"assistindo"`, `"watching"`) while rejecting cumulative lifetime view counters (`"visualizações"`, `"views"`, `"streamed"`).
- Localized parsing handles standard abbreviations (`K`, `M`, `mil`, `milhões`, `tsd`, `тыс`, `万`).

### 7.5 Frontend 1:N Reactive Expansion (`useFollowedChannels.ts`)

In Multistream, users favorite a **channel** (e.g. `@CazeTV`), but expect to see **all concurrent live streams** in the sidebar:

1. **IPC Layer**:
   - `YouTubeChannelStatus` exposes `live_streams: Vec<YouTubeLiveStreamInfo>`.
   - `useLiveStatus.ts` maps this into `LiveStatus.liveStreams`.
2. **Channel Expansion**:
   - In `useFollowedChannels.ts`, if `status.liveStreams && status.liveStreams.length > 0`:
     - The channel favorite expands into $N$ separate `FollowedChannel` objects.
     - Each item receives a deterministic unique ID: `stream.videoId`.
     - Each item receives its specific `videoId`, stream title, stream thumbnail, and concurrent viewer count.
   - If `liveStreams` is empty or has only 1 item, standard 1:1 mapping is preserved.
3. **Sidebar Interaction**:
   - Clicking any of the expanded items opens that exact `videoId` in the active stream grid slot.

### 7.6 Summary of Ironclad Rules for Future Agents

1. **NEVER query `/@{handle}/streams` first**: Always check `/@{handle}/live` as the initial gatekeeper to reject offline channels before any VODs can be inspected.
2. **NEVER evaluate `is_not_currently_live` on channel pages**: It inspects the channel's featured trailer video and produces false offline results for active streams.
3. **NEVER accept stream cards without checking for duration colons (`:`)**: VODs always have duration timestamps (`"1:23:45"`). Active lives never have duration colons.
4. **ALWAYS reject items with upcoming indicators**: Scheduled streams and premieres must not appear in the active live sidebar.
5. **DO NOT trigger push notifications for YouTube**: Maintain the architectural decision of zero OS push notifications for scraped YouTube feeds due to CDN caching characteristics.
6. **ALWAYS prioritize `/@{handle}/streams` in Phase 2 and query Channel Home only on fallback**: Checking `/streams` first with a 10-second timeout avoids redundant requests and rate-limiting, while falling back to Home guarantees capturing live streams that were pushed beyond index 30 by heavy upcoming schedules.
7. **ALWAYS use timestamp-based confirmation for offline transitions**: Cycle counting causes timing jitter across varied polling and background states. Use `Date.now()` and a 10-minute continuous window for YouTube.
8. **ALWAYS gate YouTube HTTP requests through the global semaphore**: Use `GLOBAL_SCRAPE_SEMAPHORE` (`Semaphore::new(2)`) to strictly prevent HTTP 429 rate-limiting from YouTube's edge infrastructure.
9. **ALWAYS preserve distinct `videoId`s in cache resolution**: When retrieving from `GLOBAL_CACHE`, if the query key matches a sub-stream in `live_streams`, dynamically set `res.video_id = Some(sub.video_id.clone())` so multiple concurrent streams from the same channel retain their individual playback IDs.

---

## 8. Multi-Language Consistency Architecture (10 Supported Locales)

Multistream is localized into 10 languages (`en`, `pt`, `es`, `de`, `ru`, `cn`, `fr`, `tr`, `hi`, `id`). To ensure YouTube live stream scraping functions identically for users across all supported locales, the engine operates across four architectural layers:

### 8.1 Network-Level Standardization
During channel status resolution (`resolve_channel_live_status`), requests enforce fixed headers and consent cookies:
- `Accept-Language: en-US,en;q=0.9`
- `Cookie: CONSENT=PENDING+999; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg`

This instructs YouTube CDN edge nodes globally to return responses structured in English (`"LIVE"`, `"watching"`, `"Live now"`).

### 8.2 Structural & Enum Agnosticism
YouTube's internal JSON, Protobuf schemas, and UI view-models do not translate structural enums or resource identifiers regardless of country or language:
- `badgeStyle: "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE"` (always uppercase English enum)
- `icon.clientResource.imageName: "LIVE"` (fixed resource identifier)
- `videoDetails.isLive: true` (language-agnostic boolean)
- `liveBroadcastDetails.isLiveNow: true` (language-agnostic boolean)
- `playabilityStatus.status: "LIVE_STREAM_OFFLINE"` / `"OK"` (fixed internal enum)

Because `is_live_lockup` prioritizes these structural markers, live detection succeeds even if the user's IP or proxy forces a localized response.

### 8.3 Multilingual Fallback Dictionary
In scenarios where YouTube's GeoIP overrides headers and serves native localized strings, both `is_live_lockup` and `parse_viewer_count` maintain complete dictionary support:

| Locale | Language | Metadata Watching Terms | View Count Suffixes / Multipliers |
|---|---|---|---|
| `en` | English | `watching` | `K` ($10^3$), `M` ($10^6$) |
| `pt` | Portuguese | `assistindo`, `ao vivo`, `espectadores` | `mil`, `mi`, `milhões` |
| `es` | Spanish | `espectadores`, `mirando`, `en vivo` | `mil`, `mi`, `millones` |
| `de` | German | `zuschauer`, `live` | `tsd`, `k`, `mio` |
| `ru` | Russian | `зрител`, `в эфире` | `тыс.` ($10^3$), `млн` ($10^6$) |
| `fr` | French | `regardent`, `spectateurs`, `en direct` | `k`, `m`, spaces (`1 234`) |
| `cn` / `zh` | Chinese | `正在观看`, `人正在观看` | `万` ($10^4$), `亿` ($10^8$) |
| `tr` | Turkish | `izleyici`, `canlı` | `B` ($10^3$), `Mn` ($10^6$), `k` |
| `id` | Indonesian | `penonton`, `sedang menonton` | `rb` ($10^3$), `jt` ($10^6$), `k` |
| `hi` | Hindi | `देख रहे हैं` | `हज़ार` ($10^3$), `लाख` ($10^5$), `k` |

*Note: `parse_viewer_count` automatically strips and normalizes non-breaking spaces (`\u{00a0}`) and narrow non-breaking spaces (`\u{202f}`) commonly emitted by French, Russian, and German YouTube localizations.*

### 8.4 Locale-Targeted Stream Discovery (`get_youtube_locale_meta`)
While channel status resolution standardizes to English for structural stability, the **Explore & Suggestions** pipeline (`fetch_live_streams`) deliberately matches the user's selected UI locale:
- Maps the frontend's active locale to official YouTube parameters:
  - `hl` (UI language: e.g. `pt-BR`, `de`, `zh-CN`, `ru`)
  - `gl` (Geographic region: e.g. `BR`, `DE`, `TW`, `RU`, `IN`)
  - `accept_lang` & `PREF=hl={}&gl={}` cookie
- This guarantees that when a user browses the Suggestions feed, they discover localized live broadcasts relevant to their culture and language.
