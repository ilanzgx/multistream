use std::time::{SystemTime, UNIX_EPOCH};

pub mod capture;
pub mod transcriber;

pub(crate) fn timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
