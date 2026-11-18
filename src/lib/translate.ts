import { EN, PATTERNS } from "./dict";
type Lang = "fr" | "en";
let lang: Lang = "fr"; let obs: MutationObserver | null = null;
const origT = new WeakMap<Text, string>(); const origA = new WeakMap<Element, Record<string, string>>();
const ATTRS = ["title", "aria-label", "placeholder", "alt"]; const SKIP = ".host, .md, script, style, textarea";

function tx(s: string): string {
  const t = s.trim(); if (!t) return s;
  const e = EN[t]; if (e !== undefined) return s.replace(t, e);
  for (const [re, rep] of PATTERNS) if (re.test(t)) return s.replace(t, t.replace(re, rep));
  return s;
}
/** Traduit une chaîne du code (confirmations, messages) ; {x} est remplacé par les valeurs fournies. */
export function _(s: string, v?: Record<string, string | number>): string {
  let t = lang === "en" ? EN[s] ?? s : s;
  if (v) for (const k of Object.keys(v)) t = t.split("{" + k + "}").join(String(v[k]));
  return t;
}
function fixText(n: Text) {
  if (n.parentElement?.closest(SKIP)) return;
  const cur = n.nodeValue ?? "", o = origT.get(n);
  const src = o !== undefined && cur === tx(o) ? o : cur, want = lang === "en" ? tx(src) : src;
  if (want !== cur) n.nodeValue = want;
  if (want !== src) origT.set(n, src); else origT.delete(n);
}
function fixAttr(el: Element, a: string) {
  if (el.closest(SKIP)) return;
  const cur = el.getAttribute(a); if (cur === null) return;
  const m = origA.get(el) ?? {}, o = m[a];
  const src = o !== undefined && cur === tx(o) ? o : cur, want = lang === "en" ? tx(src) : src;
  if (want !== cur) el.setAttribute(a, want);
  if (want !== src) { m[a] = src; origA.set(el, m); } else if (o !== undefined) delete m[a];
}
const SEL = ATTRS.map((a) => `[${a}]`).join(",");
function walk(root: Node) {
  if (root.nodeType === 3) return fixText(root as Text);
  if (root.nodeType !== 1) return;
  const el = root as Element; if (el.closest(SKIP)) return;
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n: Node | null;
  while ((n = w.nextNode())) fixText(n as Text);
  [el, ...Array.from(el.querySelectorAll(SEL))].forEach((e) => ATTRS.forEach((a) => e.hasAttribute(a) && fixAttr(e, a)));
}
/** Traduction centralisée de l'interface : français = source, anglais = dictionnaire. Le code et les noms de fichiers ne sont jamais touchés. */
export function setLanguage(l: Lang) {
  if (l === lang && obs) return;
  lang = l; document.documentElement.lang = l; walk(document.body);
  if (!obs) {
    obs = new MutationObserver((recs) => recs.forEach((r) => {
      if (r.type === "childList") r.addedNodes.forEach(walk);
      else if (r.type === "characterData") fixText(r.target as Text);
      else if (r.attributeName) fixAttr(r.target as Element, r.attributeName);
    }));
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
}
