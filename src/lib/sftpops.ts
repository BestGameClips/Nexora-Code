import { invoke } from "@tauri-apps/api/core";
import { askName, run, refreshTree } from "./sftp";
import { openRemote } from "./docs";

export const newFile = (dir: string) => askName("Nouveau fichier", "", async (n) => {
  const p = await run(() => invoke<string>("sftp_create_file", { dir, name: n })); refreshTree(); if (p) await openRemote(p);
});
export const newFolder = (dir: string) => askName("Nouveau dossier", "", async (n) => { await run(() => invoke("sftp_mkdir", { dir, name: n })); refreshTree(); });
export const renameEntry = (e: { name: string; path: string }) => askName("Renommer", e.name, async (n) => {
  if (n === e.name) return; await run(() => invoke("sftp_rename", { path: e.path, newName: n })); refreshTree();
});
export async function deleteEntry(e: { name: string; path: string; is_dir: boolean }) {
  if (!window.confirm(`Supprimer « ${e.name} » sur le serveur ? Cette action est définitive.`)) return;
  await run(() => invoke("sftp_remove", { path: e.path, isDir: e.is_dir })); refreshTree();
}
