use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=build.rs");

    let env_path = Path::new(".env");
    if env_path.exists() {
        println!("cargo:rerun-if-changed=.env");
        if let Ok(contents) = fs::read_to_string(env_path) {
            for line in contents.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                if let Some((key, val)) = line.split_once('=') {
                    println!("cargo:rustc-env={}={}", key.trim(), val.trim());
                }
            }
        }
    }

    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_arch = env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default();
    let target = env::var("TARGET").unwrap_or_default();

    let out_dir = Path::new("binaries");
    let _ = fs::create_dir_all(out_dir);

    if target_os == "windows" && target_arch == "x86_64" {
        let bin_name = "whisper-cli-x86_64-pc-windows-msvc.exe";
        let bin_path = out_dir.join(bin_name);

        let is_empty = fs::metadata(&bin_path)
            .map(|m| m.len() == 0)
            .unwrap_or(true);

        if is_empty {
            println!("cargo:warning=Downloading whisper.cpp precompiled binary for Windows x64...");

            let url = "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.6/whisper-bin-x64.zip";
            let zip_path = out_dir.join("whisper-temp.zip");
            let temp_extract = out_dir.join("whisper_temp_ext");

            let status = Command::new("curl")
                .args(["-L", "-o", zip_path.to_str().unwrap(), url])
                .status()
                .expect("Failed to execute curl");

            if status.success() {
                let _ = fs::create_dir_all(&temp_extract);
                let status = Command::new("tar")
                    .current_dir(out_dir)
                    .args(["-xf", "whisper-temp.zip", "-C", "whisper_temp_ext"])
                    .status()
                    .expect("Failed to execute tar");

                if status.success() {
                    // Find whisper-cli.exe and .dlls
                    let mut found_exe = false;
                    for entry in walkdir::WalkDir::new(&temp_extract)
                        .into_iter()
                        .filter_map(|e| e.ok())
                    {
                        let file_name = entry.file_name().to_string_lossy();
                        if file_name == "whisper-cli.exe" {
                            fs::rename(entry.path(), &bin_path)
                                .expect("Failed to move whisper-cli.exe");
                            found_exe = true;
                        } else if file_name.ends_with(".dll") {
                            let dest = out_dir.join(file_name.as_ref());
                            fs::rename(entry.path(), &dest).expect("Failed to move dll file");
                        }
                    }

                    if !found_exe || !bin_path.exists() {
                        panic!("whisper-cli.exe was not found in the downloaded archive.");
                    }
                } else {
                    panic!("Failed to extract whisper.cpp archive");
                }

                let _ = fs::remove_file(zip_path);
                let _ = fs::remove_dir_all(temp_extract);
            } else {
                panic!("Failed to download whisper.cpp archive");
            }
        }
    } else {
        // Create a dummy file for unsupported platforms so tauri_build doesn't fail
        let bin_name = if target_os == "windows" {
            format!("whisper-cli-{}.exe", target)
        } else {
            format!("whisper-cli-{}", target)
        };
        let bin_path = out_dir.join(bin_name);
        if !bin_path.exists() {
            let _ = fs::File::create(bin_path);
        }

        // Create a dummy DLL so that `binaries/*.dll` resource glob doesn't fail
        let dummy_dll = out_dir.join("dummy.dll");
        if !dummy_dll.exists() {
            let _ = fs::File::create(dummy_dll);
        }
    }

    tauri_build::build();
}
