import { getSettings, update } from "./settings";
import { getDocs } from "./docs";
import { getSftp } from "./sftp";
export interface Ext { id: string; name: string; desc: string; defaultOn: boolean; }
export const EXTS: Ext[] = [
  { id: "icons", name: "Icônes de fichiers", desc: "Icônes par type de fichier et de dossier (explorateur, onglets, SFTP).", defaultOn: true },
  { id: "markdown", name: "Aperçu Markdown", desc: "Aperçu en direct des fichiers .md, comme README.md.", defaultOn: true },
  { id: "discord", name: "Discord Rich Presence", desc: "Prépare l’activité Discord. La connexion à Discord arrive dans un prochain module.", defaultOn: false },
];
/** Espace de travail = dossier local ouvert, sinon serveur SFTP connecté. */
export const wsKey = (root: string | null, sftpId: string | null) => root ?? (sftpId ? "sftp:" + sftpId : null);
export const currentWs = () => wsKey(getDocs().root, getSftp().connected?.id ?? null);
export function extOn(id: string): boolean {
  const s = getSettings(), ws = currentWs();
  return (ws ? s.wsExt[ws]?.[id] : undefined) ?? s.extensions[id] ?? EXTS.find((e) => e.id === id)?.defaultOn ?? false;
}
/** value = null : retire l'exception et revient au réglage global. */
export function setWs(ws: string, id: string, value: boolean | null) {
  const s = getSettings(); const cur = { ...(s.wsExt[ws] ?? {}) };
  if (value === null) delete cur[id]; else cur[id] = value;
  update({ wsExt: { ...s.wsExt, [ws]: cur } });
}
