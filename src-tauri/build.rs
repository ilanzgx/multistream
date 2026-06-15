use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=build.rs");

    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_arch = env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default();

    if target_os == "windows" && target_arch == "x86_64" {
        let out_dir = Path::new("binaries");
        let _ = fs::create_dir_all(out_dir);

        let bin_name = "whisper-cli-x86_64-pc-windows-msvc.exe";
        let bin_path = out_dir.join(bin_name);

        let is_empty = fs::metadata(&bin_path).map(|m| m.len() == 0).unwrap_or(true);

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
                    for entry in walkdir::WalkDir::new(&temp_extract).into_iter().filter_map(|e| e.ok()) {
                        let file_name = entry.file_name().to_string_lossy();
                        if file_name == "whisper-cli.exe" {
                            let _ = fs::rename(entry.path(), &bin_path);
                        } else if file_name.ends_with(".dll") {
                            let dest = out_dir.join(file_name.as_ref());
                            let _ = fs::rename(entry.path(), &dest);
                        }
                    }
                }
                
                let _ = fs::remove_file(zip_path);
                let _ = fs::remove_dir_all(temp_extract);
            }
        }
    }

    tauri_build::build();
}
