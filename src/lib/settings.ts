import { THEMES } from "./themes";
import { invoke } from "@tauri-apps/api/core";
export type Mode = "system" | "light" | "dark";
export interface Settings { version: 1; mode: Mode; fontSize: number; mica: boolean; language: "fr" | "en"; onboarded: boolean; showWelcome: boolean; iconPack: "badges" | "minimal" | "none"; mdPreview: boolean; extensions: Record<string, boolean>; wsExt: Record<string, Record<string, boolean>>; discord: { enabled: boolean; showFile: boolean; showProject: boolean; showLanguage: boolean; showTime: boolean; text: string; clientId: string }; darkTheme: string; lightTheme: string; lineNumbers: boolean; minimap: boolean; wordWrap: boolean; rounded: boolean; radius: number; sidebarWidth: number; panelHeight: number; sidebarVisible: boolean; panelVisible: boolean; }
export const defaults: Settings = { version: 1, mode: "system", fontSize: 14, mica: false, language: "fr", onboarded: false, showWelcome: true, iconPack: "badges", mdPreview: false, extensions: { icons: true, markdown: true, discord: false }, wsExt: {}, discord: { enabled: false, showFile: false, showProject: false, showLanguage: true, showTime: true, text: "", clientId: "" }, darkTheme: "obsidian", lightTheme: "arctic-light", lineNumbers: true, minimap: true, wordWrap: false, rounded: true, radius: 8, sidebarWidth: 260, panelHeight: 180, sidebarVisible: true, panelVisible: true };
export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
let state: Settings = defaults;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const getSettings = () => state;
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
function sanitize(p: Partial<Settings>): Settings {
  const m = { ...defaults, ...p, version: 1 as const };
  if (!["system", "light", "dark"].includes(m.mode)) m.mode = "system";
  m.fontSize = clamp(Number(m.fontSize) || 14, 10, 24);
  if (!THEMES.some((t) => t.id === m.darkTheme && t.base === "dark")) m.darkTheme = "obsidian";
  if (!THEMES.some((t) => t.id === m.lightTheme && t.base === "light")) m.lightTheme = "arctic-light";
  if (m.language !== "fr" && m.language !== "en") m.language = "fr";
  if (!["badges", "minimal", "none"].includes(m.iconPack)) m.iconPack = "badges";
  m.extensions = { ...defaults.extensions, ...(m.extensions ?? {}) };
  m.wsExt = m.wsExt ?? {};
  m.discord = { ...defaults.discord, ...(m.discord ?? {}) }; m.discord.text = String(m.discord.text).slice(0, 64); m.discord.clientId = String(m.discord.clientId ?? "").replace(/\D/g, "").slice(0, 24);
  m.radius = clamp(Number(m.radius) || 0, 0, 20);
  m.sidebarWidth = clamp(Number(m.sidebarWidth) || 260, 160, 600);
  m.panelHeight = clamp(Number(m.panelHeight) || 180, 80, 600);
  return m;
}
export async function loadSettings() {
  try {
    const raw = inTauri ? await invoke<string | null>("load_settings") : localStorage.getItem("rustide.settings");
    if (raw) state = sanitize(JSON.parse(raw));
  } catch (e) { console.error("Lecture des paramètres impossible, valeurs par défaut utilisées", e); }
  emit();
}
let timer: number | undefined;
export function update(patch: Partial<Settings>) {
  state = sanitize({ ...state, ...patch });
  emit();
  window.clearTimeout(timer);
  timer = window.setTimeout(persist, 300);
}
async function persist() {
  const json = JSON.stringify(state, null, 2);
  try { if (inTauri) await invoke("save_settings", { json }); else localStorage.setItem("rustide.settings", json); }
  catch (e) { console.error("Sauvegarde des paramètres échouée", e); }
}
