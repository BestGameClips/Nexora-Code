import { useEffect, useState, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Icon } from "./lib/icons";
import { FileIcon } from "./lib/fileicons";
import { openMenu } from "./ContextMenu";
import { getDocs, subscribeDocs, openFile, openFolder, basename, setLocalCwd, refreshLocal } from "./lib/docs";
import { newFileIn, newFolderIn, renameLocal, trashLocal, revealInOs } from "./lib/fsops";

interface Entry { name: string; path: string; is_dir: boolean; }
const sortE = (l: Entry[]) => [...l].sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name, undefined, { numeric: true }));
const useDocs = <T,>(sel: () => T) => useSyncExternalStore(subscribeDocs, sel);

function Children({ path, depth }: { path: string; depth: number }) {
  const tick = useDocs(() => getDocs().treeVersion);
  const [items, setItems] = useState<Entry[] | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { invoke<Entry[]>("list_dir", { path }).then((r) => { setItems(sortE(r)); setErr(null); }).catch((e) => setErr(String(e))); }, [path, tick]);
  if (err) return <div className="terr">{err}</div>;
  if (!items) return <p className="empty">Chargement…</p>;
  if (!items.length) return <p className="empty">Dossier vide</p>;
  return <>{items.map((e) => <Node key={e.path} e={e} depth={depth} />)}</>;
}

function Node({ e, depth }: { e: Entry; depth: number }) {
  const [open, setOpen] = useState(false);
  const cwd = useDocs(() => getDocs().cwd), reveal = useDocs(() => getDocs().reveal);
  useEffect(() => { if (e.is_dir && reveal?.path === e.path) setOpen(true); }, [reveal]);
  const parent = e.path.replace(/[\\/][^\\/]*$/, "");
  const select = () => setLocalCwd(e.is_dir ? e.path : parent);
  const click = () => { select(); if (e.is_dir) setOpen(!open); else void openFile(e.path); };
  const menu = (ev: React.MouseEvent) => {
    ev.preventDefault(); select();
    openMenu(ev.clientX, ev.clientY, [
      ...(e.is_dir ? [{ label: "Nouveau fichier ici", run: () => newFileIn(e.path) }, { label: "Nouveau dossier ici", run: () => newFolderIn(e.path) }, { sep: true }] : [{ label: "Ouvrir", run: () => void openFile(e.path) }]),
      { label: "Renommer", run: () => renameLocal(e) }, { label: "Mettre à la corbeille", danger: true, run: () => void trashLocal(e) }, { sep: true },
      { label: "Afficher dans l’explorateur Windows", run: () => revealInOs(e.path) }, { label: "Copier le chemin", run: () => void navigator.clipboard.writeText(e.path) }]);
  };
  return (<>
    <div className="trow" onContextMenu={menu}>
      <button className={"tnode" + (cwd === e.path ? " sel" : "")} style={{ paddingLeft: 6 + depth * 14 }} onClick={click} role="treeitem" aria-expanded={e.is_dir ? open : undefined}>
        <span className={"chev" + (open ? " open" : "")}>{e.is_dir && <Icon n="chev" size={12} />}</span><FileIcon name={e.name} dir={e.is_dir} /><span className="tname">{e.name}</span></button>
      <span className="ract">
        {e.is_dir && <><button aria-label={"Nouveau fichier dans " + e.name} title="Nouveau fichier" onClick={() => newFileIn(e.path)}><Icon n="plus" size={13} /></button>
          <button aria-label={"Nouveau dossier dans " + e.name} title="Nouveau dossier" onClick={() => newFolderIn(e.path)}><Icon n="folderplus" size={13} /></button></>}
        <button aria-label={"Renommer " + e.name} title="Renommer" onClick={() => renameLocal(e)}><Icon n="pen" size={13} /></button>
        <button aria-label={"Mettre à la corbeille " + e.name} title="Mettre à la corbeille" onClick={() => void trashLocal(e)}><Icon n="trash" size={13} /></button>
      </span>
    </div>
    {open && e.is_dir && <Children path={e.path} depth={depth + 1} />}
  </>);
}

export function Explorer() {
  const root = useDocs(() => getDocs().root), cwd = useDocs(() => getDocs().cwd);
  if (!root) return (
    <div className="emptybox"><strong>Aucun dossier ouvert</strong><span>Ouvrez un dossier pour parcourir et modifier vos fichiers.</span>
      <button className="btn" onClick={openFolder}>Ouvrir un dossier</button></div>);
  const here = cwd ?? root;
  return (<>
    <div className="rootname" title={root}><span>{basename(root)}</span><button onClick={openFolder} title="Ouvrir un autre dossier (Ctrl+O)">Changer</button></div>
    <div className="row2 tools"><button onClick={() => newFileIn(here)} title="Nouveau fichier"><Icon n="plus" size={14} /></button><button onClick={() => newFolderIn(here)} title="Nouveau dossier"><Icon n="folderplus" size={14} /></button><button onClick={refreshLocal} title="Actualiser"><Icon n="refresh" size={14} /></button></div>
    <div role="tree" key={root}><Children path={root} depth={0} /></div>
  </>);
}
