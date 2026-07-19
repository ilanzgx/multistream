#[tauri::command]
#[allow(unused_variables, unused_imports)]
pub async fn send_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
    avatar_url: Option<String>,
    watch_text: Option<String>,
    ignore_text: Option<String>,
    channel: Option<String>,
    platform: Option<String>,
) -> Result<(), String> {
    use std::path::PathBuf;
    use tauri::{Emitter, Manager};

    let mut icon_path: Option<PathBuf> = None;

    if let Some(url) = avatar_url {
        if let Ok(cache_dir) = app.path().app_cache_dir() {
            let avatars_dir = cache_dir.join("avatars");
            let _ = tokio::fs::create_dir_all(&avatars_dir).await;

            if let (Some(plat), Some(chan)) = (&platform, &channel) {
                let safe_plat: String = plat.chars().filter(|c| c.is_alphanumeric()).collect();
                let safe_chan: String = chan.chars().filter(|c| c.is_alphanumeric()).collect();

                let filename = format!("{}_{}.jpg", safe_plat, safe_chan);
                let filepath = avatars_dir.join(filename);

                if !filepath.exists() {
                    if let Ok(resp) = reqwest::get(&url).await {
                        if let Ok(bytes) = resp.bytes().await {
                            let _ = tokio::fs::write(&filepath, bytes).await;
                        }
                    }
                }

                if filepath.exists() {
                    icon_path = Some(filepath);
                }
            }
        }
    }

    let app_clone = app.clone();
    let channel_clone = channel.clone();
    let platform_clone = platform.clone();

    #[cfg(target_os = "linux")]
    {
        use notify_rust::{Hint, Notification};

        let mut notification = Notification::new();
        notification.summary(&title).body(&body);
        notification.hint(Hint::SuppressSound(true));

        if let Some(path) = &icon_path {
            if let Some(path_str) = path.to_str() {
                notification.icon(path_str);
            }
        }

        if let (Some(watch), Some(ign)) = (watch_text, ignore_text) {
            notification.action("watch", &watch);
            notification.action("ignore", &ign);
        }

        std::thread::spawn(move || match notification.show() {
            Ok(handle) => {
                handle.wait_for_action(move |action| {
                    if action == "watch" {
                        if let Some(window) = app_clone.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        if let (Some(chan), Some(plat)) = (channel_clone, platform_clone) {
                            #[derive(serde::Serialize, Clone)]
                            struct OpenStreamPayload {
                                channel: String,
                                platform: String,
                            }
                            let _ = app_clone.emit(
                                "notification-watch",
                                OpenStreamPayload {
                                    channel: chan,
                                    platform: plat,
                                },
                            );
                        }
                    }
                });
            }
            Err(e) => {
                log::error!("Failed to show notification: {}", e);
            }
        });
    }

    #[cfg(target_os = "macos")]
    {
        use notify_rust::{Hint, Notification};

        let mut notification = Notification::new();
        notification.summary(&title).body(&body);
        notification.hint(Hint::SuppressSound(true));

        if let Some(path) = &icon_path {
            if let Some(path_str) = path.to_str() {
                notification.icon(path_str);
            }
        }

        if let Err(e) = notification.show() {
            log::error!("Failed to show notification on macOS: {}", e);
        }
    }

    #[cfg(target_os = "windows")]
    {
        use tauri_winrt_notification::{IconCrop, Toast};

        let mut toast = Toast::new(Toast::POWERSHELL_APP_ID)
            .title(&title)
            .text1(&body)
            .sound(None);

        if let Some(path) = &icon_path {
            toast = toast.icon(path, IconCrop::Circular, "avatar");
        }

        if let (Some(watch), Some(ign)) = (watch_text, ignore_text) {
            toast = toast.add_button(&watch, "watch").add_button(&ign, "ignore");
        }

        if let Err(e) = toast
            .on_activated(move |action| {
                if let Some(action_id) = action {
                    if action_id == "watch" {
                        if let Some(window) = app_clone.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        if let (Some(chan), Some(plat)) = (&channel_clone, &platform_clone) {
                            #[derive(serde::Serialize, Clone)]
                            struct OpenStreamPayload {
                                channel: String,
                                platform: String,
                            }
                            let _ = app_clone.emit(
                                "notification-watch",
                                OpenStreamPayload {
                                    channel: chan.clone(),
                                    platform: plat.clone(),
                                },
                            );
                        }
                    }
                }
                Ok(())
            })
            .show()
        {
            log::error!("Failed to show notification on Windows: {:?}", e);
        }
    }

    Ok(())
}
