import { update } from "./settings";
export interface LogEntry { t: number; level: "info" | "warn" | "error"; msg: string; }
export type Tab = "transfers" | "log";
let entries: LogEntry[] = []; let tab: Tab = "transfers"; const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const getLog = () => entries; export const getTab = () => tab;
export const subscribeLog = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const log = (level: LogEntry["level"], msg: string) => { entries = [...entries.slice(-499), { t: Date.now(), level, msg }]; emit(); };
export const clearLog = () => { entries = []; emit(); };
export const setTab = (t: Tab) => { tab = t; emit(); };
export const showPanel = (t: Tab) => { tab = t; update({ panelVisible: true }); emit(); };
