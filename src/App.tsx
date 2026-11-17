import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getSettings, subscribe, update, inTauri, type Mode } from "./lib/settings";
import { register, all, keyOf, runByKeys, fuzzy } from "./lib/commands";

type View = "explorer" | "settings";
const useSettings = () => useSyncExternalStore(subscribe, getSettings);

export function App() {
  const s = useSettings();
  const [view, setView] = useState<View>("explorer");
  const [palette, setPalette] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [sysDark, setSysDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const f = () => setSysDark(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  const theme = s.mode === "system" ? (sysDark ? "dark" : "light") : s.mode;
  useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = theme;
    r.classList.toggle("mica", s.mica);
    r.style.setProperty("--fs", s.fontSize + "px");
  }, [theme, s.mica, s.fontSize]);

  useEffect(() => {
    register([
      { id: "ide.palette.open", title: "Ouvrir la palette de commandes", category: "Général", keys: "Ctrl+Shift+P", run: () => setPalette(true) },
      { id: "ide.settings.open", title: "Ouvrir les paramètres", category: "Général", keys: "Ctrl+,", run: () => setView("settings") },
      { id: "ide.explorer.focus", title: "Afficher l’explorateur", category: "Affichage", keys: "Ctrl+Shift+E", run: () => { setView("explorer"); update({ sidebarVisible: true }); } },
      { id: "ide.sidebar.toggle", title: "Afficher/masquer la barre latérale", category: "Affichage", keys: "Ctrl+B", run: () => update({ sidebarVisible: !getSettings().sidebarVisible }) },
      { id: "ide.panel.toggle", title: "Afficher/masquer le panneau inférieur", category: "Affichage", keys: "Ctrl+J", run: () => update({ panelVisible: !getSettings().panelVisible }) },
      ...(["system", "light", "dark"] as Mode[]).map((m) => ({ id: "ide.theme." + m, title: "Thème : " + { system: "automatique", light: "clair", dark: "sombre" }[m], category: "Apparence", run: () => update({ mode: m }) })),
    ]);
    const onKey = (e: KeyboardEvent) => { const k = keyOf(e); if (k && runByKeys(k)) e.preventDefault(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const win = inTauri ? getCurrentWindow() : null;
  useEffect(() => { win?.isMaximized().then(setMaximized); const f = () => win?.isMaximized().then(setMaximized); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, [win]);

  const drag = (axis: "x" | "y") => (e: React.PointerEvent) => {
    e.preventDefault();
    const start = axis === "x" ? e.clientX : e.clientY, init = axis === "x" ? s.sidebarWidth : s.panelHeight;
    const move = (ev: PointerEvent) => axis === "x" ? update({ sidebarWidth: init + ev.clientX - start }) : update({ panelHeight: init - (ev.clientY - start) });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  return (
    <div className="app">
      <header className="titlebar" data-tauri-drag-region>
        <span className="brand" data-tauri-drag-region>RustIDE Ultimate</span>
        <button className="link" onClick={() => setPalette(true)}>Palette de commandes (Ctrl+Maj+P)</button>
        {win && <div className="winctl">
          <button aria-label="Réduire" onClick={() => win.minimize()}>–</button>
          <button aria-label={maximized ? "Restaurer" : "Agrandir"} onClick={() => win.toggleMaximize()}>{maximized ? "❐" : "□"}</button>
          <button aria-label="Fermer" className="close" onClick={() => win.close()}>✕</button>
        </div>}
      </header>
      <div className="body">
        <nav className="activity" aria-label="Barre d’activité">
          <button title="Explorateur (Ctrl+Maj+E)" aria-pressed={view === "explorer"} onClick={() => { setView("explorer"); update({ sidebarVisible: true }); }}>▤</button>
          {["Recherche", "Git", "Débogage", "Extensions"].map((n) => <button key={n} disabled title={n + " — prévu, pas encore disponible"}>○</button>)}
          <button className="bottom" title="Paramètres (Ctrl+,)" aria-pressed={view === "settings"} onClick={() => setView("settings")}>⚙</button>
        </nav>
        {s.sidebarVisible && <><aside className="sidebar" style={{ width: s.sidebarWidth }}>
          <h2>Explorateur</h2>
          <p className="empty">Aucun dossier ouvert.<br />L’ouverture de dossiers locaux et SFTP arrive avec les modules 2 et 3.</p>
        </aside><div className="resizer v" onPointerDown={drag("x")} role="separator" aria-orientation="vertical" /></>}
        <main className="main">
          <div className="editor">{view === "settings" ? <Settings /> : <Welcome />}</div>
          {s.panelVisible && <><div className="resizer h" onPointerDown={drag("y")} role="separator" aria-orientation="horizontal" />
            <section className="panel" style={{ height: s.panelHeight }}><h2>Journal</h2><p className="empty">Aucun transfert. Le journal SFTP s’affichera ici.</p></section></>}
        </main>
      </div>
      <footer className="status"><span>v0.1.0</span><span>Thème : {theme === "dark" ? "sombre" : "clair"}</span></footer>
      {palette && <Palette onClose={() => setPalette(false)} />}
    </div>
  );
}

const Welcome = () => (
  <div className="page"><h1>RustIDE Ultimate</h1>
    <p>Module 1 : coque de l’application. L’éditeur Monaco, les fichiers locaux et SFTP sont les prochains modules.</p>
    <p>Essayez <kbd>Ctrl+Maj+P</kbd>, <kbd>Ctrl+B</kbd>, <kbd>Ctrl+J</kbd> ou <kbd>Ctrl+,</kbd>.</p></div>
);

function Settings() {
  const s = useSettings();
  return (
    <div className="page"><h1>Paramètres</h1>
      <label>Thème
        <select value={s.mode} onChange={(e) => update({ mode: e.target.value as Mode })}>
          <option value="system">Automatique (système)</option><option value="light">Clair</option><option value="dark">Sombre</option></select></label>
      <label>Taille du texte ({s.fontSize}px)
        <input type="range" min={10} max={24} value={s.fontSize} onChange={(e) => update({ fontSize: +e.target.value })} /></label>
      <label className="row"><input type="checkbox" checked={s.mica} onChange={(e) => update({ mica: e.target.checked })} />
        Effet Mica (Windows 11 uniquement ; désactivé par défaut)</label>
      <button onClick={() => update({ sidebarWidth: 260, panelHeight: 180, sidebarVisible: true, panelVisible: true })}>Restaurer la disposition</button>
    </div>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState(""); const [i, setI] = useState(0); const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const items = useMemo(() => all().map((c) => ({ c, sc: q ? fuzzy(q, c.title + " " + c.category) : 0 })).filter((x) => x.sc >= 0).sort((a, b) => b.sc - a.sc).map((x) => x.c), [q]);
  const exec = (n: number) => { const c = items[n]; onClose(); c?.run(); };
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label="Palette de commandes" onMouseDown={(e) => e.stopPropagation()}>
        <input ref={ref} value={q} placeholder="Tapez une commande…" onChange={(e) => { setQ(e.target.value); setI(0); }}
          onKeyDown={(e) => { if (e.key === "Escape") onClose(); else if (e.key === "ArrowDown") { setI(Math.min(i + 1, items.length - 1)); e.preventDefault(); } else if (e.key === "ArrowUp") { setI(Math.max(i - 1, 0)); e.preventDefault(); } else if (e.key === "Enter") exec(i); }} />
        <ul>{items.length === 0 && <li className="empty">Aucune commande ne correspond.</li>}
          {items.map((c, n) => <li key={c.id} className={n === i ? "sel" : ""} onMouseEnter={() => setI(n)} onClick={() => exec(n)}><span>{c.category} : {c.title}</span>{c.keys && <kbd>{c.keys}</kbd>}</li>)}</ul>
      </div>
    </div>
  );
}
