import * as monaco from "monaco-editor";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { inTauri } from "./settings";

export interface Tab { path: string; name: string; dirty: boolean; }
export interface DocsState { tabs: Tab[]; active: string | null; root: string | null; error: string | null; treeVersion: number; }
interface Doc { model: monaco.editor.ITextModel; saved: number; }
const docs = new Map<string, Doc>();
const pending = new Set<string>();
const subs = new Set<() => void>();
let state: DocsState = { tabs: [], active: null, root: null, error: null, treeVersion: 0 };
const set = (p: Partial<DocsState>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
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
    model.onDidChangeContent(() => { const d = docs.get(path); if (d) setDirty(path, model.getAlternativeVersionId() !== d.saved); });
    set({ tabs: [...state.tabs, { path, name: basename(path), dirty: false }], active: path, error: null });
  } catch (e) { set({ error: `Ouverture impossible : ${e}` }); }
  finally { pending.delete(path); }
}

export async function save() {
  const path = state.active; const d = path ? docs.get(path) : undefined;
  if (!path || !d) return;
  try {
    await invoke("write_file", { path, content: d.model.getValue() });
    d.saved = d.model.getAlternativeVersionId(); setDirty(path, false);
  } catch (e) { set({ error: `Enregistrement impossible : ${e}` }); }
}

export function close(path: string) {
  const t = state.tabs.find((x) => x.path === path); if (!t) return;
  if (t.dirty && !window.confirm(`« ${t.name} » a des modifications non enregistrées. Les abandonner ?`)) return;
  const i = state.tabs.findIndex((x) => x.path === path);
  const tabs = state.tabs.filter((x) => x.path !== path);
  const active = state.active === path ? (tabs[Math.min(i, tabs.length - 1)]?.path ?? null) : state.active;
  set({ tabs, active });
  docs.get(path)?.model.dispose(); docs.delete(path);
}

export async function openFolder() {
  if (!inTauri) return set({ error: "L’ouverture de dossiers n’est disponible que dans l’application installée." });
  try {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir !== "string") return;
    if (state.tabs.some((t) => t.dirty) && !window.confirm("Des modifications ne sont pas enregistrées. Les abandonner ?")) return;
    await invoke("set_root", { path: dir });
    docs.forEach((d) => d.model.dispose()); docs.clear();
    set({ tabs: [], active: null, root: dir, error: null });
  } catch (e) { set({ error: `Ouverture du dossier impossible : ${e}` }); }
}

export async function saveAll() {
  for (const t of state.tabs) {
    const d = t.dirty ? docs.get(t.path) : undefined; if (!d) continue;
    try { await invoke("write_file", { path: t.path, content: d.model.getValue() }); d.saved = d.model.getAlternativeVersionId(); setDirty(t.path, false); }
    catch (e) { set({ error: `Enregistrement de ${t.name} impossible : ${e}` }); }
  }
}
export function cycleTab(dir: 1 | -1) {
  const n = state.tabs.length; const i = state.tabs.findIndex((t) => t.path === state.active);
  if (n > 1 && i >= 0) set({ active: state.tabs[(i + dir + n) % n].path });
}
export async function createFile(name: string) {
  if (!state.root) return set({ error: "Ouvrez d’abord un dossier (Ctrl+O)." });
  try { const path = await invoke<string>("create_file", { dir: state.root, name }); set({ treeVersion: state.treeVersion + 1 }); await openFile(path); }
  catch (e) { set({ error: `Création impossible : ${e}` }); }
}
export interface Cursor { ln: number; col: number; lang: string; eol: string; tab: number; }
let cursor: Cursor | null = null; const csubs = new Set<() => void>();
export const getCursor = () => cursor;
export const subscribeCursor = (f: () => void) => { csubs.add(f); return () => { csubs.delete(f); }; };
export function setCursor(c: Cursor | null) { if (JSON.stringify(c) === JSON.stringify(cursor)) return; cursor = c; csubs.forEach((f) => f()); }
