<div align="center">
  <h1 align="center">Multistream</h1>

  <p align="center">Twitch, Kick, and YouTube. Side by side. No browser required.</p>

  <p align="center"><strong>Available for Windows, Linux and macOS</strong></p>

  <p align="center">
    <a href="https://usemultistream.vercel.app/">Website</a>
    ·
    <a href="https://github.com/ilanzgx/multistream/releases">Download</a>
    ·
    <a href="https://ko-fi.com/ilanfonseca">Buy me a coffee</a>
    ·
    <a href="https://github.com/ilanzgx/multistream/issues">Report Bug</a>
    ·
    <a href="https://github.com/ilanzgx/multistream/issues">Request Feature</a>
  </p>
  <br />
</div>

Most multistream setups are just browser tabs. Multistream is a desktop app built with Tauri and Rust: Twitch, Kick, and YouTube side by side in one window, using less memory than a single Chrome tab, with no trackers or background processes.

### Features

- **Privacy by design**: Everything runs locally. No middleman servers, no data collection.
- **Account Authentication & Unified Chat**: Log in to your Twitch and Kick accounts securely and read both chats together in one place, directly in the app. Free, no subscription. Supports 7TV, BTTV, and platform emotes.
- **Direct from the source**: Streams load from the official players, so your views count and quality is exactly the same as on the platform itself.
- **Lightweight**: Built with [Tauri](https://tauri.app/) and [Rust](https://www.rust-lang.org/), so memory usage is a fraction of what any browser-based alternative would use.
- **Local stream recording**: _(Windows only)_ Record streams directly from the source using [Streamlink](https://streamlink.github.io/). Recordings are processed natively without heavy sidecars, keeping the app extremely lightweight, and are automatically remuxed to MP4 when finished.
- **Available in 6 languages**: English, Portuguese, Spanish, German, Russian, and Chinese.
- **Cross-platform**: Works on Windows, macOS, and Linux.
- **Local AI transcription**: _(Windows only)_ Real-time transcription powered by [Whisper.cpp](https://github.com/ggerganov/whisper.cpp), running fully offline on your CPU. Useful for streams in languages you don't speak. No API keys, no costs, no audio ever leaves your machine.

### Built with

- [Vue 3](https://vuejs.org/)
- [Tauri 2](https://v2.tauri.app/)
- [Tailwind CSS](https://tailwindcss.com/)

## Important for macOS Users

As a free, open-source project, Multistream is distributed without a paid Apple Developer certificate. This causes macOS Gatekeeper to flag the application as "damaged" by default.

If you see the error _"Multistream is damaged and can't be opened"_, you have two options:

**1. Install via Homebrew (Recommended):**

```sh
brew install --cask ilanzgx/multistream/multistream
```

**2. Fix manually after downloading the DMG:**

```sh
xattr -cr /Applications/Multistream.app
```

## Getting started

### Prerequisites

- [Bun](https://bun.sh/) or [Node.js](https://nodejs.org/)
- [Rust](https://www.rust-lang.org/)

### Installation

1. Clone the repository
   ```sh
   git clone https://github.com/ilanzgx/multistream.git
   ```
2. Install dependencies
   ```sh
   bun install
   ```
3. Set up environment variables (required for Kick chat login)
   Create a `.env` file inside `apps/desktop/src-tauri/` and add your Kick app credentials:
   ```env
   KICK_CLIENT_ID=your_client_id
   KICK_CLIENT_SECRET=your_client_secret
   TWITCH_CLIENT_ID=your_client_id
   ```
4. Start in development mode
   ```sh
   bun run desktop:tauri:dev
   ```

## License

Distributed under the GPL-3.0 License. See `LICENSE` for more information.
