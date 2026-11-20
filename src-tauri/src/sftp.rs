//! Module SFTP (russh + russh-sftp). Aucun secret n'est écrit sur disque.
use crate::config_dir;
use russh::client::{self, AuthResult};
use russh::keys::{ssh_key::{HashAlg, PublicKey}, PrivateKeyWithHashAlg};
use russh_sftp::{client::SftpSession, protocol::{FileType, OpenFlags}};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::PathBuf, sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex as StdMutex}, time::{Duration, Instant}};
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

fn es<E: std::fmt::Display>(e: E) -> String { e.to_string() }

pub struct Conn { _handle: client::Handle<H>, sftp: Arc<SftpSession> }
#[derive(Default)]
pub struct SftpState(pub tauri::async_runtime::Mutex<HashMap<String, Conn>>);

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
    state.0.lock().await.insert(id.clone(), Conn { _handle: session, sftp: Arc::new(sftp) });
    Ok(home)
}

#[tauri::command]
pub async fn sftp_disconnect(state: State<'_, SftpState>, session: String) -> Result<(), String> { state.0.lock().await.remove(&session); Ok(()) }

#[derive(Serialize)]
pub struct RemoteEntry { name: String, path: String, is_dir: bool, size: u64 }

#[tauri::command]
pub async fn sftp_list(state: State<'_, SftpState>, session: String, path: String) -> Result<Vec<RemoteEntry>, String> {
    let s = conn_sftp(&state, &session).await?;
    let mut out = Vec::new();
    for e in s.read_dir(path.clone()).await.map_err(es)? {
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
pub async fn sftp_read(state: State<'_, SftpState>, session: String, path: String) -> Result<RemoteFile, String> {
    let s = conn_sftp(&state, &session).await?;
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
pub async fn sftp_write(state: State<'_, SftpState>, session: String, path: String, content: String, expected_mtime: Option<u32>, force: bool) -> Result<WriteRes, String> {
    let s = conn_sftp(&state, &session).await?;
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
pub async fn sftp_create_file(state: State<'_, SftpState>, session: String, dir: String, name: String) -> Result<String, String> {
    valid_name(&name)?;
    let s = conn_sftp(&state, &session).await?;
    let path = child(&dir, &name);
    if s.try_exists(path.clone()).await.map_err(es)? { return Err("Ce nom existe déjà".into()); }
    let mut f = s.open_with_flags(path.clone(), OpenFlags::CREATE | OpenFlags::WRITE).await.map_err(es)?;
    f.shutdown().await.map_err(es)?;
    Ok(path)
}

#[tauri::command]
pub async fn sftp_mkdir(state: State<'_, SftpState>, session: String, dir: String, name: String) -> Result<(), String> {
    valid_name(&name)?;
    let s = conn_sftp(&state, &session).await?;
    let path = child(&dir, &name);
    if s.try_exists(path.clone()).await.map_err(es)? { return Err("Ce nom existe déjà".into()); }
    s.create_dir(path).await.map(|_| ()).map_err(es)
}

#[tauri::command]
pub async fn sftp_rename(state: State<'_, SftpState>, session: String, path: String, new_name: String) -> Result<String, String> {
    valid_name(&new_name)?;
    let s = conn_sftp(&state, &session).await?;
    let parent = path.rsplit_once('/').map(|x| x.0).unwrap_or("");
    let dest = format!("{}/{}", parent, new_name);
    if s.try_exists(dest.clone()).await.map_err(es)? { return Err("Ce nom existe déjà".into()); }
    s.rename(path, dest.clone()).await.map(|_| ()).map_err(es)?;
    Ok(dest)
}

/// Supprime un fichier ou un dossier VIDE (jamais de suppression récursive).
#[tauri::command]
pub async fn sftp_remove(state: State<'_, SftpState>, session: String, path: String, is_dir: bool) -> Result<(), String> {
    if path.is_empty() || path == "/" { return Err("Suppression refusée".into()); }
    let s = conn_sftp(&state, &session).await?;
    (if is_dir { s.remove_dir(path).await.map(|_| ()) } else { s.remove_file(path).await.map(|_| ()) })
        .map_err(|e| if is_dir { format!("Impossible de supprimer le dossier (est-il vide ?) : {e}") } else { es(e) })
}

/// Importe les hôtes simples de `~/.ssh/config` (Host, HostName, User, Port, IdentityFile). Les motifs génériques (`*`, `?`) sont ignorés.
#[tauri::command]
pub async fn ssh_config_import() -> Result<Vec<Profile>, String> {
    let home = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).map_err(|_| "Dossier utilisateur introuvable".to_string())?;
    let path = PathBuf::from(&home).join(".ssh").join("config");
    let text = fs::read_to_string(&path).map_err(|e| format!("Fichier {} illisible : {e}", path.display()))?;
    let mut out: Vec<Profile> = Vec::new();
    let mut cur: Option<Profile> = None;
    for line in text.lines() {
        let l = line.trim();
        if l.is_empty() || l.starts_with('#') { continue; }
        let (k, v) = match l.split_once(|c: char| c.is_whitespace() || c == '=') { Some((k, v)) => (k.trim().to_lowercase(), v.trim().trim_matches('"').to_string()), None => continue };
        if k == "host" {
            if let Some(p) = cur.take() { out.push(p); }
            if v.contains('*') || v.contains('?') || v.contains(' ') || v.starts_with('!') { continue; }
            cur = Some(Profile { id: format!("ssh-{v}"), name: v.clone(), host: v, port: 22, user: String::new(), auth: "password".into(), key_path: None });
        } else if let Some(p) = cur.as_mut() {
            match k.as_str() {
                "hostname" => p.host = v,
                "user" => p.user = v,
                "port" => p.port = v.parse().unwrap_or(22),
                "identityfile" => { p.auth = "key".into(); p.key_path = Some(v.replacen('~', &home, 1)); }
                _ => {}
            }
        }
    }
    if let Some(p) = cur { out.push(p); }
    Ok(out.into_iter().filter(|p| !p.user.is_empty() && !p.host.is_empty()).collect())
}

// ───────────── Transferts (fichiers et dossiers) ─────────────
#[derive(Default)]
pub struct TransferState(pub StdMutex<HashMap<String, Arc<AtomicBool>>>);

#[derive(Serialize, Clone)]
struct Progress { id: String, done: u64, total: u64 }

async fn conn_sftp(state: &State<'_, SftpState>, sid: &str) -> Result<Arc<SftpSession>, String> {
    Ok(state.0.lock().await.get(sid).ok_or("Non connecté")?.sftp.clone())
}

/// Envoi vers `<dest>.nexora-part` puis remplacement : un envoi interrompu ne détruit jamais le fichier distant existant.
#[tauri::command]
pub async fn sftp_upload(app: AppHandle, state: State<'_, SftpState>, session: String, tr: State<'_, TransferState>, id: String, local: String, remote: String, overwrite: bool) -> Result<(), String> {
    let sftp = conn_sftp(&state, &session).await?;
    if !overwrite && sftp.try_exists(remote.clone()).await.map_err(es)? { return Err("EXISTS".into()); }
    let flag = Arc::new(AtomicBool::new(false));
    tr.0.lock().map_err(es)?.insert(id.clone(), flag.clone());
    let part = format!("{remote}.nexora-part");
    let res: Result<(), String> = async {
        let mut src = tokio::fs::File::open(&local).await.map_err(es)?;
        let total = src.metadata().await.map_err(es)?.len();
        let mut dst = sftp.open_with_flags(part.clone(), OpenFlags::CREATE | OpenFlags::WRITE | OpenFlags::TRUNCATE).await.map_err(es)?;
        let mut buf = vec![0u8; 32 * 1024];
        let (mut done, mut last) = (0u64, Instant::now());
        loop {
            if flag.load(Ordering::Relaxed) { return Err("CANCELLED".to_string()); }
            let n = src.read(&mut buf).await.map_err(es)?;
            if n == 0 { break; }
            dst.write_all(&buf[..n]).await.map_err(es)?;
            done += n as u64;
            if last.elapsed() >= Duration::from_millis(150) { let _ = app.emit("transfer-progress", Progress { id: id.clone(), done, total }); last = Instant::now(); }
        }
        dst.shutdown().await.map_err(es)?;
        if sftp.try_exists(remote.clone()).await.map_err(es)? { sftp.remove_file(remote.clone()).await.map_err(es)?; }
        sftp.rename(part.clone(), remote.clone()).await.map_err(es)?;
        let _ = app.emit("transfer-progress", Progress { id: id.clone(), done: total, total });
        Ok(())
    }.await;
    if res.is_err() { let _ = sftp.remove_file(part).await; }
    tr.0.lock().map_err(es)?.remove(&id);
    res
}

#[tauri::command]
pub async fn sftp_download(app: AppHandle, state: State<'_, SftpState>, session: String, tr: State<'_, TransferState>, id: String, remote: String, local: String, overwrite: bool) -> Result<(), String> {
    let sftp = conn_sftp(&state, &session).await?;
    if !overwrite && PathBuf::from(&local).exists() { return Err("EXISTS".into()); }
    if let Some(parent) = PathBuf::from(&local).parent() { tokio::fs::create_dir_all(parent).await.map_err(es)?; }
    let flag = Arc::new(AtomicBool::new(false));
    tr.0.lock().map_err(es)?.insert(id.clone(), flag.clone());
    let part = format!("{local}.nexora-part");
    let res: Result<(), String> = async {
        let total = sftp.metadata(remote.clone()).await.map_err(es)?.size.unwrap_or(0);
        let mut src = sftp.open_with_flags(remote.clone(), OpenFlags::READ).await.map_err(es)?;
        let mut dst = tokio::fs::File::create(&part).await.map_err(es)?;
        let mut buf = vec![0u8; 32 * 1024];
        let (mut done, mut last) = (0u64, Instant::now());
        loop {
            if flag.load(Ordering::Relaxed) { return Err("CANCELLED".to_string()); }
            let n = src.read(&mut buf).await.map_err(es)?;
            if n == 0 { break; }
            dst.write_all(&buf[..n]).await.map_err(es)?;
            done += n as u64;
            if last.elapsed() >= Duration::from_millis(150) { let _ = app.emit("transfer-progress", Progress { id: id.clone(), done, total }); last = Instant::now(); }
        }
        dst.flush().await.map_err(es)?;
        drop(dst);
        tokio::fs::rename(&part, &local).await.map_err(es)?;
        let _ = app.emit("transfer-progress", Progress { id: id.clone(), done: total.max(done), total: total.max(done) });
        Ok(())
    }.await;
    if res.is_err() { let _ = tokio::fs::remove_file(&part).await; }
    tr.0.lock().map_err(es)?.remove(&id);
    res
}

#[tauri::command]
pub async fn transfer_cancel(tr: State<'_, TransferState>, id: String) -> Result<(), String> {
    if let Some(f) = tr.0.lock().map_err(es)?.get(&id) { f.store(true, Ordering::Relaxed); }
    Ok(())
}

#[derive(Serialize)]
pub struct LocalFile { rel: String, size: u64 }

/// Liste récursive d'un dossier local choisi par l'utilisateur (liens symboliques ignorés).
#[tauri::command]
pub async fn local_walk(dir: String) -> Result<Vec<LocalFile>, String> {
    let base = PathBuf::from(&dir);
    let (mut out, mut stack) = (Vec::new(), vec![base.clone()]);
    while let Some(d) = stack.pop() {
        for e in fs::read_dir(&d).map_err(es)?.flatten() {
            let ft = match e.file_type() { Ok(t) => t, Err(_) => continue };
            if ft.is_symlink() { continue; }
            let p = e.path();
            if ft.is_dir() { stack.push(p); continue; }
            let rel = p.strip_prefix(&base).map_err(es)?.to_string_lossy().replace('\\', "/");
            out.push(LocalFile { rel, size: e.metadata().map(|m| m.len()).unwrap_or(0) });
            if out.len() > 50_000 { return Err("Dossier trop volumineux (plus de 50 000 fichiers)".into()); }
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn local_mkdir_all(path: String) -> Result<(), String> { fs::create_dir_all(path).map_err(es) }

#[tauri::command]
pub async fn sftp_mkdir_p(state: State<'_, SftpState>, session: String, path: String) -> Result<(), String> {
    let s = conn_sftp(&state, &session).await?;
    let mut cur = String::new();
    for part in path.split('/').filter(|p| !p.is_empty()) {
        cur.push('/'); cur.push_str(part);
        if !s.try_exists(cur.clone()).await.map_err(es)? { s.create_dir(cur.clone()).await.map(|_| ()).map_err(es)?; }
    }
    Ok(())
}
