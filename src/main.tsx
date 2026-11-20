import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App";
import { loadSettings, getSettings, subscribe } from "./lib/settings";
import { startDiscordSync } from "./lib/discord";
import { restoreSession } from "./lib/docs";
import { initTransfers } from "./lib/transfers";
import { setLanguage } from "./lib/translate";
loadSettings().then(() => {
  setLanguage(getSettings().language); subscribe(() => setLanguage(getSettings().language));
  startDiscordSync(); createRoot(document.getElementById("root")!).render(<App />); void restoreSession(); initTransfers();
});
