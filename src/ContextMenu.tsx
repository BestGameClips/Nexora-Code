import { useEffect, useSyncExternalStore } from "react";
export interface MenuItem { label?: string; run?: () => void; disabled?: boolean; danger?: boolean; sep?: boolean; }
let st: { x: number; y: number; items: MenuItem[] } | null = null; const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const openMenu = (x: number, y: number, items: MenuItem[]) => { st = { x, y, items }; emit(); };
const closeMenu = () => { if (st) { st = null; emit(); } };
export function MenuHost() {
  const m = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => st);
  useEffect(() => {
    if (!m) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") closeMenu(); };
    window.addEventListener("click", closeMenu); window.addEventListener("blur", closeMenu); window.addEventListener("resize", closeMenu); window.addEventListener("keydown", k);
    return () => { window.removeEventListener("click", closeMenu); window.removeEventListener("blur", closeMenu); window.removeEventListener("resize", closeMenu); window.removeEventListener("keydown", k); };
  }, [m]);
  if (!m) return null;
  const left = Math.max(4, Math.min(m.x, window.innerWidth - 224)), top = Math.max(4, Math.min(m.y, window.innerHeight - m.items.length * 32 - 12));
  return <div className="ctxmenu" role="menu" style={{ left, top }} onContextMenu={(e) => e.preventDefault()}>
    {m.items.map((it, i) => it.sep ? <hr key={i} /> : <button key={i} role="menuitem" disabled={it.disabled} className={it.danger ? "danger" : ""} onClick={() => { closeMenu(); it.run?.(); }}>{it.label}</button>)}</div>;
}
