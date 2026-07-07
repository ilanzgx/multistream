use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Emitter};
use std::io::Cursor;
use zip::ZipArchive;

const PYTHON_URL: &str = "https://www.python.org/ftp/python/3.11.8/python-3.11.8-embed-amd64.zip";
const GET_PIP_URL: &str = "https://bootstrap.pypa.io/get-pip.py";
const FFMPEG_URL: &str = "https://github.com/GyanD/codexffmpeg/releases/download/7.1/ffmpeg-7.1-essentials_build.zip";

const PYTHON_SHA256: &str = "6347068ca56bf4dd6319f7ef5695f5a03f1ade3e9aa2d6a095ab27faa77a1290";
const GET_PIP_SHA256: &str = "a341e1a43e38001c551a1508a73ff23636a11970b61d901d9a1cad2a18f57055";
const FFMPEG_SHA256: &str = "fa7d4d7e795db0e2503f49f105f46ed5852386f0cfdd819899be3b65ebde24fc";

fn verify_hash(bytes: &[u8], expected_hash: &str) -> Result<(), String> {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let result = hasher.finalize();
    let hex_result = format!("{:x}", result);
    if hex_result != expected_hash {
        return Err(format!("Hash mismatch. Expected {}, got {}", expected_hash, hex_result));
    }
    Ok(())
}

#[derive(Clone, serde::Serialize)]
struct InstallProgress {
    step: String,
    progress: u8,
}

fn emit_progress(app: &AppHandle, step: &str, progress: u8) {
    let _ = app.emit("recording-install-progress", InstallProgress {
        step: step.to_string(),
        progress,
    });
}

pub fn get_recording_env_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))
        .map(|p| p.join("recording_env"))
}

pub fn get_python_exe(app: &AppHandle) -> Result<PathBuf, String> {
    get_recording_env_dir(app).map(|p| p.join("python.exe"))
}

pub fn get_ffmpeg_exe(app: &AppHandle) -> Result<PathBuf, String> {
    get_recording_env_dir(app).map(|p| p.join("ffmpeg.exe"))
}

#[tauri::command]
pub async fn recording_check_dependencies(app: tauri::AppHandle) -> Result<bool, String> {
    let env_dir = get_recording_env_dir(&app)?;
    let python_exe = env_dir.join("python.exe");
    let ffmpeg_exe = env_dir.join("ffmpeg.exe");
    let streamlink_exe = env_dir.join("Scripts").join("streamlink.exe");

    Ok(python_exe.exists() && ffmpeg_exe.exists() && streamlink_exe.exists())
}

async fn download_file(url: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::new();
    let response = client.get(url).send().await.map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        return Err(format!("Failed to download from {}", url));
    }
    
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    Ok(bytes.to_vec())
}

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
        let content = fs::read_to_string(&pth_path).map_err(|e| format!("Failed to read _pth: {e}"))?;
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
    
    #[cfg(target_os = "windows")]
    use std::os::windows::process::CommandExt;
    
    let mut cmd = std::process::Command::new(&python_exe);
    cmd.arg(&get_pip_path).current_dir(&env_dir);
    
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    
    let pip_status = cmd.status().map_err(|e| e.to_string())?;
        
    if !pip_status.success() {
        return Err("Failed to install pip".into());
    }

    // 4. Install Streamlink
    emit_progress(&app, "Installing Streamlink...", 70);
    let mut cmd2 = std::process::Command::new(&python_exe);
    cmd2.arg("-m").arg("pip").arg("install").arg("streamlink").current_dir(&env_dir);
    
    #[cfg(target_os = "windows")]
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
