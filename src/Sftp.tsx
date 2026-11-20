import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Icon } from "./lib/icons";
import { FileIcon } from "./lib/fileicons";
import { inTauri } from "./lib/settings";
import { openRemote } from "./lib/docs";
import { getSftp, subscribeSftp, loadProfiles, saveProfile, deleteProfile, connect, disconnect, cancelTrust, dismissSftpError, forgetHost, setSel, setCwd, closeAsk, refreshTree, withReconnect, importSshConfig, type Profile } from "./lib/sftp";
import { newFile, newFolder, renameEntry, deleteEntry } from "./lib/sftpops";
import { openMenu } from "./ContextMenu";
import { uploadFiles, uploadFolder, download } from "./lib/transfers";
import { showPanel } from "./lib/log";
import { copyText } from "./lib/toast";
import { _ } from "./lib/translate";

interface RE { name: string; path: string; is_dir: boolean; size: number; }
const sortE = (l: RE[]) => [...l].sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name, undefined, { numeric: true }));
const useS = <T,>(sel: () => T) => useSyncExternalStore(subscribeSftp, sel);

function RChildren({ sid, path, depth }: { sid: string; path: string; depth: number }) {
  const tick = useS(() => getSftp().tick);
  const [items, setItems] = useState<RE[] | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { withReconnect(() => invoke<RE[]>("sftp_list", { session: sid, path }), sid).then((r) => { setItems(sortE(r)); setErr(null); }).catch((e) => setErr(String(e))); }, [sid, path, tick]);
  if (err) return <div className="terr">{err}</div>;
  if (!items) return <p className="empty">Chargement…</p>;
  if (!items.length) return <p className="empty">Dossier vide</p>;
  return <>{items.map((e) => <RNode key={e.path} sid={sid} e={e} depth={depth} />)}</>;
}

function RNode({ sid, e, depth }: { sid: string; e: RE; depth: number }) {
  const [open, setOpen] = useState(false);
  const cwd = useS(() => getSftp().sessions[sid]?.cwd ?? null), reveal = useS(() => getSftp().reveal);
  useEffect(() => { if (e.is_dir && reveal?.sid === sid && reveal.path === e.path) setOpen(true); }, [reveal]);
  const parent = e.path.replace(/\/[^/]*$/, "") || "/";
  const select = () => { setCwd(e.is_dir ? e.path : parent, sid); setSel(e, sid); };
  const click = () => { select(); if (e.is_dir) setOpen(!open); else void openRemote(sid, e.path); };
  const menu = (ev: React.MouseEvent) => {
    ev.preventDefault(); select();
    openMenu(ev.clientX, ev.clientY, [
      ...(e.is_dir ? [{ label: "Nouveau fichier ici", run: () => newFile(sid, e.path) }, { label: "Nouveau dossier ici", run: () => newFolder(sid, e.path) }, { label: "Envoyer des fichiers ici…", run: () => void uploadFiles(sid, e.path) }, { label: "Envoyer un dossier ici…", run: () => void uploadFolder(sid, e.path) }, { sep: true }] : [{ label: "Ouvrir", run: () => void openRemote(sid, e.path) }]),
      { label: "Télécharger…", run: () => void download(sid, e) }, { label: "Renommer", run: () => renameEntry(sid, e) }, { label: "Supprimer", danger: true, run: () => void deleteEntry(sid, e) }, { sep: true },
      { label: "Copier le nom", run: () => copyText(e.name) }, { label: "Copier le chemin", run: () => copyText(e.path) }]);
  };
  return (<>
    <div className="trow" onContextMenu={menu}>
      <button className={"tnode" + (cwd === e.path ? " sel" : "")} style={{ paddingLeft: 6 + depth * 14 }} onClick={click} role="treeitem" aria-expanded={e.is_dir ? open : undefined}>
        <span className={"chev" + (open ? " open" : "")}>{e.is_dir && <Icon n="chev" size={12} />}</span><FileIcon name={e.name} dir={e.is_dir} /><span className="tname">{e.name}</span></button>
      <span className="ract">
        {e.is_dir && <><button aria-label={"Nouveau fichier dans " + e.name} title="Nouveau fichier" onClick={() => newFile(sid, e.path)}><Icon n="plus" size={13} /></button>
          <button aria-label={"Nouveau dossier dans " + e.name} title="Nouveau dossier" onClick={() => newFolder(sid, e.path)}><Icon n="folderplus" size={13} /></button></>}
        <button aria-label={"Renommer " + e.name} title="Renommer" onClick={() => renameEntry(sid, e)}><Icon n="pen" size={13} /></button>
        <button aria-label={"Supprimer " + e.name} title="Supprimer" onClick={() => void deleteEntry(sid, e)}><Icon n="trash" size={13} /></button>
      </span>
    </div>
    {open && e.is_dir && <RChildren sid={sid} path={e.path} depth={depth + 1} />}
  </>);
}

