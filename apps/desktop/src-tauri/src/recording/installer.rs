use std::fs;
#[cfg(not(target_os = "linux"))]
use std::io::Cursor;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};
#[cfg(not(target_os = "linux"))]
use zip::ZipArchive;

// ─── Windows constants (existing, unchanged) ──────────────────────────────────
#[cfg(target_os = "windows")]
const PYTHON_URL: &str = "https://www.python.org/ftp/python/3.11.8/python-3.11.8-embed-amd64.zip";
#[cfg(target_os = "windows")]
const GET_PIP_URL: &str = "https://raw.githubusercontent.com/pypa/get-pip/f6f644156f23dfe9acc06e7b9ca75eee311f2e37/public/get-pip.py";
#[cfg(target_os = "windows")]
const FFMPEG_URL: &str =
    "https://github.com/GyanD/codexffmpeg/releases/download/7.1/ffmpeg-7.1-essentials_build.zip";

#[cfg(target_os = "windows")]
const PYTHON_SHA256: &str = "6347068ca56bf4dd6319f7ef5695f5a03f1ade3e9aa2d6a095ab27faa77a1290";
#[cfg(target_os = "windows")]
const GET_PIP_SHA256: &str = "fb24e693bab954209a063d90953621412ccad4a500905a726286e038f508ddf6";
#[cfg(target_os = "windows")]
const FFMPEG_SHA256: &str = "fa7d4d7e795db0e2503f49f105f46ed5852386f0cfdd819899be3b65ebde24fc";

// ─── Linux x86_64 constants ───────────────────────────────────────────────────
// streamlink+ffmpeg AppImage: FFmpeg is bundled — no separate FFmpeg download needed.
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
const STREAMLINK_APPIMAGE_URL: &str = "https://github.com/streamlink/streamlink-appimage/releases/download/8.5.0-1/streamlink%2Bffmpeg-8.5.0-1-cp314-cp314-manylinux_2_28_x86_64.AppImage";
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
const STREAMLINK_APPIMAGE_SHA256: &str =
    "054d585dae1c443753b8fed594877efa036c340e453c9cd471fd6a19c1db996e";

// ─── macOS aarch64 constants ──────────────────────────────────────────────────
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
const PYTHON_STANDALONE_URL: &str = "https://github.com/astral-sh/python-build-standalone/releases/download/20260814/cpython-3.13.15%2B20260814-aarch64-apple-darwin-install_only.tar.gz";
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
const PYTHON_STANDALONE_SHA256: &str =
    "7d50bb42813a5644db7c40d3ad79361d0b724bb29d25a91fab1048c2c5c6a8c5";
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
const FFMPEG_URL: &str = "https://ffmpeg.martin-riedl.de/download/macos/arm64/1785661721_N-125892-g406c5a37aa/ffmpeg.zip";
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
const FFMPEG_SHA256: &str = "2d96af0e28b81d5215d8b9a6dec4e751b5b97408205ccfae5760084fa107d936";

// ─── macOS x86_64 constants ───────────────────────────────────────────────────
#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
const PYTHON_STANDALONE_URL: &str = "https://github.com/astral-sh/python-build-standalone/releases/download/20260814/cpython-3.13.15%2B20260814-x86_64-apple-darwin-install_only.tar.gz";
#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
const PYTHON_STANDALONE_SHA256: &str =
    "44bb8a1d97c070deb30880b2b7fe681c1e9cf727cb950709e022dc195cdfdf4f";
#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
const FFMPEG_URL: &str = "https://ffmpeg.martin-riedl.de/download/macos/amd64/1767299902_N-122320-g38e89fe502/ffmpeg.zip";
#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
const FFMPEG_SHA256: &str = "6f0736d424b7426f8cbb7bba5c5448d94c976c138c669593b1f40ba534ed192f";

// Streamlink version used in `pip install` on macOS (matches AppImage on Linux).
#[cfg(target_os = "macos")]
const STREAMLINK_VERSION: &str = "8.5.0";

