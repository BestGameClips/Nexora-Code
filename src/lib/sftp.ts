import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./settings";
import { _ } from "./translate";
import { log } from "./log";
import { toast } from "./toast";

export interface Profile { id: string; name: string; host: string; port: number; user: string; auth: "password" | "key"; key_path?: string | null; }
export interface Sel { path: string; name: string; is_dir: boolean; }
/** Une session = une connexion SFTP ouverte (identifiée par l'id du profil). Le secret reste en mémoire uniquement. */
export interface Session { id: string; name: string; home: string; cwd: string | null; sel: Sel | null; secret?: string; }
export interface SftpStore {
  profiles: Profile[]; sessions: Record<string, Session>; order: string[]; active: string | null;
  connected: { id: string; name: string; home: string } | null; cwd: string | null; sel: Sel | null; // dérivés de la session active
  busy: string | null; error: string | null; changedFor: string | null; trust: { id: string; secret?: string; fp: string } | null;
  tick: number; ask: { title: string; initial: string; run: (name: string) => Promise<void> } | null; reveal: { sid: string; path: string; n: number } | null; notice: string | null;
}
const derive = (s: SftpStore): SftpStore => { const a = s.active ? s.sessions[s.active] : undefined; return { ...s, connected: a ? { id: a.id, name: a.name, home: a.home } : null, cwd: a?.cwd ?? null, sel: a?.sel ?? null }; };
let st: SftpStore = derive({ profiles: [], sessions: {}, order: [], active: null, connected: null, cwd: null, sel: null, busy: null, error: null, changedFor: null, trust: null, tick: 0, ask: null, reveal: null, notice: null });
const subs = new Set<() => void>();
const set = (p: Partial<SftpStore>) => { st = derive({ ...st, ...p }); subs.forEach((f) => f()); };
export const getSftp = () => st;
export const subscribeSftp = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const cancelTrust = () => set({ trust: null });
export const dismissSftpError = () => set({ error: null, changedFor: null, notice: null });
export const refreshTree = () => set({ tick: st.tick + 1 });
export const askName = (title: string, initial: string, run: (name: string) => Promise<void>) => set({ ask: { title, initial, run } });
export const closeAsk = () => set({ ask: null });
const patchSession = (sid: string, p: Partial<Session>) => { if (st.sessions[sid]) set({ active: sid, sessions: { ...st.sessions, [sid]: { ...st.sessions[sid], ...p } } }); };
export const setCwd = (cwd: string, sid: string) => patchSession(sid, { cwd });
export const setSel = (sel: Sel, sid: string) => patchSession(sid, { sel });
export const setReveal = (sid: string, path: string) => set({ reveal: { sid, path, n: Date.now() } });

