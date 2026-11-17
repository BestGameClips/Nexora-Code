//! Module SFTP (russh + russh-sftp). Aucun secret n'est écrit sur disque.
use crate::config_dir;
use russh::client::{self, AuthResult};
use russh::keys::{ssh_key::{HashAlg, PublicKey}, PrivateKeyWithHashAlg};
use russh_sftp::{client::SftpSession, protocol::{FileType, OpenFlags}};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::PathBuf, sync::{Arc, Mutex as StdMutex}, time::Duration};
use tauri::{AppHandle, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

fn es<E: std::fmt::Display>(e: E) -> String { e.to_string() }

pub struct Conn { _handle: client::Handle<H>, sftp: SftpSession }
pub struct SftpState(pub tauri::async_runtime::Mutex<Option<Conn>>);

#[derive(Serialize, Deserialize, Clone)]
pub struct Profile { id: String, name: String, host: String, port: u16, user: String, auth: String, #[serde(default)] key_path: Option<String> }

fn file(app: &AppHandle, name: &str) -> Result<PathBuf, String> { Ok(config_dir(app)?.join(name)) }
fn read_json<T: serde::de::DeserializeOwned + Default>(p: &PathBuf) -> T {
    fs::read_to_string(p).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}
fn write_json<T: Serialize>(p: &PathBuf, v: &T) -> Result<(), String> {
    fs::create_dir_all(p.parent().ok_or("Chemin invalide")?).map_err(es)?;
    let tmp = p.with_extension("tmp");
    fs::write(&tmp, serde_json::to_string_pretty(v).map_err(es)?).map_err(es)?;
    fs::rename(&tmp, p).map_err(es)
}

#[tauri::command]
pub async fn profiles_list(app: AppHandle) -> Result<Vec<Profile>, String> { Ok(read_json(&file(&app, "profiles.json")?)) }

#[tauri::command]
pub async fn profile_save(app: AppHandle, profile: Profile) -> Result<(), String> {
    if profile.host.trim().is_empty() || profile.user.trim().is_empty() || profile.port == 0 { return Err("Hôte, utilisateur et port sont obligatoires".into()); }
    let p = file(&app, "profiles.json")?;
    let mut v: Vec<Profile> = read_json(&p);
    match v.iter_mut().find(|x| x.id == profile.id) { Some(x) => *x = profile, None => v.push(profile) }
    write_json(&p, &v)
}

#[tauri::command]
pub async fn profile_delete(app: AppHandle, id: String) -> Result<(), String> {
    let p = file(&app, "profiles.json")?;
    let mut v: Vec<Profile> = read_json(&p);
    v.retain(|x| x.id != id);
    write_json(&p, &v)
}

/// Oublie l'empreinte mémorisée d'un profil (après réinstallation légitime du serveur).
#[tauri::command]
pub async fn host_forget(app: AppHandle, id: String) -> Result<(), String> {
    let profiles: Vec<Profile> = read_json(&file(&app, "profiles.json")?);
    let p = profiles.into_iter().find(|x| x.id == id).ok_or("Profil introuvable")?;
    let hp = file(&app, "known_hosts.json")?;
    let mut hosts: HashMap<String, String> = read_json(&hp);
    hosts.remove(&format!("{}:{}", p.host, p.port));
    write_json(&hp, &hosts)
}

/// Vérification de l'hôte : l'empreinte est comparée à `known_hosts.json`, jamais acceptée en silence.
struct H { known: Option<String>, trust: Option<String>, seen: Arc<StdMutex<Option<String>>> }
impl client::Handler for H {
    type Error = russh::Error;
    async fn check_server_key(&mut self, key: &PublicKey) -> Result<bool, Self::Error> {
        let fp = key.fingerprint(HashAlg::Sha256).to_string();
        if let Ok(mut g) = self.seen.lock() { *g = Some(fp.clone()); }
        Ok(match (&self.known, &self.trust) { (Some(k), _) => *k == fp, (None, Some(t)) => *t == fp, _ => false })
    }
}

#[tauri::command]
pub async fn sftp_connect(app: AppHandle, state: State<'_, SftpState>, id: String, secret: Option<String>, trust: Option<String>) -> Result<String, String> {
    let profiles: Vec<Profile> = read_json(&file(&app, "profiles.json")?);
    let p = profiles.into_iter().find(|x| x.id == id).ok_or("Profil introuvable")?;
    let hp = file(&app, "known_hosts.json")?;
    let mut hosts: HashMap<String, String> = read_json(&hp);
    let hk = format!("{}:{}", p.host, p.port);
    let seen = Arc::new(StdMutex::new(None::<String>));
    let handler = H { known: hosts.get(&hk).cloned(), trust: trust.clone(), seen: seen.clone() };
    let config = Arc::new(client::Config { inactivity_timeout: None, keepalive_interval: Some(Duration::from_secs(30)), ..Default::default() });
    let mut session = match client::connect(config, (p.host.as_str(), p.port), handler).await {
        Ok(s) => s,
        Err(e) => {
            let fp = seen.lock().ok().and_then(|g| g.clone());
            return Err(match (hosts.get(&hk), fp) {
                (Some(old), Some(f)) if *old != f => format!("HOST_KEY_CHANGED|{old}|{f}"),
                (None, Some(f)) if trust.as_deref() != Some(f.as_str()) => format!("UNKNOWN_HOST|{f}"),
                _ => format!("Connexion impossible : {e}"),
            });
        }
    };
    let res = (if p.auth == "key" {
        let kp = p.key_path.clone().ok_or("Chemin de la clé privée manquant")?;
        let key = russh::keys::load_secret_key(&kp, secret.as_deref().filter(|s| !s.is_empty())).map_err(|e| format!("Clé illisible : {e}"))?;
        session.authenticate_publickey(&p.user, PrivateKeyWithHashAlg::new(Arc::new(key), None)).await
    } else {
        session.authenticate_password(&p.user, secret.unwrap_or_default()).await
    }).map_err(|e| format!("Authentification impossible : {e}"))?;
    if !matches!(res, AuthResult::Success) { return Err("AUTH_FAILED".into()); }
    if !hosts.contains_key(&hk) {
        if let Some(f) = seen.lock().ok().and_then(|g| g.clone()) { hosts.insert(hk, f); write_json(&hp, &hosts)?; }
    }
    let ch = session.channel_open_session().await.map_err(es)?;
    ch.request_subsystem(true, "sftp").await.map_err(es)?;
    let sftp = SftpSession::new(ch.into_stream()).await.map_err(es)?;
    let home = sftp.canonicalize(".").await.map_err(es)?;
    *state.0.lock().await = Some(Conn { _handle: session, sftp });
    Ok(home)
}

#[tauri::command]
pub async fn sftp_disconnect(state: State<'_, SftpState>) -> Result<(), String> { *state.0.lock().await = None; Ok(()) }

#[derive(Serialize)]
pub struct RemoteEntry { name: String, path: String, is_dir: bool, size: u64 }

#[tauri::command]
pub async fn sftp_list(state: State<'_, SftpState>, path: String) -> Result<Vec<RemoteEntry>, String> {
    let g = state.0.lock().await; let c = g.as_ref().ok_or("Non connecté")?;
    let mut out = Vec::new();
    for e in c.sftp.read_dir(path.clone()).await.map_err(es)? {
        let name = e.file_name();
        if name == "." || name == ".." { continue; }
        let m = e.metadata();
        out.push(RemoteEntry { path: format!("{}/{}", path.trim_end_matches('/'), name), is_dir: matches!(m.file_type(), FileType::Dir), size: m.size.unwrap_or(0), name });
    }
    Ok(out)
}

#[derive(Serialize)]
pub struct RemoteFile { content: String, size: u64, mtime: Option<u32> }

#[tauri::command]
pub async fn sftp_read(state: State<'_, SftpState>, path: String) -> Result<RemoteFile, String> {
    let g = state.0.lock().await; let s = &g.as_ref().ok_or("Non connecté")?.sftp;
    let m = s.metadata(path.clone()).await.map_err(es)?;
    let size = m.size.unwrap_or(0);
    if size > 5_000_000 { return Err("Fichier trop volumineux (> 5 Mo)".into()); }
    let mut f = s.open_with_flags(path, OpenFlags::READ).await.map_err(es)?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf).await.map_err(es)?;
    let content = String::from_utf8(buf).map_err(|_| "Fichier non texte (UTF-8 requis)".to_string())?;
    Ok(RemoteFile { content, size, mtime: m.mtime })
}

#[derive(Serialize)]
pub struct WriteRes { mtime: Option<u32> }

/// Écriture en place (les permissions du fichier sont conservées). Refuse d'écraser un fichier modifié sur le serveur sauf `force`.
#[tauri::command]
pub async fn sftp_write(state: State<'_, SftpState>, path: String, content: String, expected_mtime: Option<u32>, force: bool) -> Result<WriteRes, String> {
    let g = state.0.lock().await; let s = &g.as_ref().ok_or("Non connecté")?.sftp;
    if !force && expected_mtime.is_some() && s.metadata(path.clone()).await.map_err(es)?.mtime != expected_mtime { return Err("CONFLICT".into()); }
    let mut f = s.open_with_flags(path.clone(), OpenFlags::WRITE | OpenFlags::TRUNCATE).await.map_err(es)?;
    f.write_all(content.as_bytes()).await.map_err(es)?;
    f.shutdown().await.map_err(es)?;
    Ok(WriteRes { mtime: s.metadata(path).await.map_err(es)?.mtime })
}

fn valid_name(n: &str) -> Result<(), String> {
    if n.is_empty() || n == "." || n == ".." || n.contains('/') || n.contains('\0') { Err("Nom invalide".into()) } else { Ok(()) }
}
fn child(dir: &str, name: &str) -> String { format!("{}/{}", dir.trim_end_matches('/'), name) }

/// Les créations et renommages refusent d'écraser un nom existant.
#[tauri::command]
pub async fn sftp_create_file(state: State<'_, SftpState>, dir: String, name: String) -> Result<String, String> {
    valid_name(&name)?;
    let g = state.0.lock().await; let s = &g.as_ref().ok_or("Non connecté")?.sftp;
    let path = child(&dir, &name);
    if s.try_exists(path.clone()).await.map_err(es)? { return Err("Ce nom existe déjà".into()); }
    let mut f = s.open_with_flags(path.clone(), OpenFlags::CREATE | OpenFlags::WRITE).await.map_err(es)?;
    f.shutdown().await.map_err(es)?;
    Ok(path)
}

#[tauri::command]
pub async fn sftp_mkdir(state: State<'_, SftpState>, dir: String, name: String) -> Result<(), String> {
    valid_name(&name)?;
    let g = state.0.lock().await; let s = &g.as_ref().ok_or("Non connecté")?.sftp;
    let path = child(&dir, &name);
    if s.try_exists(path.clone()).await.map_err(es)? { return Err("Ce nom existe déjà".into()); }
    s.create_dir(path).await.map(|_| ()).map_err(es)
}

#[tauri::command]
pub async fn sftp_rename(state: State<'_, SftpState>, path: String, new_name: String) -> Result<String, String> {
    valid_name(&new_name)?;
    let g = state.0.lock().await; let s = &g.as_ref().ok_or("Non connecté")?.sftp;
    let parent = path.rsplit_once('/').map(|x| x.0).unwrap_or("");
    let dest = format!("{}/{}", parent, new_name);
    if s.try_exists(dest.clone()).await.map_err(es)? { return Err("Ce nom existe déjà".into()); }
    s.rename(path, dest.clone()).await.map(|_| ()).map_err(es)?;
    Ok(dest)
}

/// Supprime un fichier ou un dossier VIDE (jamais de suppression récursive).
#[tauri::command]
pub async fn sftp_remove(state: State<'_, SftpState>, path: String, is_dir: bool) -> Result<(), String> {
    if path.is_empty() || path == "/" { return Err("Suppression refusée".into()); }
    let g = state.0.lock().await; let s = &g.as_ref().ok_or("Non connecté")?.sftp;
    (if is_dir { s.remove_dir(path).await.map(|_| ()) } else { s.remove_file(path).await.map(|_| ()) })
        .map_err(|e| if is_dir { format!("Impossible de supprimer le dossier (est-il vide ?) : {e}") } else { es(e) })
}
