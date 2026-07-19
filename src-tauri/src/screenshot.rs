// invokable function to save a screenshot to the Pictures/Multistream directory
// receives a base64-encoded data URL from the frontend and writes it as a PNG file
#[tauri::command]
pub async fn save_screenshot(data_url: String, filename: String) -> Result<String, String> {
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
