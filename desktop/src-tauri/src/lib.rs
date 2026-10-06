use std::{fs::OpenOptions, io::Write, path::PathBuf};

#[tauri::command]
fn pick_save_path(default_name: String) -> Option<String> {
    rfd::FileDialog::new()
        .set_file_name(default_name)
        .save_file()
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn write_export_chunk(path: String, chunk: Vec<u8>, first: bool) -> Result<(), String> {
    let path = PathBuf::from(path);
    let mut opts = OpenOptions::new();
    opts.create(true).write(true);
    if first {
        opts.truncate(true);
    } else {
        opts.append(true);
    }

    let mut file = opts.open(&path).map_err(|e| e.to_string())?;
    file.write_all(&chunk).map_err(|e| e.to_string())?;
    file.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Serialize)]
struct QwenResponse {
    status: u16,
    body: String,
}

// This command can only contact the fixed Qwen Space; it is not an open proxy.
#[tauri::command]
async fn qwen_request(path: String, method: String, body: Vec<u8>, content_type: String, token: String) -> Result<QwenResponse, String> {
    let event_id = path.strip_prefix("/call/asr_inference/");
    let allowed = (method == "POST" && (path == "/upload" || path == "/call/asr_inference"))
        || (method == "GET" && event_id.is_some_and(|id| !id.is_empty() && id.len() <= 128 && id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')));
    if !allowed || body.len() > 2 * 1024 * 1024 {
        return Err("Unsupported Qwen request".into());
    }
    if !token.is_empty() && (!token.starts_with("hf_") || !token.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_')) {
        return Err("Invalid HF token format".into());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .redirect(reqwest::redirect::Policy::none())
        .build().map_err(|_| "Cannot initialize network client".to_string())?;
    let url = format!("https://qwen-qwen3-asr-demo.hf.space/gradio_api{}", path);
    let mut request = if method == "POST" { client.post(url).body(body) } else { client.get(url) };
    if !content_type.is_empty() { request = request.header(reqwest::header::CONTENT_TYPE, content_type); }
    if !token.is_empty() { request = request.bearer_auth(token); }
    let response = request.send().await.map_err(|_| "Network connection to Qwen Space failed; check network/proxy".to_string())?;
    let status = response.status().as_u16();
    let body = response.text().await.map_err(|_| "Network error while reading Qwen result".to_string())?;
    Ok(QwenResponse { status, body })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![pick_save_path, write_export_chunk, qwen_request])
        .run(tauri::generate_context!())
        .expect("error while running webCut desktop");
}
