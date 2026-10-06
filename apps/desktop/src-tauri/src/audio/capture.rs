use hound::{SampleFormat as HoundSampleFormat, WavSpec, WavWriter};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU32};
use std::sync::{mpsc, Arc};
use std::thread::JoinHandle;

pub const TARGET_SAMPLE_RATE: u32 = 16000;

#[cfg(any(windows, test))]
pub(crate) const DECIMATION: usize = 3;
#[cfg(any(windows, test))]
const FIR_TAPS: usize = 15;

/// 15-tap Hamming-windowed sinc low-pass FIR filter (cutoff = 7.2 kHz at 48 kHz sample rate),
/// normalized to unity DC gain. Preserves vocal formants and sibilants (0–7 kHz) while
/// attenuating >8 kHz energy to prevent aliasing when decimating 48 kHz -> 16 kHz.
#[cfg(any(windows, test))]
const LOWPASS_FIR_COEFFS: [f32; FIR_TAPS] = [
    0.0011183, -0.0038948, -0.0160349, -0.0203638, 0.0209518, 0.1244978, 0.244507, 0.2984372,
    0.244507, 0.1244978, 0.0209518, -0.0203638, -0.0160349, -0.0038948, 0.0011183,
];

/// Stateful 3:1 FIR low-pass decimator (48 kHz -> 16 kHz) that preserves filter history
/// across packet boundaries to prevent phase discontinuities and high-frequency aliasing.
#[cfg(any(windows, test))]
pub(crate) struct FirDecimator {
    buffer: Vec<f32>,
}

#[cfg(any(windows, test))]
impl Default for FirDecimator {
    fn default() -> Self {
        Self {
            buffer: vec![0.0; FIR_TAPS - 1],
        }
    }
}

#[cfg(any(windows, test))]
impl FirDecimator {
    pub(crate) fn process(&mut self, input: &[f32], output: &mut Vec<f32>) {
        self.buffer.extend_from_slice(input);
        if self.buffer.len() < FIR_TAPS {
            return;
        }
        let available = self.buffer.len() - (FIR_TAPS - 1);
        let out_count = available / DECIMATION;
        if out_count == 0 {
            return;
        }
        output.reserve(out_count);
        for i in 0..out_count {
            let start = i * DECIMATION;
            let window = &self.buffer[start..start + FIR_TAPS];
            let mut acc = 0.0_f32;
            for j in 0..FIR_TAPS {
                acc += window[j] * LOWPASS_FIR_COEFFS[j];
            }
            output.push(acc);
        }
        let consumed = out_count * DECIMATION;
        self.buffer.drain(..consumed);
    }
}

#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaptureSource {
    AppProcessTree,
    SystemLoopback,
}

/// Capture runs on its own thread and only hands off complete chunks, so a slow
/// Whisper inference never stalls the WASAPI read loop (which would drop audio).
pub struct CaptureSession {
    pub chunks: mpsc::Receiver<Vec<f32>>,
    pub source: CaptureSource,
    pub thread: JoinHandle<()>,
}

pub fn start_capture(
    running: Arc<AtomicBool>,
    chunk_duration: Arc<AtomicU32>,
) -> Result<CaptureSession, String> {
    platform::start_capture(running, chunk_duration)
}

#[cfg(windows)]
mod platform {
    use super::*;
    use std::collections::VecDeque;
    use std::sync::atomic::Ordering;
    use wasapi::{
        initialize_mta, AudioClient, DeviceEnumerator, Direction, SampleType, StreamMode,
        WaveFormat,
    };

    const NATIVE_SAMPLE_RATE: usize = 48000;
    const NATIVE_CHANNELS: usize = 2;
    const BYTES_PER_FRAME: usize = 4 * NATIVE_CHANNELS;
    const EVENT_TIMEOUT_MS: u32 = 100;

    pub fn start_capture(
        running: Arc<AtomicBool>,
        chunk_duration: Arc<AtomicU32>,
    ) -> Result<CaptureSession, String> {
        let (tx_chunks, rx_chunks) = mpsc::channel::<Vec<f32>>();
        let (tx_init, rx_init) = mpsc::channel::<Result<CaptureSource, String>>();

        // COM objects are not Send, so the client must be created on the thread that reads it.
        let thread = std::thread::spawn(move || {
            let _ = initialize_mta();
            let (client, source) = match open_client() {
                Ok(v) => v,
                Err(e) => {
                    let _ = tx_init.send(Err(e));
                    return;
                }
            };
            let _ = tx_init.send(Ok(source));
            if let Err(e) = capture_loop(client, &running, &chunk_duration, &tx_chunks) {
                log::error!("Audio capture loop failed: {e}");
            }
        });

        match rx_init.recv() {
            Ok(Ok(source)) => Ok(CaptureSession {
                chunks: rx_chunks,
                source,
                thread,
            }),
            Ok(Err(e)) => {
                let _ = thread.join();
                Err(e)
            }
            Err(_) => Err("Capture thread died unexpectedly".to_string()),
        }
    }

