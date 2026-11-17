import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getSettings, subscribe, update, inTauri, type Mode } from "./lib/settings";
import { register, all, keyOf, runByKeys, fuzzy } from "./lib/commands";
import { Icon, type IconName } from "./lib/icons";
import { Explorer } from "./Explorer";
import { Workbench } from "./Editor";
import { openFolder, save, close as closeTab, getDocs } from "./lib/docs";

type View = "explorer" | "settings";
const useSettings = () => useSyncExternalStore(subscribe, getSettings);
const FUTURE: [string, IconName][] = [["Recherche", "search"], ["Git", "git"], ["Débogage", "bug"], ["Extensions", "ext"]];

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
    r.style.setProperty("--r", (s.rounded ? s.radius : 0) + "px");
    r.style.setProperty("--rl", (s.rounded ? s.radius * 1.5 : 0) + "px");
    r.style.setProperty("--rp", s.rounded ? "999px" : "0px");
  }, [theme, s.mica, s.fontSize, s.rounded, s.radius]);

  useEffect(() => {
    register([
      { id: "ide.palette.open", title: "Ouvrir la palette de commandes", category: "Général", keys: "Ctrl+Shift+P", run: () => setPalette(true) },
      { id: "ide.settings.open", title: "Ouvrir les paramètres", category: "Général", keys: "Ctrl+,", run: () => setView("settings") },
      { id: "ide.folder.open", title: "Ouvrir un dossier…", category: "Fichier", keys: "Ctrl+O", run: () => { openFolder(); } },
      { id: "ide.file.save", title: "Enregistrer", category: "Fichier", keys: "Ctrl+S", run: () => { save(); } },
      { id: "ide.tab.close", title: "Fermer l’onglet", category: "Fichier", keys: "Ctrl+W", run: () => { const t = getDocs().active; if (t) closeTab(t); } },
      { id: "ide.explorer.focus", title: "Afficher l’explorateur", category: "Affichage", keys: "Ctrl+Shift+E", run: () => { setView("explorer"); update({ sidebarVisible: true }); } },
      { id: "ide.sidebar.toggle", title: "Afficher/masquer la barre latérale", category: "Affichage", keys: "Ctrl+B", run: () => update({ sidebarVisible: !getSettings().sidebarVisible }) },
      { id: "ide.panel.toggle", title: "Afficher/masquer le panneau inférieur", category: "Affichage", keys: "Ctrl+J", run: () => update({ panelVisible: !getSettings().panelVisible }) },
      { id: "ide.rounded.toggle", title: "Activer/désactiver les coins arrondis", category: "Apparence", run: () => update({ rounded: !getSettings().rounded }) },
      ...(["system", "light", "dark"] as Mode[]).map((m) => ({ id: "ide.theme." + m, title: "Thème : " + { system: "automatique", light: "clair", dark: "sombre" }[m], category: "Apparence", run: () => update({ mode: m }) })),
    ]);
    const onKey = (e: KeyboardEvent) => { const k = keyOf(e); if (k && runByKeys(k)) e.preventDefault(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const win = inTauri ? getCurrentWindow() : null;
  useEffect(() => {
    if (!win) return;
    const f = () => win.isMaximized().then(setMaximized);
    f(); window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, [win]);

  const drag = (axis: "x" | "y") => (e: React.PointerEvent) => {
    e.preventDefault();
    const start = axis === "x" ? e.clientX : e.clientY, init = axis === "x" ? s.sidebarWidth : s.panelHeight;
    const move = (ev: PointerEvent) => axis === "x" ? update({ sidebarWidth: init + ev.clientX - start }) : update({ panelHeight: init - (ev.clientY - start) });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  return (
    <div className={"app" + (maximized ? " maxi" : "")}>
      <header className="titlebar" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region><span className="logo" />RustIDE Ultimate</div>
        <button className="cmdbar" onClick={() => setPalette(true)} aria-label="Ouvrir la palette de commandes">
          <Icon n="search" size={14} /><span>Rechercher ou exécuter une commande</span><kbd>Ctrl+Maj+P</kbd>
        </button>
        {win ? <div className="winctl">
          <button aria-label="Réduire" onClick={() => win.minimize()}><Icon n="min" size={14} w={1.4} /></button>
          <button aria-label={maximized ? "Restaurer" : "Agrandir"} onClick={() => win.toggleMaximize()}><Icon n={maximized ? "restore" : "max"} size={14} w={1.4} /></button>
          <button aria-label="Fermer" className="close" onClick={() => win.close()}><Icon n="close" size={14} w={1.4} /></button>
        </div> : <div />}
      </header>
      <div className="body">
        <nav className="activity" aria-label="Barre d’activité">
          <button title="Explorateur (Ctrl+Maj+E)" aria-pressed={view === "explorer"} onClick={() => { setView("explorer"); update({ sidebarVisible: true }); }}><Icon n="files" /></button>
          {FUTURE.map(([n, ic]) => <button key={n} disabled title={n + " — prévu, pas encore disponible"}><Icon n={ic} /></button>)}
          <button className="bottom" title="Paramètres (Ctrl+,)" aria-pressed={view === "settings"} onClick={() => setView("settings")}><Icon n="gear" /></button>
        </nav>
        {s.sidebarVisible && <><aside className="sidebar" style={{ width: s.sidebarWidth }}>
          <h2>Explorateur</h2>
          <Explorer />
        </aside><div className="resizer v" onPointerDown={drag("x")} role="separator" aria-orientation="vertical" /></>}
        <main className="main">
          <div className="editor">
            <div className="scroll" style={{ display: view === "settings" ? "block" : "none" }}><Settings /></div>
            <div className="workspace" style={{ display: view === "settings" ? "none" : "flex" }}><Workbench welcome={<Welcome />} theme={theme} fontSize={s.fontSize} /></div></div>
          {s.panelVisible && <><div className="resizer h" onPointerDown={drag("y")} role="separator" aria-orientation="horizontal" />
            <section className="panel" style={{ height: s.panelHeight }}><h2>Journal</h2><p className="empty">Aucun transfert pour le moment. Le journal SFTP s’affichera ici.</p></section></>}
        </main>
      </div>
      <footer className="status"><span>v0.1.0</span><span>Thème {theme === "dark" ? "sombre" : "clair"}</span></footer>
      {palette && <Palette onClose={() => setPalette(false)} />}
    </div>
  );
}

const Welcome = () => (
  <div className="page"><h1>Bienvenue</h1>
    <p className="lead">RustIDE Ultimate, version 0.1 : la coque de l’application est prête. L’éditeur, les fichiers locaux et le SFTP arrivent ensuite.</p>
    <p>Raccourcis : <kbd>Ctrl+Maj+P</kbd> palette · <kbd>Ctrl+B</kbd> barre latérale · <kbd>Ctrl+J</kbd> panneau · <kbd>Ctrl+,</kbd> paramètres</p></div>
);

const Row = ({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) => (
  <div className="srow"><div><div className="st">{title}</div>{desc && <div className="sd">{desc}</div>}</div><div className="sc">{children}</div></div>
);
const Switch = ({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) => (
  <button role="switch" aria-checked={on} aria-label={label} className="switch" onClick={() => set(!on)}><i /></button>
);

function Settings() {
  const s = useSettings();
  const modes: [Mode, string][] = [["system", "Système"], ["light", "Clair"], ["dark", "Sombre"]];
  return (
    <div className="page"><h1>Paramètres</h1>
      <h3>Apparence</h3>
      <div className="card">
        <Row title="Thème" desc="Le mode automatique suit Windows.">
          <div className="seg" role="radiogroup" aria-label="Thème">{modes.map(([m, l]) => <button key={m} role="radio" aria-checked={s.mode === m} onClick={() => update({ mode: m })}>{l}</button>)}</div></Row>
        <Row title="Coins arrondis" desc="Arrondit les boutons, la barre de recherche, les champs et les menus."><Switch on={s.rounded} set={(v) => update({ rounded: v })} label="Coins arrondis" /></Row>
        <Row title={`Rayon des coins (${s.radius}px)`} desc="Désactivé quand les coins arrondis sont éteints."><input type="range" min={0} max={20} value={s.radius} disabled={!s.rounded} onChange={(e) => update({ radius: +e.target.value })} /></Row>
        <Row title={`Taille du texte (${s.fontSize}px)`}><input type="range" min={10} max={24} value={s.fontSize} onChange={(e) => update({ fontSize: +e.target.value })} /></Row>
        <Row title="Effet Mica" desc="Windows 11 uniquement. Laissez désactivé sous Windows 10."><Switch on={s.mica} set={(v) => update({ mica: v })} label="Effet Mica" /></Row>
      </div>
      <h3>Disposition</h3>
      <div className="card"><Row title="Restaurer la disposition" desc="Remet les tailles et l’affichage des panneaux par défaut.">
        <button className="btn" onClick={() => update({ sidebarWidth: 260, panelHeight: 180, sidebarVisible: true, panelVisible: true })}>Restaurer</button></Row></div>
      <h3>Raccourcis clavier</h3>
      <div className="card">{all().filter((c) => c.keys).map((c) => <Row key={c.id} title={c.title}><kbd>{c.keys}</kbd></Row>)}</div>
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
