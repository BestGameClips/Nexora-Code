import { useSyncExternalStore } from "react";
import { getSettings, subscribe, update, type Mode } from "./lib/settings";
import { tr, type K } from "./lib/i18n";
import { Gallery } from "./Gallery";
import { FileIcon, type IconPack } from "./lib/fileicons";

export function Welcome({ onOpen, onSftp }: { onOpen: () => void; onSftp: () => void }) {
  const s = useSyncExternalStore(subscribe, getSettings); const L = (k: K) => tr(s.language, k);
  const modes: [Mode, K][] = [["system", "sys"], ["light", "light"], ["dark", "dark"]];
  const packs: [IconPack, string][] = [["badges", "Badges"], ["minimal", "Minimal"], ["none", L("none")]];
  return (
    <div className="page"><h1>{L("title")}</h1><p className="lead">{L("lead")}</p>
      {!s.onboarded && <div className="banner first" role="status"><span>{L("first")}</span><button className="btn" onClick={() => update({ onboarded: true })}>{L("done")}</button></div>}
      <h3>{L("start")}</h3>
      <div className="row2"><button className="btn" onClick={onOpen}>{L("open")}</button><button onClick={onSftp}>{L("sftp")}</button></div>
      <h3>{L("custom")}</h3>
      <div className="card">
        <div className="srow"><div className="st">{L("language")}</div><div className="seg" role="radiogroup" aria-label={L("language")}>
          {(["fr", "en"] as const).map((l) => <button key={l} role="radio" aria-checked={s.language === l} onClick={() => update({ language: l })}>{l === "fr" ? "Français" : "English"}</button>)}</div></div>
        <div className="srow"><div className="st">{L("mode")}</div><div className="seg" role="radiogroup" aria-label={L("mode")}>
          {modes.map(([m, k]) => <button key={m} role="radio" aria-checked={s.mode === m} onClick={() => update({ mode: m })}>{L(k)}</button>)}</div></div>
        <div className="srow"><div className="st">{L("icons")}</div><div className="seg" role="radiogroup" aria-label={L("icons")}>
          {packs.map(([p, l]) => <button key={p} role="radio" aria-checked={s.iconPack === p} onClick={() => update({ iconPack: p })}>
            <span className="packprev">{["main.rs", "index.ts", "README.md"].map((n) => <FileIcon key={n} name={n} pack={p} />)}</span>{l}</button>)}</div></div>
      </div>
      <h3>{L("themes")}</h3><Gallery base="dark" /><div style={{ height: 10 }} /><Gallery base="light" />
      <label className="row2" style={{ marginTop: 16 }}><input type="checkbox" checked={s.showWelcome} onChange={(e) => update({ showWelcome: e.target.checked })} />{L("showStart")}</label>
      <p className="empty" style={{ marginTop: 16 }}>{L("keys")}</p>
    </div>
  );
}
