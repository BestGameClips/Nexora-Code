import * as monaco from "monaco-editor";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { inTauri, getSettings, update } from "./settings";
import { withReconnect, getSftp } from "./sftp";
import { toast } from "./toast";
import { _ } from "./translate";
import { log } from "./log";

export interface Tab { path: string; name: string; dirty: boolean; }
export interface DocsState { tabs: Tab[]; active: string | null; root: string | null; error: string | null; treeVersion: number; cwd: string | null; reveal: { path: string; n: number } | null; }
interface Doc { model: monaco.editor.ITextModel; saved: number; remote?: { session: string; path: string; mtime: number | null }; }
const docs = new Map<string, Doc>();
const pending = new Set<string>();
const subs = new Set<() => void>();
let state: DocsState = { tabs: [], active: null, root: null, error: null, treeVersion: 0, cwd: null, reveal: null };
let restoring = true, lastSess = "";
const set = (p: Partial<DocsState>) => { state = { ...state, ...p }; subs.forEach((f) => f()); if (!restoring) saveSession(); };
export const getDocs = () => state;
export const subscribeDocs = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const docModel = (p: string) => docs.get(p)?.model;
export const basename = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;
export const dismissError = () => set({ error: null });
export const setActive = (path: string) => set({ active: path });

function setDirty(path: string, dirty: boolean) {
  if (state.tabs.find((t) => t.path === path)?.dirty === dirty) return;
  set({ tabs: state.tabs.map((t) => (t.path === path ? { ...t, dirty } : t)) });
}

export async function openFile(path: string) {
  if (docs.has(path)) return set({ active: path });
  if (pending.has(path)) return;
  pending.add(path);
  try {
    const text = await invoke<string>("read_file", { path });
    const model = monaco.editor.createModel(text, undefined, monaco.Uri.file(path));
    docs.set(path, { model, saved: model.getAlternativeVersionId() });
    model.onDidChangeContent(() => { const d = docs.get(path); if (d) { setDirty(path, model.getAlternativeVersionId() !== d.saved); scheduleAutoSave(path); } });
    set({ tabs: [...state.tabs, { path, name: basename(path), dirty: false }], active: path, error: null });
  } catch (e) { set({ error: `Ouverture impossible : ${e}` }); }
  finally { pending.delete(path); }
}

async function persist(path: string, force = false): Promise<void> {
  const d = docs.get(path); if (!d) return;
  try {
    if (d.remote) {
      const r = await withReconnect(() => invoke<{ mtime: number | null }>("sftp_write", { session: d.remote!.session, path: d.remote!.path, content: d.model.getValue(), expectedMtime: d.remote!.mtime, force }), d.remote.session);
      d.remote.mtime = r.mtime; log("info", _("Enregistré sur le serveur : {name}", { name: d.remote.path })); toast("success", _("Enregistré sur le serveur : {name}", { name: basename(d.remote.path) }));
    } else await invoke("write_file", { path, content: d.model.getValue() });
    d.saved = d.model.getAlternativeVersionId(); setDirty(path, false);
  } catch (e) {
    const conflict = String(e) === "CONFLICT";
    if (conflict && !force && window.confirm(_("Le fichier distant a été modifié depuis son ouverture. Écraser la version distante ?"))) return persist(path, true);
    set({ error: conflict ? "Enregistrement annulé : conflit avec la version distante. Vos modifications restent dans l’onglet." : `Enregistrement impossible : ${e} (vos modifications restent dans l’onglet)` });
  }
}
export const save = async () => { if (state.active) await persist(state.active); };

function drop(paths: string[]) {
  const gone = new Set(paths), i = state.tabs.findIndex((t) => t.path === state.active);
  const tabs = state.tabs.filter((t) => !gone.has(t.path));
  const active = state.active && gone.has(state.active) ? (tabs[Math.min(i, tabs.length - 1)]?.path ?? null) : state.active;
  set({ tabs, active });
  paths.forEach((p) => { docs.get(p)?.model.dispose(); docs.delete(p); });
}
export function close(path: string) {
  const t = state.tabs.find((x) => x.path === path); if (!t) return;
  if (t.dirty && !window.confirm(_("« {name} » a des modifications non enregistrées. Les abandonner ?", { name: t.name }))) return;
  drop([path]);
}
export function closeMany(paths: string[]): boolean {
  const n = state.tabs.filter((t) => paths.includes(t.path) && t.dirty).length;
  if (n > 0 && !window.confirm(_("{n} onglets ont des modifications non enregistrées. Les abandonner ?", { n }))) return false;
  drop(paths); return true;
}
export const closeOthers = (p: string) => closeMany(state.tabs.filter((t) => t.path !== p).map((t) => t.path));
export const closeRight = (p: string) => closeMany(state.tabs.slice(state.tabs.findIndex((t) => t.path === p) + 1).map((t) => t.path));
export const closeAll = () => closeMany(state.tabs.map((t) => t.path));
export function moveTab(from: string, to: string) {
  const tabs = [...state.tabs], a = tabs.findIndex((t) => t.path === from), b = tabs.findIndex((t) => t.path === to);
  if (a < 0 || b < 0 || a === b) return;
  const [x] = tabs.splice(a, 1); tabs.splice(b, 0, x); set({ tabs });
}
export function shiftTab(dir: 1 | -1) { const i = state.tabs.findIndex((t) => t.path === state.active), j = i + dir; if (i >= 0 && j >= 0 && j < state.tabs.length) moveTab(state.tabs[i].path, state.tabs[j].path); }

