import { invoke } from "@tauri-apps/api/core";
import { askText } from "../Ask";
import { openFile, refreshLocal, revealLocal, fail, closeMany, getDocs } from "./docs";
import { _ } from "./translate";

async function run<T>(fn: () => Promise<T>): Promise<T | undefined> { try { return await fn(); } catch (e) { fail(String(e)); return undefined; } }
/** Ferme les onglets d'un fichier ou dossier avant de le renommer/supprimer ; false si l'utilisateur annule. */
const closeUnder = (p: string) => closeMany(getDocs().tabs.filter((t) => t.path === p || t.path.startsWith(p + "\\") || t.path.startsWith(p + "/")).map((t) => t.path));

export const newFileIn = (dir: string) => askText("Nouveau fichier", "", async (n) => {
  const p = await run(() => invoke<string>("create_file", { dir, name: n })); revealLocal(dir); refreshLocal(); if (p) await openFile(p);
});
export const newFolderIn = (dir: string) => askText("Nouveau dossier", "", async (n) => { await run(() => invoke("fs_mkdir", { dir, name: n })); revealLocal(dir); refreshLocal(); });
export const renameLocal = (e: { name: string; path: string }) => askText("Renommer", e.name, async (n) => {
  if (n === e.name || !closeUnder(e.path)) return; await run(() => invoke("fs_rename", { path: e.path, newName: n })); refreshLocal();
});
export async function trashLocal(e: { name: string; path: string }) {
  if (!window.confirm(_("Mettre « {name} » à la corbeille ?", { name: e.name })) || !closeUnder(e.path)) return;
  await run(() => invoke("fs_trash", { path: e.path })); refreshLocal();
}
export const revealInOs = (path: string) => { void run(() => invoke("fs_reveal", { path })); };
