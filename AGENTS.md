# Multistream

## Overview

Multistream is a native, cross-platform desktop application that enables power users to watch multiple live streams (Twitch, Kick, YouTube) simultaneously, featuring an integrated real-time chat interface.

### Core Objectives & Philosophy

- **Privacy by Design:** 100% local processing. No middleman servers, no data collection, and no telemetry. Never introduce third-party tracking or cloud analytics.
- **Direct Connections:** Streams and chat use direct connections (e.g., standard iframes, WebSocket) to official platforms.
- **Lightweight & Performant:** Built with Tauri and Rust to maintain incredibly low memory usage and high performance compared to traditional Electron apps. Keep dependencies minimal.
- **Local AI Transcription:** Real-time translation and transcription must remain 100% local, offline, and free, powered by Whisper.cpp on the CPU. Do not integrate paid cloud AI APIs for this feature.

## Hard Rules

- ALMOST NEVER write comments. We're senior engineers here, not learners.
- NEVER run the backend or frontend manually. The human is already doing this.
- ALWAYS test rust backend changes by running 'cargo check'.
- ALWAYS test frontend changes by running Playwright MCP.
- ALWAYS follow the current design system and minimalist aesthetics of the application. Do not invent new visual patterns, do not introduce jarring colors, and strictly respect the dark/neutral color palette (e.g., bg-[#0f1115], text-gray-400) used across the app.
- ALWAYS profile before suggesting architectural performance changes. Do not recommend virtualization, caching, memoization, background workers, or other advanced optimizations unless there is evidence they address the actual bottleneck.
- NEVER write a text hardcoded ALWAYS write following i18n pattern (on frontend)
- ALWAYS validate changes according to scope: UI/interface changes require running 'bun run desktop:typecheck'; logic/composable changes require running both 'bun run desktop:typecheck' and unit tests.

## Local Agent Skills

This repository contains custom, specialized skills for AI Agents located in the `.agents/skills/` directory. **ALWAYS** invoke and read these local skills when working on the respective domains:

- **[`multistream-desktop-frontend`](.agents/skills/desktop-frontend/SKILL.md)**: Pragmatic architecture guide, TypeScript types, Composables, Vue 3 components, i18n, and tests for the desktop app (`apps/desktop/src/`).
- **[`multistream-desktop-backend`](.agents/skills/desktop-backend/SKILL.md)**: Pragmatic architecture guide, IPC command patterns, Tokio async concurrency, error handling, security, and unit testing guidelines for the Multistream Tauri 2 Rust backend in `apps/desktop/src-tauri/`.
- **[`multistream-website`](.agents/skills/website/SKILL.md)**: Pragmatic architecture guide, Astro SSG setup, Tailwind CSS v4 styling, i18n, Deep Link Gateway, and dynamic GitHub release links for the website (`apps/website/`).
- **[`multistream-desktop-frontend-testing`](.agents/skills/desktop-frontend-testing/SKILL.md)**: Comprehensive guide, AAA pattern, Tauri IPC mocking, fake timers, and best practices for writing unit tests in `apps/desktop/src/`.
- **[`multistream-graveyard`](.agents/skills/graveyard/SKILL.md)**: Explains the Multistream Graveyard mechanism, how it works, and why it is necessary to prevent WebView IPC crashes.
- **[`multistream-adding-language`](.agents/skills/adding-language/SKILL.md)**: Guides agents and developers through the exact process of adding a new language to the Multistream application.

## Tech Stack

- **Frontend Framework:** [Vue 3](https://vuejs.org/)
- **Desktop Framework:** [Tauri 2](https://v2.tauri.app/)
- **Language:** TypeScript, Rust
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Tooling/Runtime:** Vite, Bun

## Development

### Commands

| Action                  | Command                              |
| :---------------------- | :----------------------------------- |
| **Dev (Tauri)**         | `bun run desktop:tauri:dev`          |
| **Build (Tauri)**       | `bun run desktop:build:tauri`        |
| **Tests (Unit)**        | `bun run desktop:test`               |
| **Tests (Unit Single)** | `bun run desktop:test -- <filename>` |
| **Coverage**            | `bun run desktop:test:coverage`      |
| **Tests (E2E)**         | `bun run desktop:test:e2e`           |
| **Tests (UI)**          | `bun run desktop:test:e2e:ui`        |
| **Type Check**          | `bun run desktop:typecheck`          |
| **Linting**             | `bun run lint`                       |

## Architecture & Conventions

- The project structure is split into three main parts:
  - `apps/desktop/src/`: Vue frontend for the Desktop App.
  - `apps/desktop/src-tauri/`: Rust backend for the Desktop App.
  - `apps/website/`: Astro-based static landing page for the product.

### Frontend Structure (`apps/desktop/src/`)

_(See [`multistream-desktop-frontend`](.agents/skills/desktop-frontend/SKILL.md) for full guide)_

- `components/`: UI components (primitives, chat, streams, dialogs).
- `composables/`: Shared reactive logic (favorites, live status, stream management).
- `lib/`: Utility functions and URL parsers.
- `config/`: Platform and API configurations.
- `i18n/`: Internationalization setup and locale files.

### Backend Structure (`apps/desktop/src-tauri/`)

_(See [`multistream-desktop-backend`](.agents/skills/desktop-backend/SKILL.md) for full guide)_

- `src/`: Rust backend source code.
  - `audio/`: System audio loopback capture logic and transcription pipeline/sidecar management.
  - `core/`: Scripts and assets injected into WebViews (e.g., keyboard shortcuts) or handled internally.
  - `kick/`: Kick API integration, OAuth flows, and WebSocket chat subscriptions.
  - `twitch/`: Twitch API integration and IRC chat connections.
  - `recording/`: Logic for capturing and recording streams/VODs.
  - `models.rs`: Shared data structures and serialization models.
  - `main.rs`: Application entry point.
  - `lib.rs`: Main Tauri Builder setup, plugins initialization, and IPC commands registration.
- `binaries/`: Pre-compiled external sidecar binaries (e.g., `whisper.cpp`) required by the app.
- `capabilities/`: Tauri 2 security configurations defining granular permissions and accessible commands for the frontend.
- `icons/`: Application icons for different platforms and sizes.

### Landing Page (`apps/website/`)

_(See [`multistream-website`](.agents/skills/website/SKILL.md) for full guide)_

- **Framework:** Built with Astro (Static output mode).
- **Design:** Minimalist, using Tailwind CSS v4.
- **i18n:** Supports multiple languages (e.g., `/en/` and `/pt-br/`).
- **Deployment:** Deployed on Vercel.
- **Analytics:** Uses `@vercel/analytics` and `@vercel/speed-insights` native components directly in `Layout.astro`.
- **Dependencies:** Relies on the root `package.json` for some types (like `@vue/tsconfig`). CI must always run `bun install` at the root before building the `website/` directory.

### Testing

- **Unit/Integration:** Implemented using `vitest` in the `apps/desktop/src/` directory.
  - **Pattern:** Always structure unit tests using the AAA (Arrange, Act, Assert) pattern. Clearly separate the phases in every test case using explicit comments: `// Arrange`, `// Act`, and `// Assert`.
- **E2E:** Implemented using `Playwright` in the `apps/desktop/e2e/` directory.
  - **Pattern:** Target UI elements using the `data-testid` attribute (e.g., `page.getByTestId(...)`) to decouple tests from CSS classes.
  - **State Isolation:** Ensure persistent state (like `localStorage`) is cleared or initialized correctly via `page.evaluate()` at the start of tests to avoid flaky runs.

### Git

- **Git Hooks:** `husky` is configured for pre-commit and pre-push hooks to enforce code quality.
- **Git Commits:**
  - Follow the **Conventional Commits** specification.
  - **Format:** `<type>(<optional scope>): <description>` (e.g., `feat(ui): add share dialog`).
  - **CLI Multiline:** When writing commit messages with bodies via the command line (`git commit -m "..."`), use `` `n`n `` to create a blank line between the subject and the body to satisfy commitlint rules. **Only add a body if additional context or explanation is necessary.**
  - **Allowed Types:** `feat`, `fix`, `chore`, `style`, `refactor`, `test`, `ci`, `perf`, `debug`.
  - **Case Convention:** Use lowercase for the type, the optional scope, and the start of the description (e.g., `feat: watch timer...` instead of `feat: Watch timer...`).
  - **No Trailing Period:** Do not end the commit subject line with a period.
  - **Breaking Changes:** Append `!` to the type/scope (e.g., `fix!: prevent xss...`).
- **State Management:** Leverage Vue's Composition API and Composables located in `apps/desktop/src/composables/`.
- **Code Style:** Prioritize clarity and maintainability. Use early returns to minimize `if/else` nesting and extract duplicated logic into reusable helpers to keep the codebase DRY.

### Performance Philosophy

> Make it work. Make it simple. Measure. Then optimize only if the measurements justify it.

- Prefer simple, maintainable solutions over complex optimizations.
- Never optimize based on assumptions.
- Every performance optimization must solve a measured bottleneck.
- If an optimization significantly increases complexity, its measurable benefit must clearly outweigh its maintenance cost.

### Important Observations & Environment Context

- **Platform Authentication & Architectures (Twitch vs. Kick):**
  - **Twitch Integration:**
    - **Chat Protocol:** Twitch uses standard IRC connections.
    - **Unified Chat (`useUnifiedChat.ts`):** Strictly READ-ONLY. It multiplexes multiple IRC channels into a single feed. Do NOT attempt to add message-sending logic here.
    - **Native Individual Chat (`TwitchNativeChat.vue`):** Supports sending messages via `twitch_send_message` IPC.
    - **Optimistic UI & Smart Rollback:** Messages sent are optimistically injected with `isPending=true`. If the Rust IRC client receives a `NOTICE` (error) from Twitch, it emits a `twitch-chat-error` event. The frontend intercepts this, removes the pending message, restores the user's input text, and displays a toast. Never wait for a server round-trip to render user messages.
    - **Optimistic Deletion Strategy:** When rolling back an optimistic message (e.g., in `removeLastLocalMessage`), always iterate the message list from the **end to the beginning** (reverse scan) to ensure the _most recently_ sent pending message is targeted.

  - **Kick Integration:**
    - **TLS Fingerprinting & Cloudflare:** Kick is aggressively protected by Cloudflare. Frontend requests will fail CORS and fingerprint checks. All authentication and HTTP requests **must** be routed through the Rust backend.
    - **Reqwest Config (CRITICAL):** By default, `reqwest` uses Windows native Schannel TLS (`native-tls`) whose fingerprint is blocked by Cloudflare (403 Forbidden). **Always** configure `reqwest` to use `rustls` globally: `reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "stream"] }`.
    - **OAuth Flow:** The Kick OAuth callback requires strict validation of both the `code` and `state` parameters to prevent CSRF spoofing. If `code` is missing, the backend must return an HTTP 400 error page.
    - **Two-Step Chat Protocol:** Kick chat does not use IRC. The backend must first fetch the `chatroom_id` and `broadcaster_user_id` via an HTTP API, and then subscribe to real-time events via a Pusher WebSocket connection.
    - **Send & Retry Mechanism:** Sending messages is handled via `kick_send_message` IPC. The Rust backend intercepts 401/403 HTTP errors and automatically triggers a token refresh (`auth.refresh_token`), saving the new session and retrying the request transparently.

- **Live Transcription (Whisper.cpp):**
  - **Platform Limitation:** Currently, the transcription feature is strictly Windows-only. Always verify platform conditions (e.g., checking if the OS is Windows) before rendering transcription-related UI components or invoking sidecars.

- **WebView IPC & Graveyard Mechanism:**
  - **Mojo Crash Prevention:** In Tauri/WebView2 (Chromium), completely removing an `iframe` from the DOM while it has active internal connections (like media or websockets) can cause catastrophic `ChannelError` Mojo crashes that bring down the entire application window.
  - **Two-Phase Removal (Graveyard):** To prevent this, when a user closes a stream in `StreamGrid.vue`, the app uses a "Graveyard" approach. The stream is marked as `_isDead = true`, visually hidden (`v-show="false"`), and its iframe is sent a `MULTISTREAM_GRAVEYARD_SUSPEND` postMessage. A globally injected Rust script (`graveyard_script` in `lib.rs`) intercepts this message to monkey-patch and silence `HTMLMediaElement.play` and `AudioContext`, effectively pausing all media without tearing down the iframe immediately.
  - **Garbage Collection (GC):** The "dead" iframes are kept alive in the background until the _last_ active stream of that same platform is closed. When no active streams remain for a platform (e.g., all Twitch streams are closed), the GC safely removes all graveyard iframes of that platform from the DOM at once.
  - **Custom Streams Bypass:** Streams with `platform === 'custom'` bypass this graveyard logic entirely and are removed from the DOM immediately, as they don't share the same risk of platform-wide IPC crash cascades.

- **Internationalization (i18n):**
  - **Always translate UI text:** Every new user-facing text string must be localized. Always remember to add the translations to all 10 supported languages in `apps/desktop/src/i18n/locales/` (`en.json`, `pt.json`, `es.json`, `de.json`, `ru.json`, `cn.json`, `fr.json`, `tr.json`, `hi.json`, `id.json`).
  - **Pre-Flight Checklist:** You MUST pay extra attention and double-check your work to ensure strict parity across ALL 10 files before considering any UI implementation complete. Do not rely solely on Vue `$t` fallbacks.

- **UI Components (shadcn-vue):**
  - ALWAYS use shadcn-vue components whenever possible. However, carefully evaluate the trade-off between the component's size/performance and simpler native or lightweight alternatives, choosing what is best for the specific context.

- **Auth & Network State Handling (Tauri/Rust):**
  - **Distinguish Network Errors from Auth Revocations:** When validating OAuth tokens or making backend HTTP requests, do not treat transient network errors (e.g., offline status) as invalid tokens. Only clear local authentication state if the server explicitly rejects the token (e.g., HTTP 401/400).
  - **Type Safety on IPC Boundaries:** Always ensure `#[tauri::command]` return types (e.g., Rust structs) strictly match the expected TypeScript interfaces in the frontend.
  - **Cancellation-Safe Async Tasks:** When using `tokio::select!` for long-running polling alongside a cancellation channel, ensure the actual HTTP request future is awaited _inside_ the `select!` block so it can be aborted mid-flight.
  - **Async Locking & WebSockets:** When managing WebSocket connections or channels across threads, bundle shutdown logic inside a scope-bound `Mutex` guard to prevent race conditions during rapid reconnects. Always wrap connection handshakes with `tokio::time::timeout` to prevent tasks from hanging indefinitely.

- **Vitest Testing Gotchas:**
  - **Global Mock Leaks:** When mocking global objects (e.g., `window`, `fetch`) via `vi.stubGlobal()`, always explicitly call `vi.unstubAllGlobals()` in the `afterEach` hook to prevent leaking mocks into subsequent test suites.
  - **Composable Singleton State:** Composables that rely on module-level variables (e.g., `const map = new Map()`) retain their state across tests. Always export a test-only reset function (e.g., `__test_resetState()`) and call it inside the `beforeEach` block of the test suite to ensure strict test isolation.
- **CI/CD & Environment Variables:**
  - **Always Sync Secrets with Workflows:** When adding new features or APIs in Rust that depend on environment variables, ALWAYS verify and update .github/workflows/release.yml (and ci.yml) to inject those environment variables into the build steps.

- **NEVER DELETE TESTS:** But add or update tests for the code you change, even if nobody asked.
- **NO OVERENGINEERING:** Always prioritize simplicity and maintainability over adding unnecessary complexity.
- **AVOID TRIAL AND ERROR:** When lacking context or information about a framework, library, or API, do not rely on trial and error. Always use the **Context7 MCP** to query and fetch the most up-to-date documentation.
- **PRAGMATISM & PUSHBACK:** If a user requests a change or asks you to implement feedback from automated tools (e.g. CodeRabbit, linters) that adds significant maintenance burden, overengineering, or rigid corporate patterns (like strict hashes for all dependencies) to this personal project, YOU MUST QUESTION IT FIRST. Explain the trade-offs (e.g. 'If we do this, it will be a nightmare to maintain because X') and explicitly ask the user if they still want to proceed, or suggest a simpler pragmatic alternative. Do not blindly implement complex overhead without validating if it makes sense for the project's scale.
