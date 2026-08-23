pub(crate) fn extract_base64(data_url: &str) -> Result<&str, &'static str> {
    data_url.split(',').nth(1).ok_or("Invalid data URL format")
}

// invokable function to save a screenshot to the Pictures/Multistream directory
// receives a base64-encoded data URL from the frontend and writes it as a PNG file
#[tauri::command]
pub async fn save_screenshot(data_url: String, filename: String) -> Result<String, String> {
    use std::fs;
    use std::path::PathBuf;

    // extract base64 data from data URL ("data:image/png;base64,AAAA...")
    let base64_data = extract_base64(&data_url)?;

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

#[tauri::command]
pub async fn open_screenshot_folder(app: tauri::AppHandle) -> Result<(), String> {
    use std::path::PathBuf;
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
}
