// Audio module for the Live Transcription feature.
//
// This module handles model management (download, status) and the transcription
// pipeline (start, stop). Audio capture is currently stubbed pending a
// process-scoped WASAPI implementation.
//
// TODO(audio-capture): Implement process-scoped WASAPI loopback capture using
// Windows IAudioSessionManager2 / IAudioClient COM APIs (or cpal with a custom
// loopback device selector) so that only Multistream's own audio output is
// captured, rather than all system audio.
//
// Architecture (future):
//   [cpal loopback thread] → raw PCM f32 16kHz mono chunks
//       → [resampler]
//       → [WAV writer] → temp file (whisper-models/tmp/chunk_N.wav)
//       → [sidecar: whisper-main --model ... -f chunk_N.wav]
//       → stdout JSON / plain text
//       → [Tauri event: transcription:text { text, timestamp }]

pub mod transcriber;
