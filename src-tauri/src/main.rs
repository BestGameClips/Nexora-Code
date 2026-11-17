#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{fs, io::ErrorKind, path::PathBuf};
use tauri::Manager;

/// Mode portable : si `portable.flag` est à côté de l'exe, les données vont dans `data/`.
fn config_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(dir) = std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.to_path_buf())) {
        if dir.join("portable.flag").exists() { return Ok(dir.join("data")); }
    }
    app.path().app_config_dir().map_err(|e| e.to_string())
}

#[tauri::command]
fn load_settings(app: tauri::AppHandle) -> Result<Option<String>, String> {
    match fs::read_to_string(config_dir(&app)?.join("settings.json")) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn save_settings(app: tauri::AppHandle, json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json).map_err(|e| format!("JSON invalide : {e}"))?;
    let dir = config_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let (file, tmp, bak) = (dir.join("settings.json"), dir.join("settings.json.tmp"), dir.join("settings.json.bak"));
    if file.exists() { let _ = fs::copy(&file, &bak); }
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &file).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .setup(|_app| {
            #[cfg(windows)]
            if let Some(w) = _app.get_webview_window("main") {
                // Échoue silencieusement sous Windows 10 : le CSS reste opaque par défaut.
                let _ = window_vibrancy::apply_mica(&w, None);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![load_settings, save_settings])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application");
}
