import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { listenForStickerLinks } from "./data/inbox.ts";
import "./index.css";
import { App } from "./ui/App.tsx";
import { listenForPrint } from "./ui/print-mode.ts";
import { reportReceived } from "./ui/received.ts";

registerSW({ immediate: true });

const links = new AbortController();
listenForStickerLinks(reportReceived, links.signal);
listenForPrint(links.signal);
import.meta.hot?.dispose(() => links.abort());

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
