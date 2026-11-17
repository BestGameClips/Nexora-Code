export interface Command { id: string; title: string; category: string; keys?: string; run: () => void; }
const registry = new Map<string, Command>();
export const register = (cmds: Command[]) => { registry.clear(); cmds.forEach((c) => registry.set(c.id, c)); };
export const all = () => [...registry.values()];
export function keyOf(e: KeyboardEvent): string {
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (["Control", "Shift", "Alt", "Meta"].includes(k)) return "";
  return [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", k].filter(Boolean).join("+");
}
export function runByKeys(combo: string): boolean {
  const c = all().find((x) => x.keys === combo);
  if (c) { c.run(); return true; }
  return false;
}
export function fuzzy(q: string, s: string): number {
  q = q.toLowerCase(); s = s.toLowerCase();
  let i = 0, score = 0;
  for (const ch of s) { if (ch === q[i]) { i++; score += 1; } }
  return i === q.length ? score + (s.startsWith(q) ? 5 : 0) : -1;
}
