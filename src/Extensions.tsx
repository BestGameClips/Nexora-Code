import { useSyncExternalStore } from "react";
import { getSettings, subscribe, update } from "./lib/settings";
import { getDocs, subscribeDocs, basename } from "./lib/docs";
import { getSftp, subscribeSftp } from "./lib/sftp";
import { EXTS, wsKey, setWs } from "./lib/extensions";

export function Extensions() {
  const s = useSyncExternalStore(subscribe, getSettings);
  const d = useSyncExternalStore(subscribeDocs, getDocs);
  const f = useSyncExternalStore(subscribeSftp, getSftp);
  const ws = wsKey(d.root, f.connected?.id ?? null);
  return (<>
    <p className="empty">Modules intégrés à l’application. {ws ? <>Espace de travail : <strong>{d.root ? basename(d.root) : f.connected?.name}</strong></> : "Ouvrez un dossier ou connectez un serveur pour régler chaque espace séparément."}</p>
    {EXTS.map((x) => {
      const g = s.extensions[x.id] ?? x.defaultOn, o = ws ? s.wsExt[ws]?.[x.id] : undefined, on = o ?? g;
      return (<div key={x.id} className="prof">
        <div><strong>{x.name}</strong> <span className={"tag" + (on ? " on" : "")}>{on ? "Activée" : "Désactivée"}{o !== undefined ? " · espace" : ""}</span><div className="empty">{x.desc}</div></div>
        <label className="row2"><input type="checkbox" checked={g} onChange={(e) => update({ extensions: { ...s.extensions, [x.id]: e.target.checked } })} />Activée globalement</label>
        {ws && <div className="row2">
          <button disabled={o === true} onClick={() => setWs(ws, x.id, true)}>Activer ici</button>
          <button disabled={o === false} onClick={() => setWs(ws, x.id, false)}>Désactiver ici</button>
          {o !== undefined && <button onClick={() => setWs(ws, x.id, null)}>Hériter</button>}</div>}
      </div>);
    })}
  </>);
}