    fn capture_format() -> WaveFormat {
        WaveFormat::new(
            32,
            32,
            &SampleType::Float,
            NATIVE_SAMPLE_RATE,
            NATIVE_CHANNELS,
            None,
        )
    }

    #[derive(Default)]
    struct PacketStats {
        packets: u32,
        silent_packets: u32,
    }

    fn shared_mode() -> StreamMode {
        // autoconvert lets the WASAPI engine resample/downmix with a proper filter.
        StreamMode::EventsShared {
            autoconvert: true,
            buffer_duration_hns: 0,
        }
    }

    fn open_client() -> Result<(AudioClient, CaptureSource), String> {
        match open_process_loopback() {
            Ok(client) => return Ok((client, CaptureSource::AppProcessTree)),
            Err(e) => log::warn!(
                "Process loopback unavailable ({e}); falling back to system-wide loopback"
            ),
        }
        open_system_loopback().map(|client| (client, CaptureSource::SystemLoopback))
    }

    /// Requires Windows 10 build 20348+. Measured on WebView2: the audio session is owned by the
    /// browser process (a direct child of the app), so targeting the app PID or the AudioService
    /// PID captures silence. Including the browser's tree covers only stream audio.
    fn open_process_loopback() -> Result<AudioClient, String> {
        let browser_pid = find_webview_browser_pid()
            .ok_or("WebView2 browser process not found among app children")?;
        log::info!("Process loopback target: WebView2 browser pid {browser_pid}");
        let mut client = AudioClient::new_application_loopback_client(browser_pid, true)
            .map_err(|e| e.to_string())?;
        client
            .initialize_client(&capture_format(), &Direction::Capture, &shared_mode())
            .map_err(|e| e.to_string())?;
        Ok(client)
    }

    fn find_webview_browser_pid() -> Option<u32> {
        use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
        use windows_sys::Win32::System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
            TH32CS_SNAPPROCESS,
        };

        let app_pid = std::process::id();
        let mut found = None;
        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snapshot == INVALID_HANDLE_VALUE {
                return None;
            }
            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            let mut has_entry = Process32FirstW(snapshot, &mut entry) != 0;
            while has_entry {
                if entry.th32ParentProcessID == app_pid {
                    let len = entry
                        .szExeFile
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(entry.szExeFile.len());
                    let name = String::from_utf16_lossy(&entry.szExeFile[..len]);
                    if name.eq_ignore_ascii_case("msedgewebview2.exe") {
                        found = Some(entry.th32ProcessID);
                        break;
                    }
                }
                has_entry = Process32NextW(snapshot, &mut entry) != 0;
            }
            CloseHandle(snapshot);
        }
        found
    }

    fn open_system_loopback() -> Result<AudioClient, String> {
        let device = DeviceEnumerator::new()
            .and_then(|en| en.get_default_device(&Direction::Render))
            .map_err(|e| format!("No default output device available: {e}"))?;
        let mut client = device.get_iaudioclient().map_err(|e| e.to_string())?;
        client
            .initialize_client(&capture_format(), &Direction::Capture, &shared_mode())
            .map_err(|e| format!("Failed to initialize loopback client: {e}"))?;
        Ok(client)
    }

    fn capture_loop(
        client: AudioClient,
        running: &AtomicBool,
        chunk_duration: &AtomicU32,
        tx_chunks: &mpsc::Sender<Vec<f32>>,
    ) -> Result<(), String> {
        let event = client.set_get_eventhandle().map_err(|e| e.to_string())?;
        let capture_client = client.get_audiocaptureclient().map_err(|e| e.to_string())?;
        client.start_stream().map_err(|e| e.to_string())?;

        let mut raw: VecDeque<u8> = VecDeque::new();
        let mut mono_native: Vec<f32> = Vec::new();
        let mut decimator = FirDecimator::default();
        let mut pending: Vec<f32> = Vec::new();
        let mut stats = PacketStats::default();

        while running.load(Ordering::SeqCst) {
            // Process loopback emits no events while the app is silent; a timeout is expected.
            if event.wait_for_event(EVENT_TIMEOUT_MS).is_err() {
                continue;
            }

            loop {
                let frames = capture_client
                    .get_next_packet_size()
                    .map_err(|e| e.to_string())?
                    .unwrap_or(0);
                if frames == 0 {
                    break;
                }
                let before = raw.len();
                let info = capture_client
                    .read_from_device_to_deque(&mut raw)
                    .map_err(|e| e.to_string())?;
                stats.packets += 1;
                if info.flags.silent {
                    stats.silent_packets += 1;
                    raw.range_mut(before..).for_each(|b| *b = 0);
                }
            }

            let whole = raw.len() - raw.len() % BYTES_PER_FRAME;
            let bytes: Vec<u8> = raw.drain(..whole).collect();
            mono_native.clear();
            mono_native.extend(bytes.chunks_exact(BYTES_PER_FRAME).map(|frame| {
                let l = f32::from_le_bytes([frame[0], frame[1], frame[2], frame[3]]);
                let r = f32::from_le_bytes([frame[4], frame[5], frame[6], frame[7]]);
                (l + r) * 0.5
            }));

            decimator.process(&mono_native, &mut pending);

            let seconds = chunk_duration.load(Ordering::Relaxed).clamp(5, 30);
            let samples_per_chunk = (TARGET_SAMPLE_RATE * seconds) as usize;
            while pending.len() >= samples_per_chunk {
                let chunk: Vec<f32> = pending.drain(..samples_per_chunk).collect();
                let peak = chunk.iter().fold(0.0_f32, |p, s| p.max(s.abs()));
                log::info!(
                    "Capture chunk: {} packets ({} flagged silent), peak {:.4}",
                    stats.packets,
                    stats.silent_packets,
                    peak
                );
                stats = PacketStats::default();
                if tx_chunks.send(chunk).is_err() {
                    let _ = client.stop_stream();
                    return Ok(());
                }
            }
        }

        let _ = client.stop_stream();
        Ok(())
    }
}