export async function openFolder() {
  if (!inTauri) return set({ error: "L’ouverture de dossiers n’est disponible que dans l’application installée." });
  try {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir !== "string") return;
    if (state.tabs.some((t) => t.dirty) && !window.confirm(_("Des modifications ne sont pas enregistrées. Les abandonner ?"))) return;
    await invoke("set_root", { path: dir });
    docs.forEach((d) => d.model.dispose()); docs.clear();
    set({ tabs: [], active: null, root: dir, cwd: null, error: null });
  } catch (e) { set({ error: `Ouverture du dossier impossible : ${e}` }); }
}

export async function saveAll() { for (const t of state.tabs) if (t.dirty) await persist(t.path); }
export function cycleTab(dir: 1 | -1) {
  const n = state.tabs.length; const i = state.tabs.findIndex((t) => t.path === state.active);
  if (n > 1 && i >= 0) set({ active: state.tabs[(i + dir + n) % n].path });
}
export async function createFile(name: string) {
  if (!state.root) return set({ error: "Ouvrez d’abord un dossier (Ctrl+O)." });
  try { const dir = state.cwd ?? state.root; const path = await invoke<string>("create_file", { dir, name }); set({ treeVersion: state.treeVersion + 1, reveal: { path: dir, n: Date.now() } }); await openFile(path); }
  catch (e) { set({ error: `Création impossible : ${e}` }); }
}
export interface Cursor { ln: number; col: number; lang: string; eol: string; tab: number; }
let cursor: Cursor | null = null; const csubs = new Set<() => void>();
export const getCursor = () => cursor;
export const subscribeCursor = (f: () => void) => { csubs.add(f); return () => { csubs.delete(f); }; };
export function setCursor(c: Cursor | null) { if (JSON.stringify(c) === JSON.stringify(cursor)) return; cursor = c; csubs.forEach((f) => f()); }

export const parseRemoteKey = (k: string) => { const m = /^sftp:([^:]+):(.*)$/s.exec(k); return m ? { sid: m[1], path: m[2] } : null; };
export async function openRemote(sid: string, remotePath: string) {
  const key = `sftp:${sid}:${remotePath}`;
  if (docs.has(key)) return set({ active: key });
  if (pending.has(key)) return;
  pending.add(key);
  try {
    const f = await withReconnect(() => invoke<{ content: string; mtime: number | null }>("sftp_read", { session: sid, path: remotePath }), sid);
    const model = monaco.editor.createModel(f.content, undefined, monaco.Uri.from({ scheme: "sftp", authority: sid, path: remotePath }));
    docs.set(key, { model, saved: model.getAlternativeVersionId(), remote: { session: sid, path: remotePath, mtime: f.mtime } });
    model.onDidChangeContent(() => { const x = docs.get(key); if (x) setDirty(key, model.getAlternativeVersionId() !== x.saved); });
    const g = getSftp(), suffix = g.order.length > 1 ? ` (${g.sessions[sid]?.name ?? sid})` : "";
    set({ tabs: [...state.tabs, { path: key, name: basename(remotePath) + suffix, dirty: false }], active: key, error: null });
  } catch (e) { set({ error: `Ouverture distante impossible : ${e}` }); }
  finally { pending.delete(key); }
}

export const setLocalCwd = (cwd: string) => set({ cwd });
export const refreshLocal = () => set({ treeVersion: state.treeVersion + 1 });
export const revealLocal = (path: string) => set({ reveal: { path, n: Date.now() } });
export const fail = (error: string) => set({ error });

const timers = new Map<string, number>();
function scheduleAutoSave(path: string) {
  if (!getSettings().autoSave) return;
  window.clearTimeout(timers.get(path));
  timers.set(path, window.setTimeout(() => { timers.delete(path); const d = docs.get(path); if (d && !d.remote && d.model.getAlternativeVersionId() !== d.saved) void persist(path); }, 1500));
}
function saveSession() {
  if (!getSettings().restoreSession) return;
  const local = (p: string | null) => (p && !p.startsWith("sftp:") ? p : null);
  const next = { root: state.root, tabs: state.tabs.map((t) => t.path).filter((p) => local(p)), active: local(state.active) };
  const j = JSON.stringify(next); if (j === lastSess) return; lastSess = j; update({ session: next });
}
/** Rouvre le dernier dossier et les onglets (fichiers enregistrés uniquement, jamais de contenu non sauvegardé). */
export async function restoreSession() {
  const s = getSettings().session;
  try {
    if (!inTauri || !getSettings().restoreSession || !s.root) return;
    await invoke("set_root", { path: s.root }); set({ root: s.root });
    for (const p of s.tabs) await openFile(p);
    if (s.active && docs.has(s.active)) set({ active: s.active });
  } catch { /* dossier déplacé ou supprimé : on démarre à vide */ }
  finally { restoring = false; lastSess = ""; }
}
export function toggleEol() {
  const m = state.active ? docs.get(state.active)?.model : undefined; if (!m) return;
  const crlf = m.getEOL() === "\r\n";
  m.pushEOL(crlf ? monaco.editor.EndOfLineSequence.LF : monaco.editor.EndOfLineSequence.CRLF);
  const c = getCursor(); if (c) setCursor({ ...c, eol: crlf ? "LF" : "CRLF" });
}
