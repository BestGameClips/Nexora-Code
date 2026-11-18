import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getSettings, subscribe, update, inTauri, type Mode } from "./lib/settings";
import { register, all, keyOf, runByKeys, fuzzy } from "./lib/commands";
import { Icon, type IconName } from "./lib/icons";
import { Explorer } from "./Explorer";
import { Sftp } from "./Sftp";
import { getSftp, subscribeSftp, disconnect } from "./lib/sftp";
import { Workbench } from "./Editor";
import { openFolder, save, saveAll, cycleTab, createFile, close as closeTab, getDocs, shiftTab, toggleEol, getCursor, subscribeCursor, subscribeDocs, basename } from "./lib/docs";
import { themeById, applyTheme } from "./lib/themes";
import { Gallery } from "./Gallery";
import { Welcome } from "./Welcome";
import { Extensions } from "./Extensions";
import { extOn } from "./lib/extensions";
import { buildPresence } from "./lib/presence";
import { FileIcon } from "./lib/fileicons";
import { MenuHost } from "./ContextMenu";
import { AskHost } from "./Ask";
import { newFileHere } from "./lib/sftpops";
import { NAME, SHORT } from "./lib/brand";
import logo from "./assets/logo@2x.png";
import { getDiscord, subscribeDiscord } from "./lib/discord";

type View = "explorer" | "settings" | "sftp" | "extensions" | "welcome";
const useSettings = () => useSyncExternalStore(subscribe, getSettings);
const FUTURE: [string, IconName][] = [["Recherche", "search"], ["Git", "git"], ["Débogage", "bug"]];