/** Une connexion ouverte : en-tête, barre d'outils et arborescence. Plusieurs peuvent être ouvertes en même temps. */
function SessionView({ sid }: { sid: string }) {
  const s = useSyncExternalStore(subscribeSftp, getSftp); const ss = s.sessions[sid]; if (!ss) return null;
  const prof = s.profiles.find((p) => p.id === sid); const here = ss.cwd ?? ss.home;
  return (
    <div className={"sess" + (s.active === sid ? " act" : "")} onClick={() => s.active !== sid && setCwd(here, sid)}>
      <div className="rootname"><span title={prof ? `${prof.user}@${prof.host}:${prof.port}` : ""}>{ss.name}</span><button onClick={() => void disconnect(sid)}>Déconnecter</button></div>
      <div className="pathbar" title={here}>{here}</div>
      <div className="row2 tools"><button onClick={() => newFile(sid, here)} title="Nouveau fichier"><Icon n="plus" size={14} /></button><button onClick={() => newFolder(sid, here)} title="Nouveau dossier"><Icon n="folderplus" size={14} /></button>
        <button className="btn" onClick={(ev) => { const r = ev.currentTarget.getBoundingClientRect(); openMenu(r.left, r.bottom + 2, [{ label: "Envoyer des fichiers ici…", run: () => void uploadFiles(sid, here) }, { label: "Envoyer un dossier ici…", run: () => void uploadFolder(sid, here) }, { sep: true }, { label: "Télécharger la sélection…", disabled: !ss.sel, run: () => ss.sel && void download(sid, ss.sel) }, { sep: true }, { label: "Afficher les transferts et le journal", run: () => showPanel("transfers") }]); }}><Icon n="transfer" size={14} /> Transférer</button>
        <button onClick={refreshTree} title="Actualiser"><Icon n="refresh" size={14} /></button></div>
      <div role="tree"><RChildren sid={sid} path={ss.home} depth={0} /></div>
    </div>
  );
}

const blank = (): Profile => ({ id: crypto.randomUUID(), name: "", host: "", port: 22, user: "", auth: "password", key_path: "" });

