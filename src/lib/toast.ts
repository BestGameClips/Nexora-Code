import { _ } from "./translate";
export interface Toast { id: number; level: "info" | "success" | "error"; msg: string; }
let toasts: Toast[] = []; let n = 0; const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const getToasts = () => toasts;
export const subscribeToasts = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const dismissToast = (id: number) => { toasts = toasts.filter((t) => t.id !== id); emit(); };
export function toast(level: Toast["level"], msg: string) {
  const id = ++n; toasts = [...toasts, { id, level, msg }].slice(-4); emit();
  window.setTimeout(() => dismissToast(id), level === "error" ? 8000 : 3500);
}
export function copyText(text: string) {
  navigator.clipboard.writeText(text).then(() => toast("success", _("Copié dans le presse-papiers")), () => toast("error", _("Copie impossible")));
}