#[cfg(not(windows))]
mod platform {
    use super::*;

    pub fn start_capture(
        _running: Arc<AtomicBool>,
        _chunk_duration: Arc<AtomicU32>,
    ) -> Result<CaptureSession, String> {
        Err("Audio capture is currently supported only on Windows".to_string())
    }
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
    fn should_preserve_dc_signal_and_decimate_by_three() {
        // Arrange
        let mut decimator = FirDecimator::default();
        let input = vec![0.5_f32; 300];
        let mut output = Vec::new();

        // Act
        decimator.process(&input, &mut output);

        // Assert
        assert_eq!(output.len(), 100);
        for &sample in &output[10..] {
            assert!((sample - 0.5).abs() < 1e-3);
        }
    }

    #[test]
    fn should_attenuate_above_nyquist_high_frequency_signal() {
        // Arrange: 16 kHz tone at 48 kHz sample rate (period = 3 samples, above 8 kHz Nyquist)
        let mut decimator = FirDecimator::default();
        let input: Vec<f32> = (0..600)
            .map(|i| {
                let phase = 2.0 * std::f32::consts::PI * 16000.0 * (i as f32) / 48000.0;
                phase.sin()
            })
            .collect();
        let mut output = Vec::new();

        // Act
        decimator.process(&input, &mut output);

        // Assert: steady-state aliased energy after filter settling should be strongly attenuated
        let steady_peak = output[20..].iter().fold(0.0_f32, |p, s| p.max(s.abs()));
        assert!(
            steady_peak < 0.05,
            "Expected high-frequency aliasing to be < 0.05, got {steady_peak}"
        );
    }

    #[test]
    fn should_preserve_state_across_non_multiple_packet_boundaries() {
        // Arrange
        let mut single_pass = FirDecimator::default();
        let mut chunked_pass = FirDecimator::default();
        let input: Vec<f32> = (0..300)
            .map(|i| (2.0 * std::f32::consts::PI * 1000.0 * (i as f32) / 48000.0).sin())
            .collect();
        let mut out_single = Vec::new();
        let mut out_chunked = Vec::new();

        // Act: feed in non-multiple-of-3 slices (e.g. 7 samples at a time)
        single_pass.process(&input, &mut out_single);
        for slice in input.chunks(7) {
            chunked_pass.process(slice, &mut out_chunked);
        }

        // Assert
        assert_eq!(out_single.len(), out_chunked.len());
        for (a, b) in out_single.iter().zip(out_chunked.iter()) {
            assert!((a - b).abs() < 1e-6);
        }
    }
}
