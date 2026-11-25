import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { keepAppUpdated } from "./data/app-update.ts";
import { listenForStickerLinks } from "./data/inbox.ts";
import "./index.css";
import { App } from "./ui/App.tsx";
import { listenForPrint } from "./ui/print-mode.ts";
import { reportReceived } from "./ui/received.ts";

const links = new AbortController();
keepAppUpdated(links.signal);
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