export function Sftp() {
  const s = useSyncExternalStore(subscribeSftp, getSftp);
  const [form, setForm] = useState<Profile | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  useEffect(() => { loadProfiles(); }, []);
  if (!inTauri) return <p className="empty">Le SFTP n’est disponible que dans l’application installée.</p>;
  const go = (id: string) => { const sec = secret; setSecret(""); setAsking(null); connect(id, sec); };
  const submit = async () => {
    if (!form) return;
    if (!form.name.trim() || !form.host.trim() || !form.user.trim() || !(form.port > 0 && form.port < 65536) || (form.auth === "key" && !form.key_path?.trim())) return;
    if (await saveProfile({ ...form, name: form.name.trim(), host: form.host.trim(), user: form.user.trim() })) setForm(null);
  };
  return (<>
    {s.ask && <AskName />}
    {s.notice && <div className="banner col" role="status"><span>{s.notice}</span><span className="row2"><button onClick={dismissSftpError}>Fermer</button></span></div>}
    {s.error && <div className="banner col" role="alert"><span>{s.error}</span><span className="row2">
      {s.changedFor && <button onClick={() => forgetHost(s.changedFor!)}>Oublier l’ancienne empreinte</button>}<button onClick={dismissSftpError}>Fermer</button></span></div>}
    {s.trust && <div className="emptybox"><strong>Nouveau serveur</strong><span>Empreinte SHA256 :</span><code className="fp">{s.trust.fp}</code>
      <span>Vérifiez-la auprès de l’administrateur avant d’accepter.</span>
      <button className="btn" onClick={() => connect(s.trust!.id, s.trust!.secret, s.trust!.fp)}>Faire confiance et se connecter</button><button onClick={cancelTrust}>Annuler</button></div>}
    {s.order.map((sid) => <SessionView key={sid} sid={sid} />)}
    {form ? (
      <div className="sform">
        <input placeholder="Nom (ex. Mon serveur)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Hôte (ex. 192.168.1.10)" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
        <input type="number" placeholder="Port" value={form.port} onChange={(e) => setForm({ ...form, port: +e.target.value })} />
        <input placeholder="Utilisateur" value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} />
        <select value={form.auth} onChange={(e) => setForm({ ...form, auth: e.target.value as Profile["auth"] })}><option value="password">Mot de passe</option><option value="key">Clé privée</option></select>
        {form.auth === "key" && <div className="row2"><input placeholder="Chemin de la clé privée" value={form.key_path ?? ""} onChange={(e) => setForm({ ...form, key_path: e.target.value })} />
          <button onClick={async () => { const f = await open({ multiple: false }); if (typeof f === "string") setForm({ ...form, key_path: f }); }}>…</button></div>}
        <span className="empty">Le mot de passe n’est jamais enregistré : il est demandé à chaque connexion.</span>
        <div className="row2"><button className="btn" onClick={submit}>Enregistrer</button><button onClick={() => setForm(null)}>Annuler</button></div>
      </div>
    ) : (<>
      {s.order.length > 0 && <h2>Connexions</h2>}
      {s.profiles.length === 0 ? <div className="emptybox"><strong>Aucune connexion</strong><span>Ajoutez un serveur pour modifier ses fichiers à distance.</span></div>
        : s.profiles.map((p) => (
          <div key={p.id} className="prof"><div><strong>{p.name}</strong> {s.sessions[p.id] && <span className="tag on">Connecté</span>}<div className="empty">{p.user}@{p.host}:{p.port}</div></div>
            {asking === p.id ? (
              <div className="sform"><input type="password" autoFocus placeholder={p.auth === "key" ? "Phrase secrète (facultatif)" : "Mot de passe"} value={secret} onChange={(e) => setSecret(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go(p.id)} />
                <div className="row2"><button className="btn" onClick={() => go(p.id)}>Connexion</button><button onClick={() => { setAsking(null); setSecret(""); }}>Annuler</button></div></div>
            ) : (<div className="row2">
              {s.sessions[p.id] ? <button onClick={() => void disconnect(p.id)}>Déconnecter</button> : <button className="btn" disabled={s.busy !== null} onClick={() => setAsking(p.id)}>{s.busy === p.id ? "…" : "Connecter"}</button>}
              <button onClick={() => setForm(p)}>Modifier</button><button onClick={() => window.confirm(_("Supprimer « {name} » ?", { name: p.name })) && deleteProfile(p.id)}>Supprimer</button></div>)}
          </div>))}
      <div className="row2" style={{ marginTop: 10 }}><button className="btn" onClick={() => setForm(blank())}>Nouvelle connexion</button><button onClick={importSshConfig} title="Importer vos serveurs déjà configurés dans ~/.ssh/config">Importer ~/.ssh/config</button></div>
    </>)}
  </>);
}

function AskName() {
  const a = getSftp().ask!; const [v, setV] = useState(a.initial); const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const ok = () => { const n = v.trim(); closeAsk(); if (n) a.run(n); };
  return <div className="overlay" onMouseDown={closeAsk}><div className="palette" role="dialog" aria-label={a.title} onMouseDown={(e) => e.stopPropagation()}>
    <input ref={ref} value={v} placeholder={a.title} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") closeAsk(); else if (e.key === "Enter") ok(); }} />
    <p className="empty hint">{a.title} : Entrée pour valider, Échap pour annuler.</p></div></div>;
}
