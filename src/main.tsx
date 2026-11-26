import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { keepAppUpdated } from "./data/app-update.ts";
import { listenForStickerLinks } from "./data/inbox.ts";
import "./index.css";
import { App } from "./ui/App.tsx";
import { listenForPrint } from "./ui/print-mode.ts";
import { listenForShine } from "./ui/shine.ts";
import { startDebug } from "./ui/debug.ts";
import { followClock } from "./ui/scene/clock.ts";
import { DEBUG_BUILD } from "./ui/debug-build.ts";
import { reportReceived } from "./ui/received.ts";

const links = new AbortController();
keepAppUpdated(links.signal);
listenForStickerLinks(reportReceived, links.signal);
listenForPrint(links.signal);
listenForShine(links.signal);
followClock(links.signal);
if (DEBUG_BUILD) void startDebug();
import.meta.hot?.dispose(() => links.abort());

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
