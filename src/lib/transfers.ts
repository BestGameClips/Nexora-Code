import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { inTauri } from "./settings";
import { getSftp, refreshTree, withReconnect, run } from "./sftp";
import { log, showPanel } from "./log";
import { _ } from "./translate";

export interface Job { id: string; dir: "up" | "down"; name: string; local: string; remote: string; size: number; done: number; state: "queued" | "running" | "done" | "error" | "cancelled" | "skipped"; error?: string; overwrite: boolean; ask: boolean; }
let jobs: Job[] = []; let running = 0; const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const getJobs = () => jobs;
export const subscribeJobs = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const patch = (id: string, p: Partial<Job>) => { jobs = jobs.map((j) => (j.id === id ? { ...j, ...p } : j)); emit(); };
const MAX = 2;

export function initTransfers() {
  if (!inTauri) return;
  void listen<{ id: string; done: number; total: number }>("transfer-progress", (e) => patch(e.payload.id, { done: e.payload.done, size: e.payload.total }));
}
function pump() { for (;;) { const j = jobs.find((x) => x.state === "queued"); if (running >= MAX || !j) return; void runJob(j); } }
async function runJob(j: Job) {
  running++; patch(j.id, { state: "running", done: 0 });
  log("info", _("Début : {name}", { name: j.name }));
  let requeue = false;
  try {
    await withReconnect(() => invoke(j.dir === "up" ? "sftp_upload" : "sftp_download", { id: j.id, local: j.local, remote: j.remote, overwrite: j.overwrite }));
    patch(j.id, { state: "done", done: jobs.find((x) => x.id === j.id)?.size ?? 0 }); log("info", _("Terminé : {name}", { name: j.name }));
    if (j.dir === "up") refreshTree();
  } catch (e) {
    const m = String(e);
    if (m === "CANCELLED") { patch(j.id, { state: "cancelled" }); log("warn", _("Annulé : {name}", { name: j.name })); }
    else if (m === "EXISTS") {
      if (j.ask && window.confirm(_("« {name} » existe déjà. Le remplacer ?", { name: j.name }))) { patch(j.id, { state: "queued", overwrite: true, ask: false }); requeue = true; }
      else { patch(j.id, { state: "skipped" }); log("warn", _("Ignoré (existe déjà) : {name}", { name: j.name })); }
    } else { patch(j.id, { state: "error", error: m }); log("error", `${j.name} : ${m}`); }
  } finally { running--; pump(); void requeue; }
}
function enqueue(list: Pick<Job, "dir" | "name" | "local" | "remote" | "ask" | "overwrite">[]) {
  if (!list.length) return;
  jobs = [...jobs, ...list.map((j) => ({ ...j, id: crypto.randomUUID(), size: 0, done: 0, state: "queued" as const, overwrite: j.overwrite }))]; emit();
  showPanel("transfers"); pump();
}
export function cancelJob(id: string) { const j = jobs.find((x) => x.id === id); if (!j) return; if (j.state === "queued") patch(id, { state: "cancelled" }); else if (j.state === "running") void invoke("transfer_cancel", { id }); }
export function retryJob(id: string) { patch(id, { state: "queued", done: 0, error: undefined, overwrite: false, ask: true }); pump(); }
export function clearFinished() { jobs = jobs.filter((j) => j.state === "queued" || j.state === "running"); emit(); }

const base = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;
const rjoin = (d: string, n: string) => d.replace(/\/+$/, "") + "/" + n;
const lpath = (d: string, rel: string) => d.replace(/[\\/]+$/, "") + "\\" + rel.replace(/\//g, "\\");

export async function uploadFiles(remoteDir: string) {
  const sel = await open({ multiple: true }); const files = Array.isArray(sel) ? sel : sel ? [sel] : [];
  enqueue(files.map((f) => ({ dir: "up" as const, name: base(f), local: f, remote: rjoin(remoteDir, base(f)), ask: true, overwrite: false })));
}
export async function uploadFolder(remoteDir: string) {
  const dir = await open({ directory: true }); if (typeof dir !== "string") return;
  await run(async () => {
    const all = await invoke<{ rel: string; size: number }[]>("local_walk", { dir });
    const keep = all.filter((f) => !/(^|\/)(\.git|node_modules)\//.test(f.rel));
    if (keep.length < all.length) log("info", _("{n} fichier(s) ignoré(s) (.git, node_modules)", { n: all.length - keep.length }));
    const root = rjoin(remoteDir, base(dir));
    const dirs = new Set<string>([root]); keep.forEach((f) => { const i = f.rel.lastIndexOf("/"); if (i > 0) dirs.add(root + "/" + f.rel.slice(0, i)); });
    for (const d of dirs) await invoke("sftp_mkdir_p", { path: d });
    const overwrite = keep.length > 1 && window.confirm(_("Remplacer les fichiers qui existent déjà sur le serveur ? (Annuler : les ignorer)"));
    enqueue(keep.map((f) => ({ dir: "up" as const, name: base(dir) + "/" + f.rel, local: lpath(dir, f.rel), remote: root + "/" + f.rel, ask: keep.length === 1, overwrite })));
  });
}
export async function download(e: { name: string; path: string; is_dir: boolean }) {
  if (!getSftp().connected) return;
  const dest = await open({ directory: true }); if (typeof dest !== "string") return;
  if (!e.is_dir) return enqueue([{ dir: "down", name: e.name, local: lpath(dest, e.name), remote: e.path, ask: true, overwrite: false }]);
  await run(async () => {
    const files: { rel: string; path: string }[] = [];
    const walk = async (p: string, rel: string) => {
      for (const it of await invoke<{ name: string; path: string; is_dir: boolean }[]>("sftp_list", { path: p })) {
        const r = rel + "/" + it.name; if (it.is_dir) await walk(it.path, r); else files.push({ rel: r, path: it.path });
        if (files.length > 20000) throw new Error(_("Dossier trop volumineux (plus de 20 000 fichiers)"));
      }
    };
    await walk(e.path, e.name);
    for (const d of new Set(files.map((f) => f.rel.slice(0, f.rel.lastIndexOf("/"))))) await invoke("local_mkdir_all", { path: lpath(dest, d) });
    const overwrite = files.length > 1 && window.confirm(_("Remplacer les fichiers qui existent déjà sur cet ordinateur ? (Annuler : les ignorer)"));
    enqueue(files.map((f) => ({ dir: "down" as const, name: f.rel, local: lpath(dest, f.rel), remote: f.path, ask: files.length === 1, overwrite })));
  });
}
