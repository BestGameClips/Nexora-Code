import { invoke } from "@tauri-apps/api/core";
import { askName, run, attempt, refreshTree, setReveal, getSftp } from "./sftp";
import { openRemote, closeMany, getDocs } from "./docs";
import { toast } from "./toast";
import { _ } from "./translate";

const under = (sid: string, p: string) => { const k = `sftp:${sid}:${p}`; return getDocs().tabs.filter((t) => t.path === k || t.path.startsWith(k + "/")).map((t) => t.path); };

export const newFile = (sid: string, dir: string) => askName("Nouveau fichier", "", async (n) => {
  const p = await run(() => invoke<string>("sftp_create_file", { session: sid, dir, name: n }), sid);
  setReveal(sid, dir); refreshTree(); if (p) { toast("success", _("Fichier créé : {name}", { name: n })); await openRemote(sid, p); }
});
export const newFolder = (sid: string, dir: string) => askName("Nouveau dossier", "", async (n) => {
  const ok = await attempt(() => invoke("sftp_mkdir", { session: sid, dir, name: n }), sid);
  setReveal(sid, dir); refreshTree(); if (ok) toast("success", _("Dossier créé : {name}", { name: n }));
});
export const renameEntry = (sid: string, e: { name: string; path: string }) => askName("Renommer", e.name, async (n) => {
  if (n === e.name || !closeMany(under(sid, e.path))) return;
  const ok = await attempt(() => invoke("sftp_rename", { session: sid, path: e.path, newName: n }), sid);
  refreshTree(); if (ok) toast("success", _("Renommé : {name}", { name: n }));
});
export async function deleteEntry(sid: string, e: { name: string; path: string; is_dir: boolean }) {
  if (!window.confirm(_("Supprimer « {name} » sur le serveur ? Cette action est définitive.", { name: e.name })) || !closeMany(under(sid, e.path))) return;
  const ok = await attempt(() => invoke("sftp_remove", { session: sid, path: e.path, isDir: e.is_dir }), sid);
  refreshTree(); if (ok) toast("success", _("Supprimé : {name}", { name: e.name }));
}
const here = () => { const a = getSftp(); return a.active && a.connected ? { sid: a.active, dir: a.cwd ?? a.connected.home } : null; };
export const newFileHere = () => { const h = here(); if (h) newFile(h.sid, h.dir); };
export const newFolderHere = () => { const h = here(); if (h) newFolder(h.sid, h.dir); };
