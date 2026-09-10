// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    std::panic::set_hook(Box::new(|panic_info| {
        log::error!("CRITICAL UNHANDLED PANIC: {panic_info}");
        eprintln!("Unhandled panic: {panic_info}");
    }));

    #[cfg(target_os = "linux")]
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");

    app_lib::run();
}
