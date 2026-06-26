<div align="center">
  <h1 align="center">Multistream</h1>

  <p align="center">Twitch, Kick, and YouTube. Side by side. No browser required.</p>

  <p align="center"><strong>Available for Windows, Linux and macOS</strong></p>

  <p align="center">
    <a href="https://github.com/ilanzgx/multistream/releases">Download</a>
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
- **Native chat**: Log in to your Twitch and Kick accounts directly in the app and chat with your favorite streamers without opening a browser. Free, no subscription. Supports 7TV, BTTV, and platform emotes.
- **Direct from the source**: Streams load from the official players, so your views count and quality is exactly the same as on the platform itself.
- **Lightweight**: Built with [Tauri](https://tauri.app/) and [Rust](https://www.rust-lang.org/), so memory usage is a fraction of what any browser-based alternative would use.
- **Available in 6 languages**: English, Portuguese, Spanish, German, Russian, and Chinese.
- **Cross-platform**: Works on Windows, macOS, and Linux.
- **Local AI transcription**: Real-time transcription powered by [Whisper.cpp](https://github.com/ggerganov/whisper.cpp), running fully offline on your CPU. Useful for streams in languages you don't speak. No API keys, no costs, no audio ever leaves your machine.

### Built with

- [Vue 3](https://vuejs.org/)
- [Tauri 2](https://v2.tauri.app/)
- [Tailwind CSS](https://tailwindcss.com/)

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
   Create a `.env` file inside `src-tauri/` and add your Kick app credentials:
   ```env
   KICK_CLIENT_ID=your_client_id
   KICK_CLIENT_SECRET=your_client_secret
   ```
4. Start in development mode
   ```sh
   bun run tauri:dev
   ```

## License

Distributed under the GPL-3.0 License. See `LICENSE` for more information.
