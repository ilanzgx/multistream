use tauri::Manager;

// fixed port
const LOCALHOST_PORT: u16 = 14831;

// realistic Chrome user-agent to avoid Cloudflare WebView fingerprint detection
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// this works on Windows, Linux and macOS
// dont touch this code, dont change it unless you know what you are doing
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

    // load plugin_http, plugin_updater, plugin_process, plugin_localhost
    builder
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_localhost::Builder::new(LOCALHOST_PORT).build())
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

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}