use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::window::Color;
use tauri::{Emitter, Manager};

mod models;

mod audio;
use audio::transcriber::TranscriptionState;

mod twitch;
use twitch::commands::{
    twitch_cancel_login, twitch_get_auth_state, twitch_get_connection_state,
    twitch_get_followed_streams, twitch_get_messages, twitch_login, twitch_logout,
    twitch_send_message, twitch_set_channels,
};
use twitch::state::TwitchState;

mod kick;
use kick::commands::{
    kick_cancel_login, kick_get_auth_state, kick_handle_callback, kick_login, kick_logout,
    kick_send_message, kick_set_channels,
};
use kick::state::KickState;

mod recording;
use recording::commands::{
    dismiss_orphan_recording, is_recording, is_recording_supported_cmd, list_recordings,
    open_recording_folder, recover_orphan_recording, scan_orphans, start_recording, stop_recording,
};
use recording::installer::{recording_check_dependencies, recording_install_dependencies};
use recording::RecordingManager;

// fixed port
const LOCALHOST_PORT: u16 = 14831;

// realistic Chrome user-agent to avoid Cloudflare WebView fingerprint detection
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const SCREENSHOT_SCRIPT: &str = include_str!("core/screenshot_capture.js");
const KEYBOARD_SCRIPT: &str = include_str!("core/keyboard_shortcuts.js");

// invokable function to send a native OS notification
// title and body are pre-built by the frontend (with i18n support)
#[tauri::command]
async fn send_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| format!("Notification failed: {}", e))?;

    Ok(())
}

