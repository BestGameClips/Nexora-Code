import { useSyncExternalStore } from "react";
import { Icon } from "./icons";
import { getSettings, subscribe } from "./settings";
import { subscribeDocs } from "./docs";
import { subscribeSftp } from "./sftp";
import { extOn } from "./extensions";
export type IconPack = "badges" | "minimal" | "none";
type B = [string, string];
const E: Record<string, B> = { rs: ["RS", "#dea584"], ts: ["TS", "#3178c6"], tsx: ["TX", "#3178c6"], js: ["JS", "#e8d44d"], jsx: ["JX", "#e8d44d"], mjs: ["JS", "#e8d44d"], json: ["{}", "#cbcb41"], html: ["<>", "#e34c26"], css: ["#", "#563d7c"], scss: ["#", "#c6538c"], md: ["MD", "#519aba"], py: ["PY", "#3572a5"], go: ["GO", "#00add8"], java: ["JV", "#b07219"], kt: ["KT", "#a97bff"], swift: ["SW", "#f05138"], c: ["C", "#5c6bc0"], cpp: ["C+", "#5c6bc0"], h: ["H", "#8e8e9b"], cs: ["C#", "#68217a"], php: ["PH", "#777bb3"], rb: ["RB", "#cc342d"], lua: ["LU", "#51a0cf"], vue: ["V", "#41b883"], svelte: ["S", "#ff3e00"], toml: ["TM", "#9c4221"], yaml: ["YM", "#cb171e"], yml: ["YM", "#cb171e"], xml: ["XML", "#e37933"], sh: ["$", "#4eaa25"], ps1: ["PS", "#5391fe"], sql: ["DB", "#e38c00"], svg: ["SVG", "#ffb13b"], png: ["IMG", "#a074c4"], jpg: ["IMG", "#a074c4"], gif: ["IMG", "#a074c4"], pdf: ["PDF", "#e5252a"], lock: ["LK", "#8a8f98"], env: ["ENV", "#d4c800"], txt: ["TXT", "#8a8f98"], log: ["LOG", "#8a8f98"] };
const N: Record<string, B> = { "cargo.toml": ["CG", "#dea584"], "package.json": ["NPM", "#cb3837"], "tsconfig.json": ["TS", "#3178c6"], "vite.config.ts": ["VT", "#a855f7"], dockerfile: ["DK", "#2496ed"], ".gitignore": ["GIT", "#f05032"], "readme.md": ["RD", "#519aba"], license: ["LIC", "#d0b04d"] };
const F: Record<string, string> = { src: "#42a5f5", node_modules: "#8bc34a", target: "#ff9800", ".git": "#f05032", ".github": "#9aa1ad", public: "#26a69a", assets: "#ab47bc", tests: "#ef5350", test: "#ef5350", docs: "#29b6f6", dist: "#ff9800" };
export function iconInfo(name: string): B {
  const n = name.toLowerCase(), ext = n.includes(".") ? n.split(".").pop()! : "";
  return N[n] ?? E[ext] ?? [(ext || "··").slice(0, 3).toUpperCase(), "#8a8f98"];
}
const subAll = (f: () => void) => { const a = subscribe(f), b = subscribeDocs(f), c = subscribeSftp(f); return () => { a(); b(); c(); }; };
const mode = () => (extOn("icons") ? getSettings().iconPack : "none");
export function FileIcon({ name, dir = false, pack }: { name: string; dir?: boolean; pack?: IconPack }) {
  const m = useSyncExternalStore(subAll, mode); const p = pack ?? (m as IconPack);
  if (p === "badges" && !dir) { const [l, c] = iconInfo(name); return <span className="ficon"><span className="fbadge" style={{ color: c, background: c + "22", borderColor: c + "66" }}>{l}</span></span>; }
  const color = p === "badges" ? F[name.toLowerCase()] ?? "#7aa2d8" : p === "minimal" && dir ? "var(--ac)" : undefined;
  return <span className="ficon" style={color ? { color } : undefined}><Icon n={dir ? "files" : "file"} size={14} /></span>;
}
