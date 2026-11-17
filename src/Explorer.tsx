import { useEffect, useState, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Icon } from "./lib/icons";
import { FileIcon } from "./lib/fileicons";
import { getDocs, subscribeDocs, openFile, openFolder, basename } from "./lib/docs";

interface Entry { name: string; path: string; is_dir: boolean; }
const sortE = (l: Entry[]) => [...l].sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name, undefined, { numeric: true }));

function Node({ e, depth }: { e: Entry; depth: number }) {
  const [open, setOpen] = useState(false);
  const [kids, setKids] = useState<Entry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const toggle = async () => {
    if (!e.is_dir) return void openFile(e.path);
    if (!open && kids === null) {
      try { setKids(sortE(await invoke<Entry[]>("list_dir", { path: e.path }))); setErr(null); } catch (x) { setErr(String(x)); }
    }
    setOpen(!open);
  };
  const pad = { paddingLeft: 6 + depth * 14 };
  return (<>
    <button className="tnode" style={pad} onClick={toggle} role="treeitem" aria-expanded={e.is_dir ? open : undefined}>
      <span className={"chev" + (open ? " open" : "")}>{e.is_dir && <Icon n="chev" size={12} />}</span>
      <FileIcon name={e.name} dir={e.is_dir} /><span className="tname">{e.name}</span>
    </button>
    {open && err && <div className="terr" style={pad}>{err}</div>}
    {open && kids && (kids.length === 0 ? <div className="tempty" style={{ paddingLeft: 28 + depth * 14 }}>Dossier vide</div> : kids.map((k) => <Node key={k.path} e={k} depth={depth + 1} />))}
  </>);
}

export function Explorer() {
  const { root, treeVersion } = useSyncExternalStore(subscribeDocs, getDocs);
  const [items, setItems] = useState<Entry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setItems(null); setErr(null);
    if (root) invoke<Entry[]>("list_dir", { path: root }).then((r) => setItems(sortE(r))).catch((e) => setErr(String(e)));
  }, [root, treeVersion]);
  if (!root) return (
    <div className="emptybox"><strong>Aucun dossier ouvert</strong><span>Ouvrez un dossier pour parcourir et modifier vos fichiers.</span>
      <button className="btn" onClick={openFolder}>Ouvrir un dossier</button></div>);
  return (<>
    <div className="rootname" title={root}><span>{basename(root)}</span><button onClick={openFolder} title="Ouvrir un autre dossier (Ctrl+O)">Changer</button></div>
    {err ? <div className="terr">{err}</div> : items === null ? <p className="empty">Chargement…</p>
      : items.length === 0 ? <p className="empty">Dossier vide</p>
      : <div role="tree">{items.map((e) => <Node key={e.path} e={e} depth={0} />)}</div>}
  </>);
}
