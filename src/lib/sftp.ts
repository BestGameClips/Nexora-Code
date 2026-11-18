import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./settings";
import { _ } from "./translate";

export interface Profile { id: string; name: string; host: string; port: number; user: string; auth: "password" | "key"; key_path?: string | null; }
export interface SftpStore { profiles: Profile[]; connected: { id: string; name: string; home: string } | null; busy: boolean; error: string | null; changedFor: string | null; trust: { id: string; secret?: string; fp: string } | null; tick: number; ask: { title: string; initial: string; run: (name: string) => Promise<void> } | null; lastConn: { id: string; secret?: string } | null; cwd: string | null; reveal: { path: string; n: number } | null; notice: string | null; }
let st: SftpStore = { profiles: [], connected: null, busy: false, error: null, changedFor: null, trust: null, tick: 0, ask: null, lastConn: null, cwd: null, reveal: null, notice: null };
const subs = new Set<() => void>();
const set = (p: Partial<SftpStore>) => { st = { ...st, ...p }; subs.forEach((f) => f()); };
export const getSftp = () => st;
export const subscribeSftp = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const cancelTrust = () => set({ trust: null });
export const dismissSftpError = () => set({ error: null, changedFor: null, notice: null });

export async function loadProfiles() {
  if (!inTauri) return;
  try { set({ profiles: await invoke<Profile[]>("profiles_list") }); } catch (e) { set({ error: String(e) }); }
}
export async function saveProfile(profile: Profile) {
  try { await invoke("profile_save", { profile }); await loadProfiles(); return true; } catch (e) { set({ error: String(e) }); return false; }
}
export async function deleteProfile(id: string) {
  try { await invoke("profile_delete", { id }); await loadProfiles(); } catch (e) { set({ error: String(e) }); }
}
export async function forgetHost(id: string) {
  try { await invoke("host_forget", { id }); set({ error: "Empreinte oubliée. Vous pouvez vous reconnecter et vérifier la nouvelle empreinte.", changedFor: null }); } catch (e) { set({ error: String(e) }); }
}
export async function connect(id: string, secret?: string, trust?: string) {
  const prof = st.profiles.find((p) => p.id === id); if (!prof) return;
  set({ busy: true, error: null, changedFor: null, trust: null });
  try {
    const home = await invoke<string>("sftp_connect", { id, secret: secret ?? null, trust: trust ?? null });
    set({ connected: { id, name: prof.name, home }, busy: false, lastConn: { id, secret } });
  } catch (e) {
    const m = String(e);
    if (m.startsWith("UNKNOWN_HOST|")) set({ busy: false, trust: { id, secret, fp: m.split("|")[1] } });
    else if (m.startsWith("HOST_KEY_CHANGED|")) { const [, o, n] = m.split("|"); set({ busy: false, changedFor: id, error: `ATTENTION : l’empreinte du serveur a changé (connue : ${o} ; reçue : ${n}). Connexion bloquée : cela peut indiquer une interception. Si le serveur a été réinstallé, vous pouvez oublier l’ancienne empreinte.` }); }
    else if (m === "AUTH_FAILED") set({ busy: false, error: "Authentification refusée (identifiants incorrects)." });
    else set({ busy: false, error: m });
  }
}
export async function disconnect() { try { await invoke("sftp_disconnect"); } catch { /* déjà fermé */ } set({ connected: null, lastConn: null, cwd: null }); }

export const refreshTree = () => set({ tick: st.tick + 1 });
export const askName = (title: string, initial: string, run: (name: string) => Promise<void>) => set({ ask: { title, initial, run } });
export const closeAsk = () => set({ ask: null });

// Reconnexion automatique : le secret reste uniquement en mémoire (jamais sur disque).
const NET = /closed|reset|broken|timed? ?out|connection|eof|disconnect|non connecté|channel/i;
async function reconnect(): Promise<boolean> {
  const l = st.lastConn; if (!l) return false;
  set({ busy: true });
  try { await invoke("sftp_connect", { id: l.id, secret: l.secret ?? null, trust: null }); set({ busy: false }); return true; }
  catch (e) { set({ busy: false, connected: null, lastConn: null, error: `Connexion perdue, reconnexion impossible : ${e}` }); return false; }
}
export async function withReconnect<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (e) { if (!st.lastConn || !NET.test(String(e)) || !(await reconnect())) throw e; return await fn(); }
}
/** Exécute une opération distante en affichant l'erreur dans le panneau SFTP. */
export async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try { return await withReconnect(fn); } catch (e) { set({ error: String(e) }); return undefined; }
}

export const setCwd = (cwd: string) => set({ cwd });
export const setReveal = (path: string) => set({ reveal: { path, n: Date.now() } });
export async function importSshConfig() {
  try {
    const found = await invoke<Profile[]>("ssh_config_import");
    const have = new Set(st.profiles.map((p) => p.id)), fresh = found.filter((p) => !have.has(p.id));
    for (const p of fresh) await invoke("profile_save", { profile: p });
    await loadProfiles();
    set({ error: null, notice: fresh.length ? _("{n} profil(s) importé(s) depuis ~/.ssh/config", { n: fresh.length }) : _("Aucun nouveau profil à importer.") });
  } catch (e) { set({ error: String(e) }); }
}