// invokable function to save a screenshot to the Pictures/Multistream directory
// receives a base64-encoded data URL from the frontend and writes it as a PNG file
#[tauri::command]
async fn save_screenshot(data_url: String, filename: String) -> Result<String, String> {
    use std::fs;
    use std::path::PathBuf;

    // extract base64 data from data URL ("data:image/png;base64,AAAA...")
    let base64_data = data_url
        .split(',')
        .nth(1)
        .ok_or("Invalid data URL format")?;

    // decode base64 into raw bytes
    use base64::Engine;
    let image_data = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| format!("Failed to decode image: {}", e))?;

    // resolve save directory: ~/Pictures/Multistream/
    let pictures_dir = dirs::picture_dir().unwrap_or_else(|| PathBuf::from("."));

    let save_dir = pictures_dir.join("Multistream");
    fs::create_dir_all(&save_dir).map_err(|e| format!("Failed to create directory: {}", e))?;

    let file_path = save_dir.join(&filename);
    fs::write(&file_path, &image_data).map_err(|e| format!("Failed to save screenshot: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

const CORE_ENGINE: &str = include_str!("core/player_engine.bin");
const METRICS: &str = include_str!("core/metrics.bin");

// this works on Windows, Linux and maybe macOS
// dont touch this, unless you know what you are doing
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 1. Initialize universal core plugins
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build());

    // 2. Conditionally inject desktop-only plugins mid-chain
    // This prevents compilation errors if the project targets mobile platforms later
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();

                let mut deep_links = Vec::new();
                for arg in args {
                    if arg.starts_with("multistream://") {
                        deep_links.push(arg.clone());
                    }
                }
                if !deep_links.is_empty() {
                    let _ = app.emit("deep-link://new-url", deep_links);
                }
            }
        }));
    }

    // 3. Chain the remaining cross-platform plugins and bind IPC commands
    builder
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_localhost::Builder::new(LOCALHOST_PORT).build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            send_notification,
            save_screenshot,
            audio::transcriber::is_transcription_supported,
            audio::transcriber::download_whisper_model,
            audio::transcriber::cancel_whisper_download,
            audio::transcriber::delete_whisper_model,
            audio::transcriber::get_transcription_status,
            audio::transcriber::start_transcription,
            audio::transcriber::stop_transcription,
            audio::transcriber::set_chunk_duration,
            twitch_login,
            twitch_cancel_login,
            twitch_logout,
            twitch_get_auth_state,
            twitch_set_channels,
            twitch_get_messages,
            twitch_get_connection_state,
            twitch_send_message,
            kick_login,
            kick_cancel_login,
            kick_handle_callback,
            kick_logout,
            kick_get_auth_state,
            kick_send_message,
            kick_set_channels,
            twitch_get_followed_streams,
            start_recording,
            stop_recording,
            is_recording,
            list_recordings,
            open_recording_folder,
            recover_orphan_recording,
            dismiss_orphan_recording,
            is_recording_supported_cmd,
            recording_check_dependencies,
            recording_install_dependencies,
            scan_orphans,
        ])
        .setup(move |app| {
            app.manage(TranscriptionState(std::sync::Mutex::new(None)));
            app.manage(RecordingManager::new());
            let twitch_state = TwitchState::new();
            app.manage(twitch_state);
            let state = app.state::<TwitchState>();
            if let Some(stored_auth) = twitch::commands::init_stored_auth(app.handle()) {
                *state.auth.try_lock().expect("lock on startup") = Some(stored_auth.clone());

                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let Ok(http) = reqwest::Client::builder().use_rustls_tls().build() else {
                        return;
                    };
                    let state = app_handle.state::<TwitchState>();

                    let validate_resp = http
                        .get("https://id.twitch.tv/oauth2/validate")
                        .bearer_auth(&stored_auth.access_token)
                        .send()
                        .await;

                    match validate_resp {
                        Ok(resp) if resp.status().is_success() => {
                            // Valid
                        }
                        Ok(_) => {
                            match twitch::oauth::refresh_token(&http, &stored_auth.refresh_token)
                                .await
                            {
                                Ok(refreshed) => {
                                    let _ = twitch::oauth::store_auth(&app_handle, &refreshed);
                                    *state.auth.lock().await = Some(refreshed);
                                }
                                Err(twitch::error::TwitchError::TokenRefreshFailed) => {
                                    *state.auth.lock().await = None;
                                    twitch::oauth::clear_auth(&app_handle);
                                    use twitch::state::AuthState;
                                    let _ = app_handle.emit("twitch-auth-expired", ());
                                    let _ = app_handle.emit(
                                        "twitch-auth-changed",
                                        AuthState {
                                            authenticated: false,
                                            username: None,
                                        },
                                    );
                                }
                                Err(_) => {
                                    // Network error during refresh - preserve credentials
                                }
                            }
                        }
                        Err(_) => {
                            // Network error - do not clear credentials
                        }
                    }
                });
            }

            let kick_state = KickState::new();
            app.manage(kick_state);
            let state = app.state::<KickState>();
            if let Some(stored_auth) = kick::commands::init_stored_auth() {
                *state.auth.try_lock().expect("lock on startup") = Some(stored_auth.clone());

                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let Ok(http) = reqwest::Client::builder().use_rustls_tls().build() else {
                        return;
                    };
                    let state = app_handle.state::<KickState>();

                    let user_resp = http
                        .get("https://api.kick.com/public/v1/users")
                        .bearer_auth(&stored_auth.access_token)
                        .send()
                        .await;

                    match user_resp {
                        Ok(resp) if resp.status().is_success() => {
                            // Valid
                        }
                        Ok(_) => {
                            match kick::oauth::refresh_token(&http, &stored_auth.refresh_token)
                                .await
                            {
                                Ok(refreshed) => {
                                    let _ = kick::oauth::store_auth(&refreshed);
                                    *state.auth.lock().await = Some(refreshed);
                                }
                                Err(kick::error::KickError::TokenRefreshFailed) => {
                                    *state.auth.lock().await = None;
                                    kick::oauth::clear_auth();
                                    let _ = app_handle.emit(
                                        "kick-auth-changed",
                                        kick::state::KickAuthState {
                                            authenticated: false,
                                            username: None,
                                        },
                                    );
                                }
                                Err(_) => {
                                    // Network error during refresh - preserve credentials
                                }
                            }
                        }
                        Err(_) => {}
                    }
                });
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // resolve url
            let url = if cfg!(debug_assertions) {
                tauri::WebviewUrl::External("http://localhost:5173".parse().unwrap())
            } else {
                tauri::WebviewUrl::External(
                    format!("http://localhost:{}", LOCALHOST_PORT)
                        .parse()
                        .unwrap(),
                )
            };

            let player_injector = format!("eval(atob('{}'));", CORE_ENGINE);
            let metrics_injector = format!("eval(atob('{}'));", METRICS);
            let graveyard_script = r#"
                window.addEventListener('message', (e) => {
                    if (e.data?.type === 'MULTISTREAM_GRAVEYARD_SUSPEND') {
                        // Aggressive graveyard mode
                        window.__isGraveyard = true;

                        // 1. Destroy ability to play any media
                        HTMLMediaElement.prototype.play = function() {
                            return Promise.reject(new Error("Graveyard mode"));
                        };

                        // 2. Silence and pause currently playing media
                        const silenceMedia = (v) => {
                            if (v.tagName === 'VIDEO' || v.tagName === 'AUDIO') {
                                v.muted = true;
                                v.volume = 0;
                                v.pause();
                                v.removeAttribute('autoplay');
                            }
                        };

                        document.querySelectorAll('video, audio').forEach(silenceMedia);

                        // 3. Destroy future AudioContexts
                        if (window.AudioContext || window.webkitAudioContext) {
                            const AC = window.AudioContext || window.webkitAudioContext;
                            AC.prototype.createGain = function() {
                                // Create a native gain node, but lock it at 0
                                const gain = new AC().createGain();
                                gain.gain.value = 0;
                                Object.defineProperty(gain.gain, 'value', { get: () => 0, set: () => {} });
                                return gain;
                            };
                        }

                        // 4. Watch the DOM to choke any video that spawns late
                        const observer = new MutationObserver((mutations) => {
                            mutations.forEach(m => {
                                m.addedNodes.forEach(n => {
                                    if (n.tagName === 'VIDEO' || n.tagName === 'AUDIO') silenceMedia(n);
                                    if (n.querySelectorAll) n.querySelectorAll('video, audio').forEach(silenceMedia);
                                });
                            });
                        });
                        observer.observe(document.documentElement, { childList: true, subtree: true });
                    }
                });
            "#;

            // create the window manually so can set user_agent
            // And inject scripts to global window
            tauri::WebviewWindowBuilder::new(app, "main", url)
                .title("Multistream")
                .inner_size(1280.0, 720.0)
                .resizable(true)
                .fullscreen(false)
                .maximized(true)
                .background_color(Color(31, 34, 39, 255))
                .user_agent(USER_AGENT)
                .additional_browser_args(
                    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection \
                     --disable-background-timer-throttling \
                     --disable-backgrounding-occluded-windows \
                     --disable-renderer-backgrounding \
                     --autoplay-policy=no-user-gesture-required",
                )
                .initialization_script_for_all_frames(&player_injector)
                .initialization_script_for_all_frames(&metrics_injector)
                .initialization_script_for_all_frames(graveyard_script)
                .initialization_script_for_all_frames(SCREENSHOT_SCRIPT)
                .initialization_script_for_all_frames(KEYBOARD_SCRIPT)
                .build()?;

            // system tray
            let show_i = MenuItem::with_id(app, "show", "Show Multistream", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            fn show_main_window(app: &tauri::AppHandle) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }

            // create system tray
            let mut tray_builder = TrayIconBuilder::new();
            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }
            tray_builder
                .tooltip("Multistream")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "quit" => {
                        let app_clone = app.clone();
                        tauri::async_runtime::block_on(async move {
                            recording::commands::shutdown_all_recordings(&app_clone).await;
                        });
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if window.app_handle().webview_windows().is_empty() {
                    let app = window.app_handle().clone();
                    tauri::async_runtime::block_on(async move {
                        recording::commands::shutdown_all_recordings(&app).await;
                    });
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
