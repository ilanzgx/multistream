use tauri::Manager;
use tauri::tray::TrayIconBuilder;
use tauri::menu::{Menu, MenuItem};

// fixed port
const LOCALHOST_PORT: u16 = 14831;

// realistic Chrome user-agent to avoid Cloudflare WebView fingerprint detection
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// invokable function to send live notification to the user
// called by the frontend when a stream goes live
#[tauri::command]
async fn send_live_notification(
    app: tauri::AppHandle,
    channel: String,
    platform: String,
    title: String,
    category: String,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    let body = if !title.is_empty() && !category.is_empty() {
        format!("{} • {}", title, category)
    } else if !title.is_empty() {
        title
    } else {
        format!("{} on {}", channel, platform)
    };

    app.notification()
        .builder()
        .title(format!("🔴 {} is live!", channel))
        .body(body)
        .show()
        .map_err(|e| format!("Notification failed: {}", e))?;

    Ok(())
}

// this works on Windows, Linux and maybe macOS
// dont touch this, unless you know what you are doing
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // load plugin_single_instance
    #[cfg(desktop)] {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }));
    }

    // load plugin_http, plugin_updater, plugin_process, plugin_localhost, plugin_notification
    builder
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_localhost::Builder::new(LOCALHOST_PORT).build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![send_live_notification])
        .setup(move |app| {
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

            // create the window manually so can set user_agent
            tauri::WebviewWindowBuilder::new(app, "main", url)
                .title("Multistream")
                .inner_size(1280.0, 720.0)
                .resizable(true)
                .fullscreen(false)
                .maximized(true)
                .user_agent(USER_AGENT)
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
                    "quit" => app.exit(0),
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}