// ─── Shared helpers ───────────────────────────────────────────────────────────

fn verify_hash(bytes: &[u8], expected_hash: &str) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let result = hasher.finalize();
    let hex_result = format!("{:x}", result);
    if hex_result != expected_hash {
        return Err(format!(
            "Hash mismatch. Expected {}, got {}",
            expected_hash, hex_result
        ));
    }
    Ok(())
}

#[derive(Clone, serde::Serialize)]
struct InstallProgress {
    step: String,
    progress: u8,
}

fn emit_progress(app: &AppHandle, step: &str, progress: u8) {
    let _ = app.emit(
        "recording-install-progress",
        InstallProgress {
            step: step.to_string(),
            progress,
        },
    );
}

pub fn get_recording_env_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))
        .map(|p| p.join("recording_env"))
}

// ─── Binary path resolution ────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
pub fn get_python_exe(app: &AppHandle) -> Result<PathBuf, String> {
    get_recording_env_dir(app).map(|p| p.join("python.exe"))
}

#[cfg(target_os = "linux")]
pub fn get_python_exe(app: &AppHandle) -> Result<PathBuf, String> {
    get_recording_env_dir(app).map(|p| p.join("streamlink").join("squashfs-root").join("AppRun"))
}

#[cfg(target_os = "macos")]
pub fn get_python_exe(app: &AppHandle) -> Result<PathBuf, String> {
    get_recording_env_dir(app).map(|p| p.join("python").join("install").join("bin").join("python3"))
}

#[cfg(target_os = "windows")]
pub fn get_ffmpeg_exe(app: &AppHandle) -> Result<PathBuf, String> {
    get_recording_env_dir(app).map(|p| p.join("ffmpeg.exe"))
}

#[cfg(target_os = "linux")]
pub fn get_ffmpeg_exe(app: &AppHandle) -> Result<PathBuf, String> {
    get_recording_env_dir(app).map(|p| {
        p.join("streamlink")
            .join("squashfs-root")
            .join("usr")
            .join("bin")
            .join("ffmpeg")
    })
}

#[cfg(target_os = "macos")]
pub fn get_ffmpeg_exe(app: &AppHandle) -> Result<PathBuf, String> {
    get_recording_env_dir(app).map(|p| p.join("ffmpeg"))
}

// ─── Dependency checks ─────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn recording_check_dependencies(app: tauri::AppHandle) -> Result<bool, String> {
    let env_dir = get_recording_env_dir(&app)?;
    let python_exe = env_dir.join("python.exe");
    let ffmpeg_exe = env_dir.join("ffmpeg.exe");
    let streamlink_exe = env_dir.join("Scripts").join("streamlink.exe");

    Ok(python_exe.exists() && ffmpeg_exe.exists() && streamlink_exe.exists())
}

#[cfg(target_os = "linux")]
#[tauri::command]
pub async fn recording_check_dependencies(app: tauri::AppHandle) -> Result<bool, String> {
    let env_dir = get_recording_env_dir(&app)?;
    let apprun = env_dir
        .join("streamlink")
        .join("squashfs-root")
        .join("AppRun");
    let ffmpeg = env_dir
        .join("streamlink")
        .join("squashfs-root")
        .join("usr")
        .join("bin")
        .join("ffmpeg");
    Ok(apprun.exists() && ffmpeg.exists())
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn recording_check_dependencies(app: tauri::AppHandle) -> Result<bool, String> {
    let env_dir = get_recording_env_dir(&app)?;
    let python3 = env_dir
        .join("python")
        .join("install")
        .join("bin")
        .join("python3");
    let streamlink_bin = env_dir
        .join("python")
        .join("install")
        .join("bin")
        .join("streamlink");
    let ffmpeg = env_dir.join("ffmpeg");
    Ok(python3.exists() && streamlink_bin.exists() && ffmpeg.exists())
}

// ─── Shared IPC commands (platform-agnostic) ──────────────────────────────────

#[tauri::command]
pub async fn recording_get_env_size(app: tauri::AppHandle) -> Result<u64, String> {
    let env_dir = get_recording_env_dir(&app)?;
    if !env_dir.exists() {
        return Ok(0);
    }

    fn get_size(path: &Path) -> std::io::Result<u64> {
        let mut size = 0;
        if path.is_dir() {
            for entry in fs::read_dir(path)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    size += get_size(&path)?;
                } else {
                    size += entry.metadata()?.len();
                }
            }
        } else {
            size += path.metadata()?.len();
        }
        Ok(size)
    }

    let total_size = get_size(&env_dir).map_err(|e| e.to_string())?;
    Ok(total_size)
}

