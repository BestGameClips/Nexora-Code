import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { inTauri } from "./settings";
import { getSftp, refreshTree, withReconnect, run } from "./sftp";
import { log, showPanel } from "./log";
import { toast } from "./toast";
import { _ } from "./translate";

export interface Job { id: string; session: string; dir: "up" | "down"; name: string; local: string; remote: string; size: number; done: number; state: "queued" | "running" | "done" | "error" | "cancelled" | "skipped"; error?: string; overwrite: boolean; ask: boolean; }
type NewJob = Pick<Job, "session" | "dir" | "name" | "local" | "remote" | "ask" | "overwrite">;
let jobs: Job[] = []; let running = 0; let bDone = 0, bErr = 0, bSkip = 0; const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const getJobs = () => jobs;
export const subscribeJobs = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const patch = (id: string, p: Partial<Job>) => { jobs = jobs.map((j) => (j.id === id ? { ...j, ...p } : j)); emit(); };
const MAX = 2;

export function initTransfers() {
  if (!inTauri) return;
  void listen<{ id: string; done: number; total: number }>("transfer-progress", (e) => patch(e.payload.id, { done: e.payload.done, size: e.payload.total }));
}
function flushSummary() {
  if (running > 0 || jobs.some((x) => x.state === "queued") || bDone + bErr + bSkip === 0) return;
  if (bErr > 0) toast("error", _("{n} transfert(s) échoué(s) sur {t}", { n: bErr, t: bDone + bErr + bSkip }));
  else if (bDone > 0) toast("success", bDone === 1 ? _("Transfert réussi") : _("{n} transferts réussis", { n: bDone }));
  bDone = bErr = bSkip = 0;
}
function pump() { for (;;) { const j = jobs.find((x) => x.state === "queued"); if (running >= MAX || !j) return; void runJob(j); } }
async function runJob(j: Job) {
  running++; patch(j.id, { state: "running", done: 0 });
  log("info", _("Début : {name}", { name: j.name }));
  try {
    await withReconnect(() => invoke(j.dir === "up" ? "sftp_upload" : "sftp_download", { session: j.session, id: j.id, local: j.local, remote: j.remote, overwrite: j.overwrite }), j.session);
    patch(j.id, { state: "done", done: jobs.find((x) => x.id === j.id)?.size ?? 0 }); log("info", _("Terminé : {name}", { name: j.name })); bDone++;
    if (j.dir === "up") refreshTree();
  } catch (e) {
    const m = String(e);
    if (m === "CANCELLED") { patch(j.id, { state: "cancelled" }); log("warn", _("Annulé : {name}", { name: j.name })); }
    else if (m === "EXISTS") {
      if (j.ask && window.confirm(_("« {name} » existe déjà. Le remplacer ?", { name: j.name }))) patch(j.id, { state: "queued", overwrite: true, ask: false });
      else { patch(j.id, { state: "skipped" }); log("warn", _("Ignoré (existe déjà) : {name}", { name: j.name })); bSkip++; }
    } else { patch(j.id, { state: "error", error: m }); log("error", `${j.name} : ${m}`); bErr++; }
  } finally { running--; flushSummary(); pump(); }
}
function enqueue(list: NewJob[]) {
  if (!list.length) return;
  jobs = [...jobs, ...list.map((j) => ({ ...j, id: crypto.randomUUID(), size: 0, done: 0, state: "queued" as const }))]; emit();
  showPanel("transfers"); pump();
}
export function cancelJob(id: string) { const j = jobs.find((x) => x.id === id); if (!j) return; if (j.state === "queued") patch(id, { state: "cancelled" }); else if (j.state === "running") void invoke("transfer_cancel", { id }); }
export function retryJob(id: string) { patch(id, { state: "queued", done: 0, error: undefined, overwrite: false, ask: true }); pump(); }
export function clearFinished() { jobs = jobs.filter((j) => j.state === "queued" || j.state === "running"); emit(); }

const base = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;
const rjoin = (d: string, n: string) => d.replace(/\/+$/, "") + "/" + n;
const lpath = (d: string, rel: string) => d.replace(/[\\/]+$/, "") + "\\" + rel.replace(/\//g, "\\");

export async function uploadFiles(sid: string, remoteDir: string) {
  const sel = await open({ multiple: true }); const files = Array.isArray(sel) ? sel : sel ? [sel] : [];
  enqueue(files.map((f) => ({ session: sid, dir: "up" as const, name: base(f), local: f, remote: rjoin(remoteDir, base(f)), ask: true, overwrite: false })));
}
export async function uploadFolder(sid: string, remoteDir: string) {
  const dir = await open({ directory: true }); if (typeof dir !== "string") return;
  await run(async () => {
    const all = await invoke<{ rel: string; size: number }[]>("local_walk", { dir });
    const keep = all.filter((f) => !/(^|\/)(\.git|node_modules)\//.test(f.rel));
    if (keep.length < all.length) log("info", _("{n} fichier(s) ignoré(s) (.git, node_modules)", { n: all.length - keep.length }));
    const root = rjoin(remoteDir, base(dir));
    const dirs = new Set<string>([root]); keep.forEach((f) => { const i = f.rel.lastIndexOf("/"); if (i > 0) dirs.add(root + "/" + f.rel.slice(0, i)); });
    for (const d of dirs) await invoke("sftp_mkdir_p", { session: sid, path: d });
    const overwrite = keep.length > 1 && window.confirm(_("Remplacer les fichiers qui existent déjà sur le serveur ? (Annuler : les ignorer)"));
    enqueue(keep.map((f) => ({ session: sid, dir: "up" as const, name: base(dir) + "/" + f.rel, local: lpath(dir, f.rel), remote: root + "/" + f.rel, ask: keep.length === 1, overwrite })));
  }, sid);
}
export async function download(sid: string, e: { name: string; path: string; is_dir: boolean }) {
  if (!getSftp().sessions[sid]) return;
  const dest = await open({ directory: true }); if (typeof dest !== "string") return;
  if (!e.is_dir) return enqueue([{ session: sid, dir: "down", name: e.name, local: lpath(dest, e.name), remote: e.path, ask: true, overwrite: false }]);
  await run(async () => {
    const files: { rel: string; path: string }[] = [];
    const walk = async (p: string, rel: string) => {
      for (const it of await invoke<{ name: string; path: string; is_dir: boolean }[]>("sftp_list", { session: sid, path: p })) {
        const r = rel + "/" + it.name; if (it.is_dir) await walk(it.path, r); else files.push({ rel: r, path: it.path });
        if (files.length > 20000) throw new Error(_("Dossier trop volumineux (plus de 20 000 fichiers)"));
      }
    };
    await walk(e.path, e.name);
    for (const d of new Set(files.map((f) => f.rel.slice(0, f.rel.lastIndexOf("/"))))) await invoke("local_mkdir_all", { path: lpath(dest, d) });
    const overwrite = files.length > 1 && window.confirm(_("Remplacer les fichiers qui existent déjà sur cet ordinateur ? (Annuler : les ignorer)"));
    enqueue(files.map((f) => ({ session: sid, dir: "down" as const, name: f.rel, local: lpath(dest, f.rel), remote: f.path, ask: files.length === 1, overwrite })));
  }, sid);
}
