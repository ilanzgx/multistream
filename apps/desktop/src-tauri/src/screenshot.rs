use std::fs;
use std::path::{Path, PathBuf};
use tauri::ipc::{InvokeBody, Request};

pub(crate) fn extract_base64(data_url: &str) -> Result<&str, &'static str> {
    data_url.split(',').nth(1).ok_or("Invalid data URL format")
}

pub(crate) fn sanitize_filename(filename: &str) -> Result<&str, String> {
    Path::new(filename)
        .file_name()
        .and_then(|f| f.to_str())
        .filter(|f| !f.is_empty())
        .ok_or_else(|| "Invalid filename".to_string())
}

#[tauri::command]
pub async fn save_screenshot(request: Request<'_>) -> Result<String, String> {
    let (bytes, raw_filename): (Vec<u8>, String) = match request.body() {
        InvokeBody::Raw(raw_bytes) => {
            let filename_header = request
                .headers()
                .get("x-filename")
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| "Missing x-filename header".to_string())?;

            let decoded_filename = urlencoding::decode(filename_header)
                .map_err(|e| format!("Failed to decode filename: {}", e))?
                .into_owned();

            (raw_bytes.to_vec(), decoded_filename)
        }
        InvokeBody::Json(json_val) => {
            #[derive(serde::Deserialize)]
            struct ScreenshotPayload {
                #[serde(alias = "data_url")]
                data_url: Option<String>,
                #[serde(alias = "dataUrl")]
                data_url_camel: Option<String>,
                filename: String,
            }

            let payload: ScreenshotPayload = serde_json::from_value(json_val.clone())
                .map_err(|e| format!("Invalid screenshot payload: {}", e))?;

            let data_url = payload
                .data_url
                .or(payload.data_url_camel)
                .ok_or_else(|| "Missing data_url in payload".to_string())?;

            let base64_data = extract_base64(&data_url)?;

            use base64::Engine;
            let decoded = base64::engine::general_purpose::STANDARD
                .decode(base64_data)
                .map_err(|e| format!("Failed to decode image: {}", e))?;

            (decoded, payload.filename)
        }
    };

    let safe_name = sanitize_filename(&raw_filename)?;

    let pictures_dir = dirs::picture_dir().unwrap_or_else(|| PathBuf::from("."));
    let save_dir = pictures_dir.join("Multistream");
    fs::create_dir_all(&save_dir).map_err(|e| format!("Failed to create directory: {}", e))?;

    let file_path = save_dir.join(safe_name);
    fs::write(&file_path, &bytes).map_err(|e| format!("Failed to save screenshot: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn open_screenshot_folder(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    let pictures_dir = dirs::picture_dir().unwrap_or_else(|| PathBuf::from("."));
    let save_dir = pictures_dir.join("Multistream");

    if save_dir.exists() {
        app.opener()
            .open_path(save_dir.to_string_lossy().to_string(), None::<String>)
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_extract_base64_from_valid_data_url() {
        // Arrange
        let valid_url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE";

        // Act
        let result = extract_base64(valid_url);

        // Assert
        assert_eq!(result, Ok("iVBORw0KGgoAAAANSUhEUgAAAAE"));
    }

    #[test]
    fn should_reject_invalid_data_url_without_comma() {
        // Arrange
        let invalid_url = "not_a_data_url_just_base64_AAAA";

        // Act
        let result = extract_base64(invalid_url);

        // Assert
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Invalid data URL format");
    }

    #[test]
    fn should_handle_empty_base64_string_after_comma() {
        // Arrange
        let empty_base64_url = "data:image/png;base64,";

        // Act
        let result = extract_base64(empty_base64_url);

        // Assert
        assert_eq!(result, Ok(""));
    }

    #[test]
    fn should_sanitize_filename_preventing_path_traversal() {
        // Arrange
        let malicious_filename = "../../etc/evil.png";

        // Act
        let sanitized = sanitize_filename(malicious_filename);

        // Assert
        assert_eq!(sanitized, Ok("evil.png"));
    }

    #[test]
    fn should_reject_empty_filename() {
        // Arrange
        let empty_filename = "";

        // Act
        let result = sanitize_filename(empty_filename);

        // Assert
        assert!(result.is_err());
    }
}
