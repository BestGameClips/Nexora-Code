import { useEffect, useState, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Icon } from "./lib/icons";
import { FileIcon } from "./lib/fileicons";
import { inTauri } from "./lib/settings";
import { openRemote } from "./lib/docs";
import { getSftp, subscribeSftp, loadProfiles, saveProfile, deleteProfile, connect, disconnect, cancelTrust, dismissSftpError, forgetHost, type Profile } from "./lib/sftp";

interface RE { name: string; path: string; is_dir: boolean; size: number; }
const sortE = (l: RE[]) => [...l].sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name, undefined, { numeric: true }));

function RChildren({ path, depth }: { path: string; depth: number }) {
  const [items, setItems] = useState<RE[] | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { invoke<RE[]>("sftp_list", { path }).then((r) => setItems(sortE(r))).catch((e) => setErr(String(e))); }, [path]);
  if (err) return <div className="terr">{err}</div>;
  if (!items) return <p className="empty">Chargement…</p>;
  if (!items.length) return <p className="empty">Dossier vide</p>;
  return <>{items.map((e) => <RNode key={e.path} e={e} depth={depth} />)}</>;
}
function RNode({ e, depth }: { e: RE; depth: number }) {
  const [open, setOpen] = useState(false);
  return (<>
    <button className="tnode" style={{ paddingLeft: 6 + depth * 14 }} onClick={() => (e.is_dir ? setOpen(!open) : void openRemote(e.path))} role="treeitem" aria-expanded={e.is_dir ? open : undefined}>
      <span className={"chev" + (open ? " open" : "")}>{e.is_dir && <Icon n="chev" size={12} />}</span><FileIcon name={e.name} dir={e.is_dir} /><span className="tname">{e.name}</span></button>
    {open && e.is_dir && <RChildren path={e.path} depth={depth + 1} />}
  </>);
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
    {s.error && <div className="banner col" role="alert"><span>{s.error}</span><span className="row2">
      {s.changedFor && <button onClick={() => forgetHost(s.changedFor!)}>Oublier l’ancienne empreinte</button>}<button onClick={dismissSftpError}>Fermer</button></span></div>}
    {s.trust && <div className="emptybox"><strong>Nouveau serveur</strong><span>Empreinte SHA256 :</span><code className="fp">{s.trust.fp}</code>
      <span>Vérifiez-la auprès de l’administrateur avant d’accepter.</span>
      <button className="btn" onClick={() => connect(s.trust!.id, s.trust!.secret, s.trust!.fp)}>Faire confiance et se connecter</button><button onClick={cancelTrust}>Annuler</button></div>}
    {s.connected ? (<>
      <div className="rootname"><span title={s.connected.home}>{s.connected.name}</span><button onClick={disconnect}>Déconnecter</button></div>
      <div role="tree" key={s.connected.id}><RChildren path={s.connected.home} depth={0} /></div>
    </>) : form ? (
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
      {s.profiles.length === 0 ? <div className="emptybox"><strong>Aucune connexion</strong><span>Ajoutez un serveur pour modifier ses fichiers à distance.</span></div>
        : s.profiles.map((p) => (
          <div key={p.id} className="prof"><div><strong>{p.name}</strong><div className="empty">{p.user}@{p.host}:{p.port}</div></div>
            {asking === p.id ? (
              <div className="sform"><input type="password" autoFocus placeholder={p.auth === "key" ? "Phrase secrète (facultatif)" : "Mot de passe"} value={secret} onChange={(e) => setSecret(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go(p.id)} />
                <div className="row2"><button className="btn" onClick={() => go(p.id)}>Connexion</button><button onClick={() => { setAsking(null); setSecret(""); }}>Annuler</button></div></div>
            ) : (<div className="row2"><button className="btn" disabled={s.busy} onClick={() => setAsking(p.id)}>{s.busy ? "…" : "Connecter"}</button>
              <button onClick={() => setForm(p)}>Modifier</button><button onClick={() => window.confirm(`Supprimer « ${p.name} » ?`) && deleteProfile(p.id)}>Supprimer</button></div>)}
          </div>))}
      <button className="btn" style={{ marginTop: 10 }} onClick={() => setForm(blank())}>Nouvelle connexion</button>
    </>)}
  </>);
}
