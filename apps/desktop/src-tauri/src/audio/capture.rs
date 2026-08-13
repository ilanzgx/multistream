use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use hound::{SampleFormat as HoundSampleFormat, WavSpec, WavWriter};
use std::path::Path;
use std::sync::mpsc;

// Future: Abstract the capture mechanism into an `AudioCaptureBackend` trait
// pub trait AudioCaptureBackend: Send { ... }
//
// Current backend: WasapiLoopbackCapture
// Future backends:
// - Linux -> PipeWire/PulseAudio backend
// - macOS -> CoreAudio backend

pub struct CaptureSession {
    pub _stream: cpal::Stream,
    pub rx: mpsc::Receiver<f32>,
    pub sample_rate: u32,
    pub channels: u16,
}

/// Starts capturing audio from the default WASAPI output device (loopback).
pub fn start_loopback() -> Result<CaptureSession, String> {
    let host = cpal::default_host();
    let device = host
        .default_output_device()
        .ok_or("No default output device available")?;

    let config = device
        .default_output_config()
        .map_err(|e| format!("Failed to get default output config: {e}"))?;

    let sample_rate = config.sample_rate().0;
    let channels = config.channels();

    let (tx, rx) = mpsc::sync_channel(48000 * 2 * 10); // 10s of bounded buffering

    let err_fn = |err| log::error!("an error occurred on loopback audio stream: {}", err);

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => device
            .build_input_stream(
                &config.into(),
                move |data: &[f32], _: &_| {
                    for &sample in data {
                        let _ = tx.try_send(sample);
                    }
                },
                err_fn,
                None,
            )
            .map_err(|e| e.to_string())?,
        cpal::SampleFormat::I16 => device
            .build_input_stream(
                &config.into(),
                move |data: &[i16], _: &_| {
                    for &sample in data {
                        let _ = tx.try_send(sample as f32 / i16::MAX as f32);
                    }
                },
                err_fn,
                None,
            )
            .map_err(|e| e.to_string())?,
        cpal::SampleFormat::U16 => device
            .build_input_stream(
                &config.into(),
                move |data: &[u16], _: &_| {
                    for &sample in data {
                        let _ = tx.try_send(
                            (sample as f32 - u16::MAX as f32 / 2.0) / (u16::MAX as f32 / 2.0),
                        );
                    }
                },
                err_fn,
                None,
            )
            .map_err(|e| e.to_string())?,
        _ => return Err("Unsupported sample format".into()),
    };

    stream
        .play()
        .map_err(|e| format!("Failed to play stream: {e}"))?;

    Ok(CaptureSession {
        _stream: stream,
        rx,
        sample_rate,
        channels,
    })
}

/// Converts interleaved multi-channel audio to mono by averaging channels.
pub fn to_mono(input: &[f32], channels: u16) -> Vec<f32> {
    if channels == 1 {
        return input.to_vec();
    }
    let channels = channels as usize;
    let mut mono = Vec::with_capacity(input.len() / channels);
    for frame in input.chunks_exact(channels) {
        let sum: f32 = frame.iter().sum();
        mono.push(sum / channels as f32);
    }
    mono
}

/// Resamples mono audio using simple linear decimation.
/// Warning: This does not apply a low-pass anti-aliasing filter.
pub fn resample_mono(input: &[f32], in_rate: u32, out_rate: u32) -> Vec<f32> {
    if in_rate == out_rate {
        return input.to_vec();
    }
    let ratio = in_rate as f32 / out_rate as f32;
    let out_len = (input.len() as f32 / ratio).ceil() as usize;
    let mut output = Vec::with_capacity(out_len);

    for i in 0..out_len {
        let exact_idx = i as f32 * ratio;
        let idx_floor = exact_idx.floor() as usize;
        let idx_ceil = (idx_floor + 1).min(input.len().saturating_sub(1));
        let fraction = exact_idx - idx_floor as f32;

        if idx_floor < input.len() {
            let sample_floor = input[idx_floor];
            let sample_ceil = input[idx_ceil];
            let interpolated = sample_floor + fraction * (sample_ceil - sample_floor);
            output.push(interpolated);
        }
    }
    output
}

/// Writes 16-bit PCM samples to a WAV file with dynamic channels and sample rate.
pub fn write_wav(
    path: &Path,
    samples: &[f32],
    channels: u16,
    sample_rate: u32,
) -> Result<(), String> {
    let spec = WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 16,
        sample_format: HoundSampleFormat::Int,
    };

    let mut writer = WavWriter::create(path, spec).map_err(|e| e.to_string())?;
    for &sample in samples {
        let sample_i16 = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        writer.write_sample(sample_i16).map_err(|e| e.to_string())?;
    }
    writer.finalize().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_convert_stereo_to_mono() {
        // Arrange: L = 1.0, R = -1.0, L = 0.5, R = 0.5
        let stereo = vec![1.0, -1.0, 0.5, 0.5];

        // Act
        let mono = to_mono(&stereo, 2);

        // Assert
        assert_eq!(mono.len(), 2);
        assert_eq!(mono[0], 0.0); // (1.0 + -1.0) / 2
        assert_eq!(mono[1], 0.5); // (0.5 + 0.5) / 2
    }

    #[test]
    fn should_return_same_if_already_mono() {
        let mono = vec![1.0, 0.0, -1.0];
        let result = to_mono(&mono, 1);
        assert_eq!(result, mono);
    }

    #[test]
    fn should_resample_mono_downsample() {
        // Arrange
        // Simple case: going from 48000 to 16000 (3:1 ratio)
        // input: 9 samples, output should be 3 samples
        let input = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0];

        // Act
        let result = resample_mono(&input, 48000, 16000);

        // ratio = 3.0.
        // i=0 -> exact_idx=0.0 -> input[0]
        // i=1 -> exact_idx=3.0 -> input[3]
        // i=2 -> exact_idx=6.0 -> input[6]

        // Assert
        assert_eq!(result.len(), 3);
        assert_eq!(result[0], 1.0);
        assert_eq!(result[1], 4.0);
        assert_eq!(result[2], 7.0);
    }

    #[test]
    fn should_resample_mono_interpolate() {
        // Arrange
        let input = vec![0.0, 10.0, 20.0];

        // Act: Downsample 2:1
        // ratio = 2.0
        // i=0 -> exact=0 -> 0.0
        // i=1 -> exact=2 -> 20.0
        let result = resample_mono(&input, 2, 1);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], 0.0);
        assert_eq!(result[1], 20.0);
    }

    #[test]
    fn should_return_same_if_same_sample_rate() {
        let input = vec![1.0, 0.0, -1.0];
        let result = resample_mono(&input, 48000, 48000);
        assert_eq!(result, input);
    }
}
