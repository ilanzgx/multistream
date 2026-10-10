use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub static IS_ONLINE: AtomicBool = AtomicBool::new(true);

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn get_http_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .use_rustls_tls()
            .timeout(Duration::from_millis(2000))
            .build()
            .unwrap_or_default()
    })
}

/// Checks internet connectivity using low-overhead TCP connection attempts
/// to Anycast DNS servers, with captive-portal HTTP 204 fallback.
pub async fn check_connectivity() -> bool {
    // 1. Try quick TCP connect to 1.1.1.1:53 (Cloudflare Anycast DNS - ~15ms online, ~1ms offline)
    if let Ok(target_cf) = "1.1.1.1:53".parse::<SocketAddr>() {
        let cf_check = tokio::time::timeout(
            Duration::from_millis(1000),
            tokio::net::TcpStream::connect(target_cf),
        )
        .await;

        if let Ok(Ok(_)) = cf_check {
            return true;
        }
    }

    // 2. Try quick TCP connect to 8.8.8.8:53 (Google Anycast DNS)
    if let Ok(target_google) = "8.8.8.8:53".parse::<SocketAddr>() {
        let google_check = tokio::time::timeout(
            Duration::from_millis(1000),
            tokio::net::TcpStream::connect(target_google),
        )
        .await;

        if let Ok(Ok(_)) = google_check {
            return true;
        }
    }

    // 3. Fallback: standard captive-portal HTTP 204 probe (useful if outbound port 53 is blocked)
    let client = get_http_client();
    if let Ok(resp) = client
        .get("https://www.gstatic.com/generate_204")
        .send()
        .await
    {
        if resp.status().as_u16() == 204 || resp.status().is_success() {
            return true;
        }
    }

    // 4. Secondary fallback: Cloudflare HTTPS (for environments where Google services are blocked)
    if let Ok(resp) = client.head("https://1.1.1.1").send().await {
        if resp.status().is_success() || resp.status().is_redirection() {
            return true;
        }
    }

    false
}

#[tauri::command]
pub async fn check_network_connectivity() -> bool {
    let online = check_connectivity().await;
    IS_ONLINE.store(online, Ordering::Relaxed);
    online
}

/// Spawns a background task checking connectivity every 3 seconds
/// and emitting "network-status-changed" when online/offline state transitions.
pub fn start_network_monitor(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Initial check
        let mut last_status = check_connectivity().await;
        IS_ONLINE.store(last_status, Ordering::Relaxed);

        let mut interval = tokio::time::interval(Duration::from_secs(3));
        // First tick finishes immediately
        interval.tick().await;

        loop {
            interval.tick().await;
            let current_status = check_connectivity().await;
            IS_ONLINE.store(current_status, Ordering::Relaxed);

            if current_status != last_status {
                last_status = current_status;
                let _ = app_handle.emit("network-status-changed", current_status);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_check_connectivity_does_not_panic() {
        let status = check_connectivity().await;
        assert!(status || !status);
    }
}
