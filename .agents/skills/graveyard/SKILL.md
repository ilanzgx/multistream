---
name: multistream-graveyard
description: Explains the Multistream Graveyard mechanism, how it works, and why it is necessary to prevent WebView IPC crashes. Use this skill when asked about the graveyard, stream removal, Mojo crashes, or why iframes are not removed immediately.
---

# Multistream Graveyard Mechanism

This skill explains the "Graveyard" mechanism used in the Multistream application to handle the removal of stream iframes.

## Why is it necessary? (The Problem)

In Tauri applications that use WebView2 (Chromium) on Windows, there is a known architectural quirk regarding IPC (Inter-Process Communication) and Mojo pipes. If you completely and immediately remove an `iframe` from the DOM while it still has active internal connections (such as media playing or open WebSockets), it can sever the Mojo IPC pipe abruptly.

This abrupt severing causes a catastrophic `ChannelError` Mojo crash, which brings down the entire application window without warning.

## How it works (The Solution)

To prevent these crashes, Multistream uses a **Two-Phase Removal (Graveyard)** approach in `StreamGrid.vue`. Instead of unmounting the iframe immediately, the application "kills" it softly and retains it in the DOM until it is safe to remove.

### Phase 1: Soft Kill (Entering the Graveyard)

When a user closes a stream (or a stream is removed from the active `streams` list):

1. **Mark as Dead:** The DOM representation of the stream is marked with `_isDead = true`.
2. **Hide Visually:** A Vue `v-show="!stream._isDead"` directive immediately hides the iframe from the UI.
3. **Suspend Audio/Media:** The app calls `pauseIframe()`, which sends a `MULTISTREAM_GRAVEYARD_SUSPEND` postMessage to the iframe.
   - _Note:_ The word "pause" is intentionally avoided in the message payload because some third-party scripts aggressively block any message containing "pause".
   - A globally injected Rust script (`graveyard_script` in `lib.rs`) intercepts this message inside the iframe to monkey-patch and silence `HTMLMediaElement.play` and the `AudioContext`. This effectively pauses all media playback without tearing down the iframe.

### Phase 2: Garbage Collection (Leaving the Graveyard)

The streams remain hidden in the DOM (in the Graveyard) until the Garbage Collector decides it is safe to fully remove them. The GC runs reactively and applies the following rules:

1. **Custom Streams Bypass:** Streams with `platform === 'custom'` bypass the graveyard entirely and are removed from the DOM immediately, as they don't share the same risk of platform-wide IPC crash cascades.
2. **Twitch Native Bypass:** If the stream is Twitch (`platform === 'twitch'`) AND the user has the native HLS player enabled (`nativePlayerEnabled`), it bypasses the graveyard and is removed immediately.
3. **Platform Lifecycle:** For all other streams (e.g., Kick, or standard Twitch iframes), the GC checks if there are _any_ active streams remaining for that specific platform (`activePlatforms.has(ds.platform)`).
   - As long as there is at least one active stream of that platform, the dead streams stay in the graveyard.
   - Once the _last_ active stream of that platform is closed, the GC safely removes all graveyard iframes belonging to that platform from the DOM at once.

## Important Considerations for Developers

- **Never force-unmount iframes:** Do not use `v-if` to conditionally render iframes for Twitch or Kick, as this will bypass the Graveyard and cause Mojo crashes. Always use `v-show` and integrate with the `_isDead` logic.
- **Audio Leaks:** If a stream is in the graveyard but you can still hear audio, it means the `MULTISTREAM_GRAVEYARD_SUSPEND` message failed to intercept or the injected script is broken. Do not try to solve this by force-removing the iframe; fix the interception logic.
