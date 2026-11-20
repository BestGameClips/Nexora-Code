import { invoke } from "@tauri-apps/api/core";
import { askText } from "../Ask";
import { openFile, refreshLocal, revealLocal, fail, closeMany, getDocs } from "./docs";
import { toast, copyText } from "./toast";
import { _ } from "./translate";
export { copyText };

async function run<T>(fn: () => Promise<T>): Promise<T | undefined> { try { return await fn(); } catch (e) { fail(String(e)); return undefined; } }
const ok = async (fn: () => Promise<unknown>) => (await run(async () => { await fn(); return true; })) === true;
/** Ferme les onglets d'un fichier ou dossier avant de le renommer/supprimer ; false si l'utilisateur annule. */
const closeUnder = (p: string) => closeMany(getDocs().tabs.filter((t) => t.path === p || t.path.startsWith(p + "\\") || t.path.startsWith(p + "/")).map((t) => t.path));
export const relPath = (p: string) => { const r = getDocs().root; return r && p.startsWith(r) ? p.slice(r.length).replace(/^[\\/]/, "") : p; };

export const newFileIn = (dir: string) => askText("Nouveau fichier", "", async (n) => {
  const p = await run(() => invoke<string>("create_file", { dir, name: n })); revealLocal(dir); refreshLocal();
  if (p) { toast("success", _("Fichier créé : {name}", { name: n })); await openFile(p); }
});
export const newFolderIn = (dir: string) => askText("Nouveau dossier", "", async (n) => {
  const done = await ok(() => invoke("fs_mkdir", { dir, name: n })); revealLocal(dir); refreshLocal(); if (done) toast("success", _("Dossier créé : {name}", { name: n }));
});
export const renameLocal = (e: { name: string; path: string }) => askText("Renommer", e.name, async (n) => {
  if (n === e.name || !closeUnder(e.path)) return;
  const done = await ok(() => invoke("fs_rename", { path: e.path, newName: n })); refreshLocal(); if (done) toast("success", _("Renommé : {name}", { name: n }));
});
export async function trashLocal(e: { name: string; path: string }) {
  if (!window.confirm(_("Mettre « {name} » à la corbeille ?", { name: e.name })) || !closeUnder(e.path)) return;
  const done = await ok(() => invoke("fs_trash", { path: e.path })); refreshLocal(); if (done) toast("success", _("Mis à la corbeille : {name}", { name: e.name }));
}
export const revealInOs = (path: string) => { void run(() => invoke("fs_reveal", { path })); };

let clip: { path: string; name: string; cut: boolean } | null = null;
export const getClip = () => clip;
export const setClip = (e: { path: string; name: string }, cut: boolean) => { clip = { ...e, cut }; toast("info", _(cut ? "« {name} » coupé" : "« {name} » copié", { name: e.name })); };
export async function pasteInto(dir: string) {
  const c = clip; if (!c || (c.cut && !closeUnder(c.path))) return;
  const p = await run(() => invoke<string>(c.cut ? "fs_move" : "fs_copy", { src: c.path, dir }));
  if (p) { if (c.cut) clip = null; revealLocal(dir); refreshLocal(); toast("success", _("Collé : {name}", { name: c.name })); }
}
