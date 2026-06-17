<a id="readme-top"></a>

<div align="center">
  <h1 align="center">Multistream</h1>
  <p align="center">
    Watch multiple live streams simultaneously in a single interface.
    <br />
    <strong>Available for Windows, Linux and macOS</strong>
    <br />
    <br />
    <a href="https://github.com/ilanzgx/multistream/releases">Download</a>
    ·
    <a href="https://github.com/ilanzgx/multistream/issues">Report Bug</a>
    ·
    <a href="https://github.com/ilanzgx/multistream/issues">Request Feature</a>
  </p>
</div>

## About The Project

Multistream is a native desktop application designed for power users who want to watch multiple live streams simultaneously. 

Instead of juggling heavy browser tabs, Multistream unifies Twitch, Kick, and YouTube into a single, distraction-free interface—delivering a premium viewing experience that respects your privacy and system resources.

### Key Features

- **Privacy by Design**: 100% local processing. No middleman servers, no data collection, and no telemetry.
- **Direct Connections**: Uses standard iframes to communicate directly with official streaming platforms.
- **Lightweight & Native**: Built with [Tauri](https://tauri.app/) and [Rust](https://www.rust-lang.org/) for incredibly low memory usage and high performance compared to traditional Electron apps.
- **Cross-Platform**: Available natively for Windows, macOS, and Linux.
- **Free Local AI Transcription**: Real-time live translation and transcription powered by a highly optimized, offline C++ model ([Whisper.cpp](https://github.com/ggerganov/whisper.cpp)). Runs entirely on your CPU with zero cloud API costs.

### Built With

- [Vue 3](https://vuejs.org/)
- [Tauri 2](https://v2.tauri.app/)
- [Tailwind CSS](https://tailwindcss.com/)

## Getting Started

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
3. Start in development mode
   ```sh
   bun run tauri:dev
   ```

## License

Distributed under the GPL-3.0 License. See `LICENSE` for more information.
