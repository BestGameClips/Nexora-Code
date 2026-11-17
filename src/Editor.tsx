import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { Icon } from "./lib/icons";
import { runByKeys } from "./lib/commands";
import { getDocs, subscribeDocs, docModel, setActive, close, dismissError, setCursor } from "./lib/docs";
import { getSettings, subscribe } from "./lib/settings";
import type { ThemeDef } from "./lib/themes";

(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = { getWorker: () => new EditorWorker() };

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
  return (<>
    {st.error && <div className="banner" role="alert"><span>{st.error}</span><button onClick={dismissError}>Fermer</button></div>}
    {has && <div className="tabs" role="tablist">{st.tabs.map((t) => (
      <div key={t.path} role="tab" aria-selected={t.path === st.active} className="tab" title={t.path} onClick={() => setActive(t.path)} onAuxClick={() => close(t.path)}>
        <Icon n={t.path.startsWith("sftp:") ? "server" : "file"} size={14} /><span>{t.name}</span>{t.dirty && <i className="dot" role="img" aria-label="Modifications non enregistrées" />}
        <button aria-label={"Fermer " + t.name} onClick={(e) => { e.stopPropagation(); close(t.path); }}><Icon n="close" size={12} /></button>
      </div>))}</div>}
    <div className="host" ref={host} style={{ display: has ? "block" : "none" }} />
    {!has && <div className="scroll">{welcome}</div>}
  </>);
}
