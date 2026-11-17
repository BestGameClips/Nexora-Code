import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App";
import { loadSettings } from "./lib/settings";
loadSettings().then(() => createRoot(document.getElementById("root")!).render(<App />));
