# Contributing to Multistream

Multistream is a local-first desktop application built with Tauri v2, Rust and Vue 3.

## Getting started

### Prerequisites

- [Bun](https://bun.sh/)
- [Rust](https://www.rust-lang.org/) (latest stable toolchain)
- **Linux (Ubuntu / Debian / Linux Mint)**:
  ```sh
  sudo apt-get install -y libwebkit2gtk-4.1-dev libjavascriptcoregtk-4.1-dev libsoup-3.0-dev libappindicator3-dev librsvg2-dev libssl-dev libasound2-dev alsa-utils pkg-config gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad
  ```

### Local setup

1. Fork and clone the repository:

   ```sh
   git clone https://github.com/ilanzgx/multistream.git
   cd multistream
   ```

2. Install dependencies:

   ```sh
   bun install
   ```

3. Set up environment variables (if testing Kick/Twitch auth):
   Create `apps/desktop/src-tauri/.env`:

   ```env
   KICK_CLIENT_ID=your_client_id
   KICK_CLIENT_SECRET=your_client_secret
   TWITCH_CLIENT_ID=your_client_id
   ```

4. Start the app in development mode:
   ```sh
   bun run desktop:tauri:dev
   ```

## Development commands

| Action                              | Command                                                         |
| :---------------------------------- | :-------------------------------------------------------------- |
| **Start desktop app (Tauri + Vue)** | `bun run desktop:tauri:dev`                                     |
| **Run frontend tests**              | `bun run desktop:test`                                          |
| **Run single test file**            | `bun run desktop:test -- <filename>`                            |
| **Type check frontend**             | `bun run desktop:typecheck`                                     |
| **Check i18n key parity**           | `bun run check:i18n`                                            |
| **Run linters**                     | `bun run lint`                                                  |
| **Start website (Astro)**           | `bun run website:dev`                                           |
| **Check Rust backend**              | `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` |
| **Test Rust backend**               | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`  |

## Translations (i18n)

Multistream supports 10 languages located in `apps/desktop/src/i18n/locales/`.

### Improving an existing translation

1. Edit the target locale file (e.g. `apps/desktop/src/i18n/locales/de.json`).
2. Run `bun run check:i18n` to make sure all keys match `en.json`.

### Adding a new language

1. Add the SVG flag icon in `apps/desktop/src/components/icons/flags/` (convert style tags into inline SVG attributes).
2. Create the locale JSON in `apps/desktop/src/i18n/locales/`.
3. Register the new locale in `apps/desktop/src/i18n/index.ts` and `apps/desktop/src/config/i18n.ts` (including Twitch/Kick language API code mappings).
4. Run `bun run check:i18n` and `bun run desktop:typecheck`.

## Guidelines

- **Privacy first**: No third party tracking, analytics, or remote proxies.
- **Local processing**: Media and transcription features must run locally on the user's machine.
- **Design**: Stick to the dark theme palette (`#0f1115`, neutral grays).
- **i18n**: Never hardcode user visible text in components. Always use `$t('...')` keys.
- **Tests**:
  - Follow the AAA (Arrange, Act, Assert) structure in Vitest.
  - If changing Rust commands or frontend composables, add or update tests.

## Commit messages

Commits must follow Conventional Commits:

`type(optional-scope): description`

- **Types**: `feat`, `fix`, `chore`, `style`, `refactor`, `test`, `ci`, `perf`, `debug`.
- **Rules**: Lowercase type and description, no trailing period.
  - `feat(chat): add 7tv emote tooltip preview`
  - `fix(grid): prevent layout shift on stream resize`
  - `chore(i18n): update german translations`

## Opening a pull request

1. Create a branch:
   ```sh
   git checkout -b feat/your-feature-name
   ```
2. Verify checks pass locally:
   ```sh
   bun run lint
   bun run desktop:typecheck
   bun run desktop:test
   ```
3. Push to your fork and submit a PR with a short explanation of what changed.
