import { invoke } from "@tauri-apps/api/core";
import { getSettings, subscribe, inTauri } from "./settings";
import { getDocs, subscribeDocs, basename, getCursor, subscribeCursor } from "./docs";
import { getSftp, subscribeSftp } from "./sftp";
import { extOn } from "./extensions";
import { buildPresence } from "./presence";

export interface DiscordStatus { state: "off" | "connecting" | "connected" | "error"; message: string; }
let status: DiscordStatus = { state: "off", message: "Désactivé" };
const subs = new Set<() => void>();
const setStatus = (state: DiscordStatus["state"], message: string) => { if (status.state === state && status.message === message) return; status = { state, message }; subs.forEach((f) => f()); };
export const getDiscord = () => status;
export const subscribeDiscord = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

const MIN_GAP = 15000; // Discord limite la fréquence des mises à jour
const RETRY = 20000;
const startedAt = Math.floor(Date.now() / 1000);
let connected = false, busy = false, timer: number | undefined, lastSent = 0, lastKey = "";
const schedule = (ms: number) => { window.clearTimeout(timer); timer = window.setTimeout(tick, Math.max(ms, 200)); };

async function tick() {
  if (busy) return schedule(500);
  busy = true;
  try {
    const s = getSettings(), d = s.discord;
    if (!(inTauri && d.enabled && d.clientId && extOn("discord"))) {
      if (connected) { connected = false; await invoke("discord_disconnect").catch(() => {}); }
      return setStatus("off", d.enabled ? "En attente (identifiant manquant ou extension désactivée)" : "Désactivé");
    }
    if (!connected) {
      setStatus("connecting", "Connexion à Discord…");
      try { await invoke("discord_connect", { clientId: d.clientId }); connected = true; lastKey = ""; }
      catch (e) { setStatus("error", String(e)); return schedule(RETRY); }
    }
    const docs = getDocs(), f = getSftp();
    const p = buildPresence(s, docs.active ? basename(docs.active) : null, getCursor()?.lang ?? null, docs.root ? basename(docs.root) : f.connected?.name ?? null);
    const payload = { details: p.details, state: p.state, large_image: p.largeImage, small_image: p.smallImage, small_text: p.smallImage, start: p.showElapsed ? startedAt : null };
    const key = JSON.stringify(payload);
    if (key === lastKey) return setStatus("connected", "Connecté à Discord");
    const wait = MIN_GAP - (Date.now() - lastSent);
    if (wait > 0) { setStatus("connected", "Connecté à Discord"); return schedule(wait + 50); }
    try { await invoke("discord_update", { p: payload }); lastKey = key; lastSent = Date.now(); setStatus("connected", "Connecté à Discord"); }
    catch (e) { connected = false; setStatus("error", String(e)); schedule(RETRY); }
  } finally { busy = false; }
}

/** À appeler une fois : suit les réglages, le fichier actif et le langage, sans jamais bloquer l'interface. */
export function startDiscordSync() {
  const on = () => schedule(400);
  subscribe(on); subscribeDocs(on); subscribeCursor(on); subscribeSftp(on);
  on();
}
