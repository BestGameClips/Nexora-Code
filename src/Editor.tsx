import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { Icon } from "./lib/icons";
import { runByKeys } from "./lib/commands";
import { getDocs, subscribeDocs, docModel, setActive, close, dismissError } from "./lib/docs";

(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = { getWorker: () => new EditorWorker() };

export function Workbench({ welcome, theme, fontSize }: { welcome: ReactNode; theme: string; fontSize: number }) {
  const st = useSyncExternalStore(subscribeDocs, getDocs);
  const host = useRef<HTMLDivElement>(null);
  const ed = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  useEffect(() => {
    const e = monaco.editor.create(host.current!, { model: null, automaticLayout: true, fontFamily: '"Cascadia Code", Consolas, monospace', fontSize, scrollBeyondLastLine: false, minimap: { enabled: true } });
    e.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, () => { runByKeys("Ctrl+Shift+P"); });
    ed.current = e;
    return () => e.dispose();
  }, []);
  useEffect(() => { ed.current?.setModel(st.active ? docModel(st.active) ?? null : null); }, [st.active]);
  useEffect(() => { monaco.editor.setTheme(theme === "dark" ? "vs-dark" : "vs"); }, [theme]);
  useEffect(() => { ed.current?.updateOptions({ fontSize }); }, [fontSize]);
  const has = st.tabs.length > 0;
  return (<>
    {st.error && <div className="banner" role="alert"><span>{st.error}</span><button onClick={dismissError}>Fermer</button></div>}
    {has && <div className="tabs" role="tablist">{st.tabs.map((t) => (
      <div key={t.path} role="tab" aria-selected={t.path === st.active} className="tab" title={t.path} onClick={() => setActive(t.path)} onAuxClick={() => close(t.path)}>
        <Icon n="file" size={14} /><span>{t.name}</span>{t.dirty && <i className="dot" role="img" aria-label="Modifications non enregistrées" />}
        <button aria-label={"Fermer " + t.name} onClick={(e) => { e.stopPropagation(); close(t.path); }}><Icon n="close" size={12} /></button>
      </div>))}</div>}
    <div className="host" ref={host} style={{ display: has ? "block" : "none" }} />
    {!has && <div className="scroll">{welcome}</div>}
  </>);
}
