use std::path::Path;

use super::error::RecordingError;

const MIN_FREE_BYTES: u64 = 2 * 1024 * 1024 * 1024;

pub fn check_disk_space(dir: &Path) -> Result<(), RecordingError> {
    let available = available_space(dir);
    match available {
        Some(bytes) if bytes < MIN_FREE_BYTES => Err(RecordingError::DiskSpace(format!(
            "only {} MB available, 2 GB required",
            bytes / (1024 * 1024)
        ))),
        _ => Ok(()),
    }
}

pub fn check_disk_space_for_remux(dir: &Path, ts_size: u64) -> Result<(), RecordingError> {
    let available = available_space(dir);
    match available {
        Some(bytes) if bytes < ts_size => Err(RecordingError::DiskSpace(format!(
            "only {} MB available, {} MB required for conversion",
            bytes / (1024 * 1024),
            ts_size / (1024 * 1024)
        ))),
        _ => Ok(()),
    }
}

#[cfg(target_os = "windows")]
fn available_space(dir: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;

    let path_wide: Vec<u16> = dir
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut free_bytes_available: u64 = 0;
    let mut total_number_of_bytes: u64 = 0;
    let mut total_number_of_free_bytes: u64 = 0;

    let ok = unsafe {
        windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW(
            path_wide.as_ptr(),
            &mut free_bytes_available,
            &mut total_number_of_bytes,
            &mut total_number_of_free_bytes,
        )
    };

    if ok != 0 {
        Some(free_bytes_available)
    } else {
        None
    }
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn available_space(dir: &Path) -> Option<u64> {
    use std::ffi::CString;

    let path_cstr = CString::new(dir.to_string_lossy().as_bytes()).ok()?;
    let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
    let ret = unsafe { libc::statvfs(path_cstr.as_ptr(), &mut stat) };
    if ret == 0 {
        (stat.f_bavail as u64).checked_mul(stat.f_bsize as u64)
    } else {
        None
    }
}

#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
fn available_space(_dir: &Path) -> Option<u64> {
    None
}
