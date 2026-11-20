import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { Icon } from "./lib/icons";
import { FileIcon } from "./lib/fileicons";
import { extOn } from "./lib/extensions";
import { MdPreview } from "./Markdown";
import { runByKeys } from "./lib/commands";
import { getDocs, subscribeDocs, docModel, setActive, close, dismissError, setCursor, closeOthers, closeRight, closeAll, moveTab, save } from "./lib/docs";
import { openMenu, type MenuItem } from "./ContextMenu";
import { trashLocal, revealInOs, copyText, relPath } from "./lib/fsops";
import { deleteEntry } from "./lib/sftpops";
import { parseRemoteKey, basename } from "./lib/docs";
import { getSettings, subscribe, update } from "./lib/settings";
import type { ThemeDef } from "./lib/themes";

(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = { getWorker: () => new EditorWorker() };

/** Menu du clic droit sur un onglet (le clic droit n'est plus traité comme un clic du milieu). */
function tabMenu(t: { path: string; name: string }): MenuItem[] {
  const r = parseRemoteKey(t.path), name = r ? basename(r.path) : t.name;
  return [
    { label: "Fermer", run: () => close(t.path) }, { label: "Fermer les autres", run: () => closeOthers(t.path) }, { label: "Fermer à droite", run: () => closeRight(t.path) }, { label: "Tout fermer", run: closeAll }, { sep: true },
    { label: "Enregistrer", run: () => { setActive(t.path); void save(); } }, { sep: true },
    { label: "Copier le nom", run: () => copyText(name) }, { label: "Copier le chemin", run: () => copyText(r ? r.path : t.path) },
    { label: "Copier le chemin relatif", disabled: !!r, run: () => copyText(relPath(t.path)) },
    { label: "Afficher dans l’explorateur Windows", disabled: !!r, run: () => revealInOs(t.path) }, { sep: true },
    { label: "Supprimer le fichier", danger: true, run: () => void (r ? deleteEntry(r.sid, { name, path: r.path, is_dir: false }) : trashLocal(t)) },
  ];
}

export function Workbench({ welcome, theme }: { welcome: ReactNode; theme: ThemeDef }) {
  const st = useSyncExternalStore(subscribeDocs, getDocs);
  const s = useSyncExternalStore(subscribe, getSettings);
  const host = useRef<HTMLDivElement>(null);
  const ed = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  useEffect(() => {
    const e = monaco.editor.create(host.current!, { model: null, automaticLayout: true, fontFamily: '"Cascadia Code", Consolas, monospace', fontSize: s.fontSize, scrollBeyondLastLine: false, lineNumbers: s.lineNumbers ? "on" : "off", minimap: { enabled: s.minimap }, wordWrap: s.wordWrap ? "on" : "off" });
    e.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, () => { runByKeys("Ctrl+Shift+P"); });
    e.addCommand(monaco.KeyCode.F1, () => { runByKeys("F1"); });
    const report = () => { const m = e.getModel(), p = e.getPosition(); if (!m || !p) return setCursor(null); setCursor({ ln: p.lineNumber, col: p.column, lang: m.getLanguageId(), eol: m.getEOL() === "\r\n" ? "CRLF" : "LF", tab: m.getOptions().tabSize }); };
    e.onDidChangeCursorPosition(report); e.onDidChangeModel(report);
    ed.current = e;
    return () => e.dispose();
  }, []);
  useEffect(() => { ed.current?.setModel(st.active ? docModel(st.active) ?? null : null); }, [st.active]);
  useEffect(() => {
    const v = theme.vars, id = "rustide-" + theme.id;
    monaco.editor.defineTheme(id, { base: theme.id.startsWith("hc") ? (theme.base === "dark" ? "hc-black" : "hc-light") : theme.base === "dark" ? "vs-dark" : "vs", inherit: true, rules: [],
      colors: { "editor.background": v.bg, "editor.foreground": v.fg, "editorGutter.background": v.bg, "editorLineNumber.foreground": v.fg2, "editorLineNumber.activeForeground": v.ac, "editor.lineHighlightBackground": v.bg2, "editor.selectionBackground": v.sel, "editorCursor.foreground": v.ac, "editorWidget.background": v.bg2, "minimap.background": v.bg } });
    monaco.editor.setTheme(id);
  }, [theme]);
  useEffect(() => { ed.current?.updateOptions({ fontSize: s.fontSize, lineNumbers: s.lineNumbers ? "on" : "off", minimap: { enabled: s.minimap }, wordWrap: s.wordWrap ? "on" : "off" }); }, [s.fontSize, s.lineNumbers, s.minimap, s.wordWrap]);
  const has = st.tabs.length > 0;
  const isMd = !!st.active && /\.(md|markdown)$/i.test(st.active) && extOn("markdown");
  const prev = isMd && s.mdPreview && st.active ? docModel(st.active) : undefined;
  return (<>
    {st.error && <div className="banner" role="alert"><span>{st.error}</span><button onClick={dismissError}>Fermer</button></div>}
    {has && <div className="tabs" role="tablist">{st.tabs.map((t) => (
      <div key={t.path} role="tab" aria-selected={t.path === st.active} className="tab" title={t.path} draggable onClick={() => setActive(t.path)} onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }} onAuxClick={(e) => { if (e.button === 1) close(t.path); }}
        onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.path); e.dataTransfer.effectAllowed = "move"; }} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDrop={(e) => { e.preventDefault(); moveTab(e.dataTransfer.getData("text/plain"), t.path); }}
        onContextMenu={(e) => { e.preventDefault(); setActive(t.path); openMenu(e.clientX, e.clientY, tabMenu(t)); }}>
        <FileIcon name={t.name} /><span>{t.name}</span>{t.dirty && <i className="dot" role="img" aria-label="Modifications non enregistrées" />}
        <button aria-label={"Fermer " + t.name} onClick={(e) => { e.stopPropagation(); close(t.path); }}><Icon n="close" size={12} /></button>
      </div>))}{isMd && <button className="tabact" aria-pressed={s.mdPreview} onClick={() => update({ mdPreview: !s.mdPreview })}>Aperçu</button>}</div>}
    <div className="split" style={{ display: has ? "flex" : "none" }}><div className="host" ref={host} />{prev && <MdPreview key={st.active} model={prev} />}</div>
    {!has && <div className="scroll">{welcome}</div>}
  </>);
}
