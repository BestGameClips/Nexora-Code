import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App";
import { loadSettings } from "./lib/settings";
import { startDiscordSync } from "./lib/discord";
loadSettings().then(() => { startDiscordSync(); createRoot(document.getElementById("root")!).render(<App />); });
