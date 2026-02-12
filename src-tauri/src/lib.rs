use tauri::Manager;

// fixed port
const LOCALHOST_PORT: u16 = 14831;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            } else {
                // redirect to localhost only in production
                let main_window = app.get_webview_window("main").unwrap();
                main_window
                    .eval(format!(
                        "window.location.replace('http://localhost:{}')",
                        LOCALHOST_PORT
                    ))
                    .unwrap();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
