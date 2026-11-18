import { useEffect, useRef, useState, useSyncExternalStore } from "react";
interface AskState { title: string; initial: string; run: (name: string) => void | Promise<void>; }
let st: AskState | null = null; const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const askText = (title: string, initial: string, run: AskState["run"]) => { st = { title, initial, run }; emit(); };
const closeAsk = () => { st = null; emit(); };
function Dialog({ a }: { a: AskState }) {
  const [v, setV] = useState(a.initial); const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const ok = () => { const n = v.trim(); closeAsk(); if (n) void a.run(n); };
  return <div className="overlay" onMouseDown={closeAsk}><div className="palette" role="dialog" aria-label={a.title} onMouseDown={(e) => e.stopPropagation()}>
    <input ref={ref} value={v} placeholder={a.title} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") closeAsk(); else if (e.key === "Enter") ok(); }} />
    <p className="empty hint">{a.title} : Entrée pour valider, Échap pour annuler.</p></div></div>;
}
export function AskHost() {
  const a = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => st);
  return a ? <Dialog key={a.title + a.initial} a={a} /> : null;
}
