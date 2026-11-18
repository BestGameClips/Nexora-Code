#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{fs, io::ErrorKind, path::PathBuf};
use serde::Serialize;
use std::sync::Mutex;
mod discord;
mod sftp;
use tauri::{Manager, State};

struct Root(Mutex<Option<PathBuf>>);
#[derive(Serialize)]
struct Entry { name: String, path: String, is_dir: bool }

fn clean(p: &std::path::Path) -> String { let s = p.to_string_lossy().to_string(); s.strip_prefix(r"\\?\").map(str::to_string).unwrap_or(s) }

/// Refuse tout chemin hors du dossier ouvert (anti-traversée, liens symboliques résolus).
fn check(state: &State<'_, Root>, p: &str) -> Result<PathBuf, String> {
    let root = state.0.lock().map_err(|e| e.to_string())?.clone().ok_or("Aucun dossier ouvert")?;
    let full = fs::canonicalize(p).map_err(|e| format!("Chemin invalide : {e}"))?;
    if full.starts_with(&root) { Ok(full) } else { Err("Accès refusé : en dehors du dossier ouvert".into()) }
}

#[tauri::command]
async fn set_root(state: State<'_, Root>, path: String) -> Result<(), String> {
    let c = fs::canonicalize(&path).map_err(|e| e.to_string())?;
    if !c.is_dir() { return Err("Ce n'est pas un dossier".into()); }
    *state.0.lock().map_err(|e| e.to_string())? = Some(c); Ok(())
}

#[tauri::command]
async fn list_dir(state: State<'_, Root>, path: String) -> Result<Vec<Entry>, String> {
    let dir = check(&state, &path)?;
    let mut out = Vec::new();
    for e in fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
        out.push(Entry { name: e.file_name().to_string_lossy().to_string(), path: clean(&e.path()), is_dir });
    }
    Ok(out)
}

#[tauri::command]
async fn read_file(state: State<'_, Root>, path: String) -> Result<String, String> {
    let f = check(&state, &path)?;
    if fs::metadata(&f).map_err(|e| e.to_string())?.len() > 5_000_000 { return Err("Fichier trop volumineux (> 5 Mo)".into()); }
    String::from_utf8(fs::read(&f).map_err(|e| e.to_string())?).map_err(|_| "Fichier non texte (UTF-8 requis)".to_string())
}

/// Écriture atomique : fichier temporaire voisin puis renommage.
#[tauri::command]
async fn write_file(state: State<'_, Root>, path: String, content: String) -> Result<(), String> {
    let f = check(&state, &path)?;
    let mut tmp = f.clone().into_os_string(); tmp.push(".rustide-tmp");
    let tmp = PathBuf::from(tmp);
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &f).map_err(|e| { let _ = fs::remove_file(&tmp); e.to_string() })
}

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

#[tauri::command]
async fn create_file(state: State<'_, Root>, dir: String, name: String) -> Result<String, String> {
    let d = check(&state, &dir)?;
    if name.is_empty() || name == "." || name == ".." || name.contains(|c: char| matches!(c, '/' | '\\' | ':')) { return Err("Nom de fichier invalide".into()); }
    let p = d.join(&name);
    fs::OpenOptions::new().write(true).create_new(true).open(&p)
        .map_err(|e| if e.kind() == ErrorKind::AlreadyExists { "Ce fichier existe déjà".to_string() } else { e.to_string() })?;
    Ok(clean(&p))
}

fn valid_name(n: &str) -> Result<(), String> {
    if n.is_empty() || n == "." || n == ".." || n.contains(|c: char| matches!(c, '/' | '\\' | ':' | '\0')) { Err("Nom invalide".into()) } else { Ok(()) }
}

#[tauri::command]
async fn fs_mkdir(state: State<'_, Root>, dir: String, name: String) -> Result<(), String> {
    valid_name(&name)?;
    let d = check(&state, &dir)?;
    fs::create_dir(d.join(&name)).map_err(|e| if e.kind() == ErrorKind::AlreadyExists { "Ce nom existe déjà".to_string() } else { e.to_string() })
}

#[tauri::command]
async fn fs_rename(state: State<'_, Root>, path: String, new_name: String) -> Result<String, String> {
    valid_name(&new_name)?;
    let p = check(&state, &path)?;
    let dest = p.parent().ok_or("Chemin invalide")?.join(&new_name);
    if dest.exists() { return Err("Ce nom existe déjà".into()); }
    fs::rename(&p, &dest).map_err(|e| e.to_string())?;
    Ok(clean(&dest))
}

/// Met à la corbeille (récupérable) ; le dossier racine ouvert ne peut pas être supprimé.
#[tauri::command]
async fn fs_trash(state: State<'_, Root>, path: String) -> Result<(), String> {
    let p = check(&state, &path)?;
    if state.0.lock().map_err(|e| e.to_string())?.as_ref() == Some(&p) { return Err("Impossible de supprimer le dossier ouvert".into()); }
    trash::delete(&p).map_err(|e| e.to_string())
}

#[cfg(windows)]
fn reveal(p: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    std::process::Command::new("explorer").raw_arg(format!("/select,\"{}\"", p)).spawn().map(|_| ()).map_err(|e| e.to_string())
}
#[cfg(not(windows))]
fn reveal(_: &str) -> Result<(), String> { Err("Disponible uniquement sous Windows".into()) }

#[tauri::command]
async fn fs_reveal(state: State<'_, Root>, path: String) -> Result<(), String> { reveal(&clean(&check(&state, &path)?)) }

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Root(Mutex::new(None)))
        .manage(discord::DiscordState(Mutex::new(None)))
        .manage(sftp::SftpState(tauri::async_runtime::Mutex::new(None)))
        .setup(|_app| {
            #[cfg(windows)]
            if let Some(w) = _app.get_webview_window("main") {
                // Échoue silencieusement sous Windows 10 : le CSS reste opaque par défaut.
                let _ = window_vibrancy::apply_mica(&w, None);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![load_settings, save_settings, set_root, list_dir, read_file, write_file, create_file, sftp::profiles_list, sftp::profile_save, sftp::profile_delete, sftp::host_forget, sftp::sftp_connect, sftp::sftp_disconnect, sftp::sftp_list, sftp::sftp_read, sftp::sftp_write, fs_mkdir, fs_rename, fs_trash, fs_reveal, sftp::ssh_config_import, sftp::sftp_create_file, sftp::sftp_mkdir, sftp::sftp_rename, sftp::sftp_remove, discord::discord_connect, discord::discord_update, discord::discord_disconnect])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application");
}
