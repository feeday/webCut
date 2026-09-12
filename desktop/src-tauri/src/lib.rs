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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![pick_save_path, write_export_chunk])
        .run(tauri::generate_context!())
        .expect("error while running webCut desktop");
}
