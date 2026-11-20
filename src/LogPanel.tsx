import { useSyncExternalStore } from "react";
import { Icon } from "./lib/icons";
import { getJobs, subscribeJobs, cancelJob, retryJob, clearFinished, type Job } from "./lib/transfers";
import { getLog, subscribeLog, clearLog, getTab, setTab } from "./lib/log";

const fmt = (n: number) => (n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(1) + " MB");
const LABEL: Record<Job["state"], string> = { queued: "En attente", running: "En cours", done: "Terminé", error: "Erreur", cancelled: "Annulé", skipped: "Ignoré (existe déjà)" };
const time = (t: number) => new Date(t).toLocaleTimeString();

export function LogPanel() {
  const jobs = useSyncExternalStore(subscribeJobs, getJobs), entries = useSyncExternalStore(subscribeLog, getLog), tab = useSyncExternalStore(subscribeLog, getTab);
  const active = jobs.filter((j) => j.state === "queued" || j.state === "running").length;
  return (<>
    <div className="row2 phead">
      <div className="seg" role="tablist"><button role="tab" aria-selected={tab === "transfers"} aria-checked={tab === "transfers"} onClick={() => setTab("transfers")}>{`Transferts (${active})`}</button>
        <button role="tab" aria-selected={tab === "log"} aria-checked={tab === "log"} onClick={() => setTab("log")}>Journal</button></div>
      <span style={{ flex: 1 }} />
      {tab === "transfers" ? <button onClick={clearFinished}>Effacer les terminés</button> : <button onClick={clearLog}>Effacer le journal</button>}
    </div>
    {tab === "transfers" ? (jobs.length === 0 ? <p className="empty">Aucun transfert.</p> : jobs.map((j) => {
      const pct = j.size > 0 ? Math.min(100, Math.round((j.done / j.size) * 100)) : j.state === "done" ? 100 : 0;
      return (<div className="job" key={j.id}><Icon n={j.dir === "up" ? "upload" : "download"} size={14} />
        <div className="jmain"><div className="jname" title={j.remote}>{j.name}</div><div className="jbar"><i className={j.state} style={{ width: pct + "%" }} /></div>{j.error && <div className="terr">{j.error}</div>}</div>
        <span className="jst">{j.state === "running" ? `${pct} % · ${fmt(j.done)} / ${fmt(j.size)}` : LABEL[j.state]}</span>
        {(j.state === "queued" || j.state === "running") && <button onClick={() => cancelJob(j.id)}>Annuler</button>}
        {(j.state === "error" || j.state === "cancelled") && <button onClick={() => retryJob(j.id)}>Réessayer</button>}</div>);
    })) : (entries.length === 0 ? <p className="empty">Aucune entrée dans le journal.</p> : [...entries].reverse().map((e, i) => (
      <div className={"logrow " + e.level} key={i}><span className="lt">{time(e.t)}</span><span>{e.msg}</span></div>)))}
  </>);
}