export async function loadProfiles() { if (!inTauri) return; try { set({ profiles: await invoke<Profile[]>("profiles_list") }); } catch (e) { set({ error: String(e) }); } }
export async function saveProfile(profile: Profile) { try { await invoke("profile_save", { profile }); await loadProfiles(); return true; } catch (e) { set({ error: String(e) }); return false; } }
export async function deleteProfile(id: string) { if (st.sessions[id]) await disconnect(id); try { await invoke("profile_delete", { id }); await loadProfiles(); } catch (e) { set({ error: String(e) }); } }
export async function forgetHost(id: string) {
  try { await invoke("host_forget", { id }); set({ error: "Empreinte oubliée. Vous pouvez vous reconnecter et vérifier la nouvelle empreinte.", changedFor: null }); } catch (e) { set({ error: String(e) }); }
}
function drop(sid: string, extra: Partial<SftpStore> = {}) {
  const { [sid]: gone, ...rest } = st.sessions; void gone;
  const order = st.order.filter((x) => x !== sid);
  set({ sessions: rest, order, active: st.active === sid ? order[order.length - 1] ?? null : st.active, ...extra });
}
export async function connect(id: string, secret?: string, trust?: string) {
  const prof = st.profiles.find((p) => p.id === id); if (!prof) return;
  if (st.sessions[id]) return set({ active: id });
  set({ busy: id, error: null, changedFor: null, trust: null });
  try {
    const home = await invoke<string>("sftp_connect", { id, secret: secret ?? null, trust: trust ?? null });
    set({ sessions: { ...st.sessions, [id]: { id, name: prof.name, home, cwd: null, sel: null, secret } }, order: [...st.order, id], active: id, busy: null });
    const m = _("Connecté à {name}", { name: prof.name }); log("info", m); toast("success", m);
  } catch (e) {
    const m = String(e);
    if (m.startsWith("UNKNOWN_HOST|")) set({ busy: null, trust: { id, secret, fp: m.split("|")[1] } });
    else if (m.startsWith("HOST_KEY_CHANGED|")) { const [, o, n] = m.split("|"); set({ busy: null, changedFor: id, error: `ATTENTION : l’empreinte du serveur a changé (connue : ${o} ; reçue : ${n}). Connexion bloquée : cela peut indiquer une interception. Si le serveur a été réinstallé, vous pouvez oublier l’ancienne empreinte.` }); }
    else if (m === "AUTH_FAILED") set({ busy: null, error: "Authentification refusée (identifiants incorrects)." });
    else { set({ busy: null, error: m }); log("error", m); }
  }
}
export async function disconnect(sid?: string) {
  const id = sid ?? st.active; if (!id) return;
  const name = st.sessions[id]?.name ?? id;
  try { await invoke("sftp_disconnect", { session: id }); } catch { /* déjà fermé */ }
  drop(id); const m = _("Déconnecté de {name}", { name }); log("info", m); toast("info", m);
}
export async function importSshConfig() {
  try {
    const found = await invoke<Profile[]>("ssh_config_import");
    const have = new Set(st.profiles.map((p) => p.id)), fresh = found.filter((p) => !have.has(p.id));
    for (const p of fresh) await invoke("profile_save", { profile: p });
    await loadProfiles();
    const m = fresh.length ? _("{n} profil(s) importé(s) depuis ~/.ssh/config", { n: fresh.length }) : _("Aucun nouveau profil à importer.");
    set({ error: null, notice: m }); toast(fresh.length ? "success" : "info", m);
  } catch (e) { set({ error: String(e) }); }
}

// Reconnexion automatique par session ; le secret reste uniquement en mémoire.
const NET = /closed|reset|broken|timed? ?out|connection|eof|disconnect|non connecté|channel/i;
async function reconnect(sid: string): Promise<boolean> {
  const s = st.sessions[sid]; if (!s) return false;
  set({ busy: sid });
  try { await invoke("sftp_connect", { id: sid, secret: s.secret ?? null, trust: null }); set({ busy: null }); log("info", _("Reconnecté à {name}", { name: s.name })); return true; }
  catch (e) { drop(sid, { busy: null, error: `Connexion perdue, reconnexion impossible : ${e}` }); log("error", String(e)); return false; }
}
export async function withReconnect<T>(fn: () => Promise<T>, sid?: string): Promise<T> {
  try { return await fn(); }
  catch (e) { const id = sid ?? st.active; if (!id || !st.sessions[id] || !NET.test(String(e)) || !(await reconnect(id))) throw e; return await fn(); }
}
/** Exécute une opération distante en affichant l'erreur ; renvoie undefined en cas d'échec. */
export async function run<T>(fn: () => Promise<T>, sid?: string): Promise<T | undefined> {
  try { return await withReconnect(fn, sid); } catch (e) { set({ error: String(e) }); log("error", String(e)); return undefined; }
}
/** Pour les commandes sans valeur de retour : true si réussi. */
export const attempt = async (fn: () => Promise<unknown>, sid?: string) => (await run(async () => { await fn(); return true; }, sid)) === true;
