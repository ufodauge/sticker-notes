import { lazy, StrictMode, Suspense } from "react";
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

// debug builds only: `?samples` shows the scene's look on one page for a design review (left out
// of a production build with the rest of the debug code)
// (the build flag is written out here, not taken from debug-build.ts: a dynamic import is followed
// before constants from other modules are folded, so only this keeps the chunk out)
const Samples =
  import.meta.env.DEV || import.meta.env.VITE_DEBUG === "1"
    ? lazy(() => import("./ui/samples/Samples.tsx").then((m) => ({ default: m.Samples })))
    : null;
const samples = Samples !== null && new URLSearchParams(location.search).has("samples");

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      {Samples && samples ? (
        <Suspense fallback={null}>
          <Samples />
        </Suspense>
      ) : (
        <App />
      )}
    </StrictMode>,
  );
}
