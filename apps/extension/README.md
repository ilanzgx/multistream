# Multistream Browser Extension

Send live streams and embedded players directly from your browser to Multistream Desktop with one click.

Supported platforms: Twitch, Kick, YouTube, and HTML5 video iframes on arbitrary websites.

## How stream detection works

- Twitch and Kick: pulls the streamer's handle from the current channel page and ignores static account or settings pages.
- YouTube: grabs the active stream's 11-character video ID from live broadcasts, `/live` URLs, and channel streams. Non-live pages and standard uploads are ignored.
- Custom players: inspects the page for genuine video iframes based on dimensions (at least 300x160), player aspect ratios, and media permissions. You can also right-click directly inside an embedded player frame.

## Installation

### Chromium browsers (Chrome, Brave, Edge, Opera)

1. Download `multistream-extension.zip` from [Releases](https://github.com/ilanzgx/multistream/releases) and extract it.
2. Navigate to your browser's extensions page (`chrome://extensions`, `brave://extensions`, `edge://extensions`).
3. Turn on **Developer mode** in the top right.
4. Click **Load unpacked** and select the extracted folder.

### Firefox

1. Navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...** and select `manifest.json` from the extracted folder.

## Build

To create the release zip locally:

```bash
bun run extension:pack
```

The output zip is written to `apps/extension/dist/multistream-extension.zip`.

## Usage

- Click the extension icon in your toolbar when viewing a stream.
- Or right-click anywhere on the page, link, or video player and select **Add to Multistream**.
