import {
  DONE,
  advance,
  chooseFlow,
  sampleStickers,
  type TutorialEvent,
  type TutorialState,
} from "../../core/tutorial.ts";
import { settings, stickerStore, type Ready } from "../../data/sticker-store.ts";
import { testFlag } from "../../data/test-flags.ts";
import { carry } from "../album/carry.ts";
import { pagePosition } from "../album/page-position.ts";
import { DEBUG_BUILD } from "../debug-build.ts";

// The first time through: which way (and how far) it has got, moved on by what is done in the
// album as it is done.

type Listener = () => void;
const state: { value: TutorialState | null; listeners: Set<Listener> } = {
  value: null,
  listeners: new Set(),
};

function publish(next: TutorialState, save = true): void {
  if (state.value === next) return;
  state.value = next;
  state.listeners.forEach((l) => l());
  if (save) void settings.set("tutorial", next).catch(() => {});
}

export const tutorial = {
  subscribe: (l: Listener): (() => void) => {
    state.listeners.add(l);
    return () => state.listeners.delete(l);
  },
  // null until it is known whether there is one
  get: (): TutorialState | null => state.value,
  event: (e: TutorialEvent): void => {
    if (state.value) publish(advance(state.value, e));
  },
  close: (): void => publish(DONE),
};

const readyStore = (): Promise<Ready> =>
  new Promise((resolve) => {
    const check = () => {
      const snap = stickerStore.getSnapshot();
      if (snap.status !== "ready") return false;
      resolve(snap);
      return true;
    };
    if (check()) return;
    const stop = stickerStore.subscribe(() => {
      if (check()) stop();
    });
  });

// where every sticker lies: a change is a sticker put down somewhere
const layoutOf = (snap: Ready) =>
  snap.placements.map((p) => `${p.id}:${p.pageId}:${p.x.toFixed(3)}:${p.y.toFixed(3)}`).join("|");

export function startTutorial(arrivedByLink: boolean, signal: AbortSignal): void {
  if (DEBUG_BUILD && testFlag("skip-tutorial")) {
    publish(DONE, false);
    return;
  }
  void Promise.all([settings.get("tutorial").catch(() => null), readyStore()]).then(
    async ([saved, snap]) => {
      const first = chooseFlow({ saved, stickers: snap.stickers.length, arrivedByLink });
      if (!saved && "flow" in first && first.flow === "start") {
        await stickerStore.seedSamples(sampleStickers());
      }
      publish(first);
      if ("done" in first || signal.aborted) return;
      follow(signal);
    },
  );
}

function follow(signal: AbortSignal): void {
  const last = {
    held: carry.held() !== null,
    flipped: pagePosition.get().flipped,
    layout: (() => {
      const snap = stickerStore.getSnapshot();
      return snap.status === "ready" ? layoutOf(snap) : "";
    })(),
  };
  const stops = [
    carry.subscribe(() => {
      const held = carry.held() !== null;
      if (held && !last.held) tutorial.event("peeled");
      last.held = held;
    }),
    pagePosition.subscribe(() => {
      const { flipped } = pagePosition.get();
      if (flipped !== last.flipped) tutorial.event("turned");
      last.flipped = flipped;
    }),
    stickerStore.subscribe(() => {
      const snap = stickerStore.getSnapshot();
      if (snap.status !== "ready") return;
      const layout = layoutOf(snap);
      if (layout !== last.layout) tutorial.event("placed");
      last.layout = layout;
    }),
  ];
  const stopAll = () => stops.forEach((stop) => stop());
  signal.addEventListener("abort", stopAll, { once: true });
  const done = tutorial.subscribe(() => {
    if (state.value && "done" in state.value) {
      stopAll();
      done();
    }
  });
}
