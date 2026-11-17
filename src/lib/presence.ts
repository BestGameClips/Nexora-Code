import type { Settings } from "./settings";
export interface Presence { details: string; state: string; largeImage: string; smallImage: string | null; showElapsed: boolean; }
/** Charge utile prévue pour Discord ; respecte les réglages de confidentialité (fichier et projet masqués par défaut). */
export function buildPresence(s: Settings, file: string | null, lang: string | null, project: string | null): Presence {
  const d = s.discord;
  const parts = [d.showProject && project ? `Projet : ${project}` : null, d.showLanguage && lang ? lang : null].filter(Boolean);
  return { details: file ? (d.showFile ? `Édite ${file}` : "Édite un fichier") : "Inactif", state: d.text.trim() || parts.join(" · "), largeImage: "rustide", smallImage: d.showLanguage && lang ? lang : null, showElapsed: d.showTime };
}
