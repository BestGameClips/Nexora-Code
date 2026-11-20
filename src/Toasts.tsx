import { useSyncExternalStore } from "react";
import { Icon } from "./lib/icons";
import { getToasts, subscribeToasts, dismissToast } from "./lib/toast";
export function Toasts() {
  const t = useSyncExternalStore(subscribeToasts, getToasts);
  return <div className="toasts" aria-live="polite">{t.map((x) => (
    <div key={x.id} className={"toast " + x.level} role={x.level === "error" ? "alert" : "status"}><span>{x.msg}</span>
      <button aria-label="Fermer" onClick={() => dismissToast(x.id)}><Icon n="close" size={12} /></button></div>))}</div>;
}
