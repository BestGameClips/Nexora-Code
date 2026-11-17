//! Discord Rich Presence via IPC local (tube nommé sous Windows). Aucune donnée ne passe par un serveur tiers.
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use serde::Deserialize;
use std::sync::Mutex;
use tauri::State;

pub struct DiscordState(pub Mutex<Option<DiscordIpcClient>>);

#[derive(Deserialize)]
pub struct PresencePayload { details: String, state: String, large_image: String, small_image: Option<String>, small_text: Option<String>, start: Option<i64> }

#[tauri::command]
pub async fn discord_connect(state: State<'_, DiscordState>, client_id: String) -> Result<(), String> {
    if client_id.is_empty() || client_id.len() > 24 || !client_id.chars().all(|c| c.is_ascii_digit()) {
        return Err("Identifiant d'application Discord invalide (chiffres uniquement)".into());
    }
    let mut g = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut old) = g.take() { let _ = old.close(); }
    let mut c = DiscordIpcClient::new(&client_id);
    c.connect().map_err(|e| format!("Discord introuvable (l'application Discord est-elle ouverte ?) : {e}"))?;
    *g = Some(c);
    Ok(())
}

#[tauri::command]
pub async fn discord_update(state: State<'_, DiscordState>, p: PresencePayload) -> Result<(), String> {
    let mut g = state.0.lock().map_err(|e| e.to_string())?;
    let c = g.as_mut().ok_or("Non connecté à Discord")?;
    let mut a = activity::Activity::new().details(&p.details);
    if !p.state.is_empty() { a = a.state(&p.state); }
    let mut assets = activity::Assets::new().large_image(&p.large_image).large_text("Nexora Code");
    if let Some(s) = &p.small_image { assets = assets.small_image(s).small_text(p.small_text.as_deref().unwrap_or(s)); }
    a = a.assets(assets);
    if let Some(t) = p.start { a = a.timestamps(activity::Timestamps::new().start(t)); }
    let res = c.set_activity(a);
    match res {
        Ok(()) => Ok(()),
        Err(e) => { *g = None; Err(format!("Envoi à Discord impossible : {e}")) }
    }
}

#[tauri::command]
pub async fn discord_disconnect(state: State<'_, DiscordState>) -> Result<(), String> {
    let mut g = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut c) = g.take() { let _ = c.clear_activity(); let _ = c.close(); }
    Ok(())
}
