import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { keepAppUpdated } from "./data/app-update.ts";
import { listenForStickerLinks } from "./data/inbox.ts";
import "./index.css";
import { App } from "./ui/App.tsx";
import { listenForPrint } from "./ui/print-mode.ts";
import { listenForShine } from "./ui/shine.ts";
import { followRoomLight } from "./ui/album/lights.ts";
import { reportReceived } from "./ui/received.ts";

const links = new AbortController();
keepAppUpdated(links.signal);
listenForStickerLinks(reportReceived, links.signal);
listenForPrint(links.signal);
listenForShine(links.signal);
followRoomLight(links.signal);
import.meta.hot?.dispose(() => links.abort());

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