export function App() {
  const s = useSettings();
  const [view, setView] = useState<View>("explorer");
  const viewRef = useRef(view); viewRef.current = view;
  const [palette, setPalette] = useState(false);
  const [newFile, setNewFile] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [sysDark, setSysDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const f = () => setSysDark(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  const theme = s.mode === "system" ? (sysDark ? "dark" : "light") : s.mode;
  const themeDef = themeById(theme === "dark" ? s.darkTheme : s.lightTheme);
  useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = theme;
    applyTheme(themeDef);
    r.classList.toggle("mica", s.mica);
    r.style.setProperty("--fs", s.fontSize + "px");
    r.style.setProperty("--r", (s.rounded ? s.radius : 0) + "px");
    r.style.setProperty("--rl", (s.rounded ? s.radius * 1.5 : 0) + "px");
    r.style.setProperty("--rp", s.rounded ? "999px" : "0px");
  }, [theme, themeDef, s.mica, s.fontSize, s.rounded, s.radius]);

  useEffect(() => {
    register([
      { id: "ide.palette.open", title: "Ouvrir la palette de commandes", category: "Général", keys: "Ctrl+Shift+P", alias: ["F1"], run: () => setPalette(true) },
      { id: "ide.settings.open", title: "Ouvrir les paramètres", category: "Général", keys: "Ctrl+,", run: () => setView("settings") },
      { id: "ide.extensions.focus", title: "Afficher les extensions", category: "Extensions", keys: "Ctrl+Shift+X", run: () => { setView("extensions"); update({ sidebarVisible: true }); } },
      { id: "ide.welcome.open", title: "Ouvrir l’accueil", category: "Aide", run: () => setView("welcome") },
      { id: "ide.markdown.preview", title: "Aperçu Markdown : afficher/masquer", category: "Éditeur", keys: "Ctrl+Shift+V", run: () => { if (extOn("markdown")) update({ mdPreview: !getSettings().mdPreview }); } },
      { id: "ide.discord.toggle", title: "Discord : activer/désactiver la présence", category: "Discord", run: () => update({ discord: { ...getSettings().discord, enabled: !getSettings().discord.enabled } }) },
      { id: "ide.sftp.focus", title: "Afficher SFTP", category: "SFTP", keys: "Ctrl+Shift+Y", run: () => { setView("sftp"); update({ sidebarVisible: true }); } },
      { id: "ide.sftp.disconnect", title: "Se déconnecter du serveur SFTP", category: "SFTP", run: () => { disconnect(); } },
      { id: "ide.file.new", title: "Nouveau fichier…", category: "Fichier", keys: "Ctrl+N", run: () => { if (viewRef.current === "sftp" && getSftp().connected) newFileHere(); else setNewFile(true); } },
      { id: "ide.tab.moveLeft", title: "Déplacer l’onglet à gauche", category: "Fichier", keys: "Ctrl+Shift+PageUp", run: () => shiftTab(-1) },
      { id: "ide.tab.moveRight", title: "Déplacer l’onglet à droite", category: "Fichier", keys: "Ctrl+Shift+PageDown", run: () => shiftTab(1) },
      { id: "ide.file.saveAll", title: "Tout enregistrer", category: "Fichier", keys: "Ctrl+Shift+S", run: () => { saveAll(); } },
      { id: "ide.tab.next", title: "Onglet suivant", category: "Fichier", keys: "Ctrl+Tab", alias: ["Ctrl+PageDown"], run: () => cycleTab(1) },
      { id: "ide.tab.prev", title: "Onglet précédent", category: "Fichier", keys: "Ctrl+Shift+Tab", alias: ["Ctrl+PageUp"], run: () => cycleTab(-1) },
      { id: "ide.view.fullscreen", title: "Plein écran", category: "Affichage", keys: "F11", run: () => { if (inTauri) { const w = getCurrentWindow(); w.isFullscreen().then((f) => w.setFullscreen(!f)); } } },
      { id: "ide.zoom.in", title: "Agrandir le texte", category: "Affichage", keys: "Ctrl+=", alias: ["Ctrl++", "Ctrl+Shift++"], run: () => update({ fontSize: getSettings().fontSize + 1 }) },
      { id: "ide.zoom.out", title: "Réduire le texte", category: "Affichage", keys: "Ctrl+-", run: () => update({ fontSize: getSettings().fontSize - 1 }) },
      { id: "ide.zoom.reset", title: "Taille du texte par défaut", category: "Affichage", keys: "Ctrl+0", alias: ["Ctrl+Shift+0"], run: () => update({ fontSize: 14 }) },
      { id: "ide.editor.wrap", title: "Retour à la ligne automatique", category: "Éditeur", keys: "Alt+Z", run: () => update({ wordWrap: !getSettings().wordWrap }) },
      { id: "ide.editor.minimap", title: "Afficher/masquer la minimap", category: "Éditeur", run: () => update({ minimap: !getSettings().minimap }) },
      { id: "ide.editor.lineNumbers", title: "Afficher/masquer les numéros de ligne", category: "Éditeur", run: () => update({ lineNumbers: !getSettings().lineNumbers }) },
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
        <div className="brand" data-tauri-drag-region><img className="logoimg" src={logo} alt="" draggable={false} />{NAME}</div>
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
          <button title="SFTP (Ctrl+Maj+Y)" aria-pressed={view === "sftp"} onClick={() => { setView("sftp"); update({ sidebarVisible: true }); }}><Icon n="server" /></button>
          <button title="Extensions (Ctrl+Maj+X)" aria-pressed={view === "extensions"} onClick={() => { setView("extensions"); update({ sidebarVisible: true }); }}><Icon n="ext" /></button>
          {FUTURE.map(([n, ic]) => <button key={n} disabled title={n + " — prévu, pas encore disponible"}><Icon n={ic} /></button>)}
          <button className="bottom" title="Paramètres (Ctrl+,)" aria-pressed={view === "settings"} onClick={() => setView("settings")}><Icon n="gear" /></button>
        </nav>
        {s.sidebarVisible && <><aside className="sidebar" style={{ width: s.sidebarWidth }}>
          <h2>{view === "sftp" ? "SFTP" : view === "extensions" ? "Extensions" : "Explorateur"}</h2>
          {view === "sftp" ? <Sftp /> : view === "extensions" ? <Extensions /> : <Explorer />}
        </aside><div className="resizer v" onPointerDown={drag("x")} role="separator" aria-orientation="vertical" /></>}
        <main className="main">
          <div className="editor">
            <div className="scroll" style={{ display: view === "settings" ? "block" : "none" }}><Settings /></div>
            <div className="scroll" style={{ display: view === "welcome" ? "block" : "none" }}><Welcome onOpen={() => { setView("explorer"); update({ sidebarVisible: true }); openFolder(); }} onSftp={() => { setView("sftp"); update({ sidebarVisible: true }); }} /></div>
            <div className="workspace" style={{ display: view === "settings" || view === "welcome" ? "none" : "flex" }}><Workbench welcome={s.showWelcome ? <Welcome onOpen={() => { setView("explorer"); update({ sidebarVisible: true }); openFolder(); }} onSftp={() => { setView("sftp"); update({ sidebarVisible: true }); }} /> : <p className="page empty">Aucun fichier ouvert. Ctrl+O pour ouvrir un dossier.</p>} theme={themeDef} /></div></div>
          {s.panelVisible && <><div className="resizer h" onPointerDown={drag("y")} role="separator" aria-orientation="horizontal" />
            <section className="panel" style={{ height: s.panelHeight }}><h2>Journal</h2><p className="empty">Aucun transfert pour le moment. Le journal SFTP s’affichera ici.</p></section></>}
        </main>
      </div>
      <StatusBar themeName={themeDef.name} />
      <MenuHost />
      <AskHost />
      {newFile && <NewFile onClose={() => setNewFile(false)} />}
      {palette && <Palette onClose={() => setPalette(false)} />}
    </div>
  );
}


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
      <h3>Général</h3>
      <div className="card">
        <Row title="Langue" desc="Langue de l’interface (français ou anglais)."><div className="seg" role="radiogroup" aria-label="Langue">{(["fr", "en"] as const).map((l) => <button key={l} role="radio" aria-checked={s.language === l} onClick={() => update({ language: l })}>{l === "fr" ? "Français" : "English"}</button>)}</div></Row>
        <Row title="Afficher l’accueil" desc="Quand aucun fichier n’est ouvert."><Switch on={s.showWelcome} set={(v) => update({ showWelcome: v })} label="Afficher l’accueil" /></Row>
      </div>
      <h3>Thèmes sombres</h3><Gallery base="dark" /><h3>Thèmes clairs</h3><Gallery base="light" />
      <h3>Apparence</h3>
      <div className="card">
        <Row title="Thème" desc="Le mode automatique suit Windows.">
          <div className="seg" role="radiogroup" aria-label="Thème">{modes.map(([m, l]) => <button key={m} role="radio" aria-checked={s.mode === m} onClick={() => update({ mode: m })}>{l}</button>)}</div></Row>
        <Row title="Coins arrondis" desc="Arrondit les boutons, la barre de recherche, les champs et les menus."><Switch on={s.rounded} set={(v) => update({ rounded: v })} label="Coins arrondis" /></Row>
        <Row title={`Rayon des coins (${s.radius}px)`} desc="Désactivé quand les coins arrondis sont éteints."><input type="range" min={0} max={20} value={s.radius} disabled={!s.rounded} onChange={(e) => update({ radius: +e.target.value })} /></Row>
        <Row title={`Taille du texte (${s.fontSize}px)`}><input type="range" min={10} max={24} value={s.fontSize} onChange={(e) => update({ fontSize: +e.target.value })} /></Row>
        <Row title="Effet Mica" desc="Windows 11 uniquement. Laissez désactivé sous Windows 10."><Switch on={s.mica} set={(v) => update({ mica: v })} label="Effet Mica" /></Row>
      </div>
      <h3>Fichiers</h3>
      <div className="card">
        <Row title="Restaurer la session au démarrage" desc="Rouvre le dernier dossier et les onglets enregistrés."><Switch on={s.restoreSession} set={(v) => update({ restoreSession: v })} label="Restaurer la session" /></Row>
        <Row title="Enregistrement automatique" desc="Enregistre les fichiers locaux 1,5 s après la dernière frappe. Jamais appliqué aux fichiers distants."><Switch on={s.autoSave} set={(v) => update({ autoSave: v })} label="Enregistrement automatique" /></Row>
      </div>
      <h3>Éditeur</h3>
      <div className="card">
        <Row title="Numéros de ligne" desc="Affichés dans la marge de gauche."><Switch on={s.lineNumbers} set={(v) => update({ lineNumbers: v })} label="Numéros de ligne" /></Row>
        <Row title="Minimap"><Switch on={s.minimap} set={(v) => update({ minimap: v })} label="Minimap" /></Row>
        <Row title="Retour à la ligne automatique" desc="Raccourci : Alt+Z"><Switch on={s.wordWrap} set={(v) => update({ wordWrap: v })} label="Retour à la ligne" /></Row>
      </div>
      <h3>Icônes de fichiers</h3>
      <div className="card"><Row title="Jeu d’icônes" desc={extOn("icons") ? "Badges colorés par langage, ou icônes minimales." : "L’extension « Icônes de fichiers » est désactivée pour cet espace."}>
        <div className="seg" role="radiogroup" aria-label="Jeu d’icônes">{([["badges", "Badges"], ["minimal", "Minimal"], ["none", "Aucun"]] as const).map(([k, l]) => <button key={k} role="radio" aria-checked={s.iconPack === k} onClick={() => update({ iconPack: k })}>{l}</button>)}</div></Row></div>
      <h3>Discord Rich Presence</h3>
      <div className="card">
        {!extOn("discord") && <p className="sd pad">L’extension est désactivée pour cet espace de travail (onglet Extensions).</p>}
        <Row title="Identifiant d’application" desc="Créez une application sur discord.com/developers, copiez son « Application ID » (chiffres). Dans Rich Presence → Art Assets, ajoutez une image nommée « nexora »."><input type="text" inputMode="numeric" placeholder="ex. 123456789012345678" value={s.discord.clientId} onChange={(e) => update({ discord: { ...s.discord, clientId: e.target.value } })} /></Row>
        <Row title="Activer la présence" desc="Envoie votre activité à l’application Discord ouverte sur ce PC. Désactivez-la ici à tout moment."><Switch on={s.discord.enabled} set={(v) => update({ discord: { ...s.discord, enabled: v }, ...(v ? { extensions: { ...s.extensions, discord: true } } : {}) })} label="Présence Discord" /></Row>
        <Row title="État de la connexion"><DiscordStatusText /></Row>
        <Row title="Afficher le nom du fichier"><Switch on={s.discord.showFile} set={(v) => update({ discord: { ...s.discord, showFile: v } })} label="Nom du fichier" /></Row>
        <Row title="Afficher le nom du projet"><Switch on={s.discord.showProject} set={(v) => update({ discord: { ...s.discord, showProject: v } })} label="Nom du projet" /></Row>
        <Row title="Afficher le langage"><Switch on={s.discord.showLanguage} set={(v) => update({ discord: { ...s.discord, showLanguage: v } })} label="Langage" /></Row>
        <Row title="Afficher le temps écoulé"><Switch on={s.discord.showTime} set={(v) => update({ discord: { ...s.discord, showTime: v } })} label="Temps écoulé" /></Row>
        <Row title="Texte personnalisé"><input type="text" maxLength={64} value={s.discord.text} onChange={(e) => update({ discord: { ...s.discord, text: e.target.value } })} /></Row>
        <div className="srow"><PresenceCard /></div>
      </div>
      <h3>Disposition</h3>
      <div className="card"><Row title="Restaurer la disposition" desc="Remet les tailles et l’affichage des panneaux par défaut.">
        <button className="btn" onClick={() => update({ sidebarWidth: 260, panelHeight: 180, sidebarVisible: true, panelVisible: true })}>Restaurer</button></Row></div>
      <h3>Raccourcis clavier</h3>
      <div className="card">{all().filter((c) => c.keys).map((c) => <Row key={c.id} title={c.title}><span className="keys"><kbd>{c.keys}</kbd>{c.alias?.map((a) => <kbd key={a}>{a}</kbd>)}</span></Row>)}</div>
      <h3>Raccourcis de l’éditeur</h3>
      <div className="card">{EDITOR_KEYS.map(([t, k]) => <Row key={t} title={t}><kbd>{k}</kbd></Row>)}</div>
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

const EDITOR_KEYS: [string, string][] = [["Rechercher", "Ctrl+F"], ["Remplacer", "Ctrl+H"], ["Aller à la ligne", "Ctrl+G"], ["Sélectionner l’occurrence suivante", "Ctrl+D"], ["Annuler l’édition", "Ctrl+Z"], ["Rétablir", "Ctrl+Y"], ["Tout sélectionner", "Ctrl+A"], ["Commenter la ligne", "Ctrl+/"], ["Commentaire de bloc", "Maj+Alt+A"], ["Déplacer la ligne", "Alt+↑ / Alt+↓"], ["Dupliquer la ligne", "Maj+Alt+↑ / ↓"], ["Supprimer la ligne", "Ctrl+Maj+K"], ["Indenter / désindenter", "Ctrl+] / Ctrl+["], ["Replier / déplier", "Ctrl+Maj+[ / ]"], ["Curseur supplémentaire", "Alt+clic"]];


function StatusBar({ themeName }: { themeName: string }) {
  const c = useSyncExternalStore(subscribeCursor, getCursor);
  const sf = useSyncExternalStore(subscribeSftp, getSftp);
  const dc = useSyncExternalStore(subscribeDiscord, getDiscord);
  return <footer className="status"><span>{SHORT} v0.1.0</span>{sf.connected && <span>SFTP : {sf.connected.name}</span>}{dc.state === "connected" && <span title="Présence Discord active">Discord ●</span>}<span className="grow" />
    {c && <><span>Ln {c.ln}, Col {c.col}</span><span>{c.lang}</span><button className="sbtn" onClick={toggleEol} title="Changer les fins de ligne (LF/CRLF)">{c.eol}</button><span>Espaces : {c.tab}</span></>}<span>{themeName}</span></footer>;
}

function NewFile({ onClose }: { onClose: () => void }) {
  const [n, setN] = useState(""); const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return <div className="overlay" onMouseDown={onClose}><div className="palette" role="dialog" aria-label="Nouveau fichier" onMouseDown={(e) => e.stopPropagation()}>
    <input ref={ref} value={n} placeholder="Nom du fichier (ex. index.html)" onChange={(e) => setN(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); else if (e.key === "Enter" && n.trim()) { onClose(); createFile(n.trim()); } }} />
    <p className="empty hint">Créé à la racine du dossier ouvert. Entrée pour valider, Échap pour annuler.</p></div></div>;
}

function PresenceCard() {
  const s = useSettings();
  const d = useSyncExternalStore(subscribeDocs, getDocs); const c = useSyncExternalStore(subscribeCursor, getCursor);
  const file = d.active ? basename(d.active) : null;
  const p = buildPresence(s, file, c?.lang ?? null, d.root ? basename(d.root) : null);
  return <div className="presence" aria-label="Aperçu de la présence Discord"><FileIcon name={file ?? "x"} />
    <div><strong>{NAME}</strong><div>{p.details}</div>{p.state && <div className="sd">{p.state}</div>}<div className="sd">{p.showElapsed ? "Temps écoulé affiché" : "Temps masqué"}{p.smallImage ? ` · icône : ${p.smallImage}` : ""}</div></div></div>;
}

function DiscordStatusText() {
  const d = useSyncExternalStore(subscribeDiscord, getDiscord);
  return <span className={"tag" + (d.state === "connected" ? " on" : "")} role="status" title={d.message}>{d.state === "connected" ? "Connecté" : d.state === "connecting" ? "Connexion…" : d.state === "error" ? "Erreur : " + d.message.slice(0, 80) : d.message}</span>;
}