#[tauri::command]
pub async fn recording_uninstall_dependencies(app: tauri::AppHandle) -> Result<(), String> {
    let env_dir = get_recording_env_dir(&app)?;
    if env_dir.exists() {
        fs::remove_dir_all(&env_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ─── Download helper (shared) ─────────────────────────────────────────────────

async fn download_file(url: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::new();
    let response = client.get(url).send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Failed to download from {}", url));
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    Ok(bytes.to_vec())
}

// ─── Archive extraction helpers ───────────────────────────────────────────────

// Extracts all entries from a ZIP archive (Windows Python embed ZIP).
#[cfg(target_os = "windows")]
fn extract_zip(bytes: &[u8], target_dir: &Path) -> Result<(), String> {
    let cursor = Cursor::new(bytes);
    let mut archive = ZipArchive::new(cursor).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = match file.enclosed_name() {
            Some(path) => target_dir.join(path),
            None => continue,
        };

        if (*file.name()).ends_with('/') {
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p).map_err(|e| e.to_string())?;
                }
            }
            let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

// Extracts only ffmpeg.exe from the GyanD ZIP (Windows).
#[cfg(target_os = "windows")]
fn extract_ffmpeg(bytes: &[u8], target_dir: &Path) -> Result<(), String> {
    let cursor = Cursor::new(bytes);
    let mut archive = ZipArchive::new(cursor).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();

        if name.ends_with("bin/ffmpeg.exe") {
            let outpath = target_dir.join("ffmpeg.exe");
            let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    Err("ffmpeg.exe not found in archive".into())
}

// Extracts the ffmpeg binary from a martin-riedl ZIP (macOS).
// The ZIP contains a single `ffmpeg` file at the root.
#[cfg(target_os = "macos")]
fn extract_ffmpeg_macos(bytes: &[u8], target_dir: &Path) -> Result<(), String> {
    let cursor = Cursor::new(bytes);
    let mut archive = ZipArchive::new(cursor).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();
        if name == "ffmpeg" || name.ends_with("/ffmpeg") {
            let outpath = target_dir.join("ffmpeg");
            let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    Err("ffmpeg binary not found in archive".into())
}

// ─── Unix helpers ─────────────────────────────────────────────────────────────

#[cfg(unix)]
fn set_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = fs::metadata(path)
        .map_err(|e| format!("set_executable metadata: {e}"))?
        .permissions();
    perms.set_mode(0o755);
    fs::set_permissions(path, perms).map_err(|e| format!("set_executable chmod: {e}"))
}

#[cfg(target_os = "macos")]
fn extract_tar_gz(bytes: &[u8], target_dir: &Path) -> Result<(), String> {
    use flate2::read::GzDecoder;
    use tar::Archive;
    let decoder = GzDecoder::new(std::io::Cursor::new(bytes));
    let mut archive = Archive::new(decoder);
    archive
        .unpack(target_dir)
        .map_err(|e| format!("tar.gz extraction failed: {e}"))
}

// ─── Install pipelines ────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn recording_install_dependencies(app: tauri::AppHandle) -> Result<(), String> {
    let env_dir = get_recording_env_dir(&app)?;
    if !env_dir.exists() {
        fs::create_dir_all(&env_dir).map_err(|e| e.to_string())?;
    }

    // 1. Download and extract Python
    emit_progress(&app, "Downloading Python Environment...", 10);
    let python_bytes = download_file(PYTHON_URL).await?;
    verify_hash(&python_bytes, PYTHON_SHA256)?;

    emit_progress(&app, "Extracting Python...", 30);
    extract_zip(&python_bytes, &env_dir)?;

    // Fix python311._pth to enable 'import site' for pip
    let pth_path = env_dir.join("python311._pth");
    if pth_path.exists() {
        let content =
            fs::read_to_string(&pth_path).map_err(|e| format!("Failed to read _pth: {e}"))?;
        let new_content = content.replace("#import site", "import site");
        fs::write(&pth_path, new_content).map_err(|e| format!("Failed to write _pth: {e}"))?;
    }

    // 2. Download get-pip.py
    emit_progress(&app, "Downloading pip...", 50);
    let pip_bytes = download_file(GET_PIP_URL).await?;
    verify_hash(&pip_bytes, GET_PIP_SHA256)?;
    let get_pip_path = env_dir.join("get-pip.py");
    fs::write(&get_pip_path, pip_bytes).map_err(|e| e.to_string())?;

    // 3. Install pip
    emit_progress(&app, "Installing pip...", 60);
    let python_exe = env_dir.join("python.exe");

    use std::os::windows::process::CommandExt;

    let mut cmd = std::process::Command::new(&python_exe);
    cmd.arg(&get_pip_path).current_dir(&env_dir);
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let pip_status = cmd.status().map_err(|e| e.to_string())?;

    if !pip_status.success() {
        return Err("Failed to install pip".into());
    }

    // 4. Install Streamlink
    emit_progress(&app, "Installing Streamlink...", 70);
    let mut cmd2 = std::process::Command::new(&python_exe);
    cmd2.arg("-m")
        .arg("pip")
        .arg("install")
        .arg("streamlink")
        .current_dir(&env_dir);
    cmd2.creation_flags(0x08000000);

    let streamlink_status = cmd2.status().map_err(|e| e.to_string())?;

    if !streamlink_status.success() {
        return Err("Failed to install Streamlink".into());
    }

    // 5. Download and extract FFmpeg
    emit_progress(&app, "Downloading FFmpeg (this may take a while)...", 80);
    let ffmpeg_bytes = download_file(FFMPEG_URL).await?;
    verify_hash(&ffmpeg_bytes, FFMPEG_SHA256)?;

    emit_progress(&app, "Extracting FFmpeg...", 90);
    extract_ffmpeg(&ffmpeg_bytes, &env_dir)?;

    emit_progress(&app, "Done!", 100);
    Ok(())
}

#[cfg(target_os = "linux")]
#[tauri::command]
pub async fn recording_install_dependencies(app: tauri::AppHandle) -> Result<(), String> {
    let env_dir = get_recording_env_dir(&app)?;
    fs::create_dir_all(&env_dir).map_err(|e| e.to_string())?;

    let result = recording_install_linux_inner(&app, &env_dir).await;

    if result.is_err() {
        let _ = fs::remove_dir_all(&env_dir);
    }

    result
}

#[cfg(target_os = "linux")]
async fn recording_install_linux_inner(
    app: &tauri::AppHandle,
    env_dir: &Path,
) -> Result<(), String> {
    // 1. Download AppImage (includes FFmpeg bundled)
    emit_progress(app, "Downloading Streamlink...", 20);
    let appimage_bytes = download_file(STREAMLINK_APPIMAGE_URL).await?;
    verify_hash(&appimage_bytes, STREAMLINK_APPIMAGE_SHA256)?;

    // 2. Write AppImage to disk and chmod +x
    emit_progress(app, "Extracting Streamlink...", 40);
    let appimage_path = env_dir.join("streamlink.AppImage");
    fs::write(&appimage_path, &appimage_bytes).map_err(|e| e.to_string())?;
    set_executable(&appimage_path)?;

    // 3. Self-extract without FUSE — produces squashfs-root/ inside streamlink/
    let extract_dir = env_dir.join("streamlink");
    fs::create_dir_all(&extract_dir).map_err(|e| e.to_string())?;
    let status = std::process::Command::new(&appimage_path)
        .arg("--appimage-extract")
        .current_dir(&extract_dir)
        .status()
        .map_err(|e| format!("AppImage extract failed: {e}"))?;

    if !status.success() {
        return Err("AppImage self-extraction failed".into());
    }

    // 4. Remove the AppImage file — no longer needed
    let _ = fs::remove_file(&appimage_path);

    emit_progress(app, "Done!", 100);
    Ok(())
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn recording_install_dependencies(app: tauri::AppHandle) -> Result<(), String> {
    let env_dir = get_recording_env_dir(&app)?;
    fs::create_dir_all(&env_dir).map_err(|e| e.to_string())?;

    let result = recording_install_macos_inner(&app, &env_dir).await;

    if result.is_err() {
        let _ = fs::remove_dir_all(&env_dir);
    }

    result
}

#[cfg(target_os = "macos")]
async fn recording_install_macos_inner(
    app: &tauri::AppHandle,
    env_dir: &Path,
) -> Result<(), String> {
    // 1. Download python-build-standalone
    emit_progress(app, "Downloading Python...", 10);
    let python_bytes = download_file(PYTHON_STANDALONE_URL).await?;
    verify_hash(&python_bytes, PYTHON_STANDALONE_SHA256)?;

    // 2. Extract .tar.gz → env_dir/python/
    emit_progress(app, "Extracting Python...", 25);
    let python_dir = env_dir.join("python");
    fs::create_dir_all(&python_dir).map_err(|e| e.to_string())?;
    extract_tar_gz(&python_bytes, &python_dir)?;

    // 3. chmod +x python3
    let python3 = python_dir.join("install").join("bin").join("python3");
    set_executable(&python3)?;

    // 4. pip install streamlink with all transitive dependencies (pinned version)
    emit_progress(app, "Installing Streamlink...", 50);
    let pip_status = std::process::Command::new(&python3)
        .args([
            "-m",
            "pip",
            "install",
            &format!("streamlink=={STREAMLINK_VERSION}"),
        ])
        .current_dir(&python_dir)
        .status()
        .map_err(|e| format!("pip install failed to start: {e}"))?;

    if !pip_status.success() {
        return Err("pip install streamlink failed".into());
    }

    // 5. chmod +x streamlink entry point
    let streamlink_bin = python_dir.join("install").join("bin").join("streamlink");
    set_executable(&streamlink_bin)?;

    // 6. Download FFmpeg
    emit_progress(app, "Downloading FFmpeg...", 70);
    let ffmpeg_bytes = download_file(FFMPEG_URL).await?;
    verify_hash(&ffmpeg_bytes, FFMPEG_SHA256)?;

    // 7. Extract ffmpeg binary from ZIP → env_dir/ffmpeg
    emit_progress(app, "Extracting FFmpeg...", 85);
    extract_ffmpeg_macos(&ffmpeg_bytes, env_dir)?;

    // 8. chmod +x ffmpeg
    let ffmpeg = env_dir.join("ffmpeg");
    set_executable(&ffmpeg)?;

    emit_progress(app, "Done!", 100);
    Ok(())
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_verify_correct_hash() {
        // Arrange
        let bytes = b"multistream";
        // echo -n "multistream" | sha256sum
        let expected = "7c78e1cdcb3be4bdfa973a0a644c613a63fa6154c880be48972f86d9e05079d0";

        // Act
        let result = verify_hash(bytes, expected);

        // Assert
        assert!(result.is_ok());
    }

    #[test]
    fn should_reject_incorrect_hash() {
        // Arrange
        let bytes = b"multistream";
        let incorrect = "63d7e59b20e0ffb304c4b69d80d2edc3fa0ccb87e221b65bb24cf417bfa4ef7d";

        // Act
        let result = verify_hash(bytes, incorrect);

        // Assert
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Hash mismatch"));
    }
}
