import { useSyncExternalStore } from "react";
import { getSettings, subscribe, update, type Mode } from "./lib/settings";
import { THEMES } from "./lib/themes";
export function Gallery({ base }: { base: "dark" | "light" }) {
  const s = useSyncExternalStore(subscribe, getSettings); const cur = base === "dark" ? s.darkTheme : s.lightTheme;
  const pick = (id: string) => update(base === "dark" ? { darkTheme: id, ...(s.mode === "light" ? { mode: "dark" as Mode } : {}) } : { lightTheme: id, ...(s.mode === "dark" ? { mode: "light" as Mode } : {}) });
  return <div className="gallery" role="radiogroup">{THEMES.filter((t) => t.base === base).map((t) => (
    <button key={t.id} role="radio" aria-checked={cur === t.id} className="swatch" onClick={() => pick(t.id)}>
      <span style={{ background: t.vars.bg, borderColor: t.vars.bd }}><i style={{ background: t.vars.ac }} /><b style={{ background: t.vars.bg3 }} /></span>{t.name}</button>))}</div>;
}
