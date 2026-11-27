import { stateOf, step } from "../../core/flows.ts";
import { DONE, chooseFlow, sampleStickers, type TutorialState } from "../../core/tutorial.ts";
import { events } from "../../data/events.ts";
import { settings, stickerStore, type Ready } from "../../data/sticker-store.ts";
import { testFlag } from "../../data/test-flags.ts";
import { DEBUG_BUILD } from "../debug-build.ts";
import { feedback } from "../feedback.ts";

// The first time through: which flow (core/flows.ts) and how far it has got. It moves on by the
// album's own events (data/events.ts), as each thing is done.

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
  // the last card's button
  finish: (): void => events.emit({ type: "tutorial.finish" }),
  close: (): void => publish(DONE),
  // from the menu: the first visit's way through, on the stickers there are
  replay: (): void => publish({ flow: "tutorial.start", at: 0 }),
  // debug only (the flow view): put a flow at a state
  jump: (next: TutorialState): void => publish(next),
};

// each event moves the flow on when it is the one waited for; at its end, it is done
events.on((e) => {
  const s = state.value;
  if (!s || "done" in s) return;
  const next = step(s, e.type);
  if (next === s) return;
  // the making put away with nothing made: nothing to say about it, the tutorial just ends
  if (e.type === "create.closed" && stateOf(s)?.id === "making" && !made.now) {
    publish(DONE);
    return;
  }
  publish(stateOf(next)?.on === undefined ? DONE : { ...s, at: next.at });
  if (s.flow === "tutorial.start" && stateOf(next)?.id === "pocket") arrive();
});

// whether a sticker was made since the making began
const made = { now: false };
events.on((e) => {
  if (e.type === "create.opened") made.now = false;
  if (e.type === "sticker.created") made.now = true;
});

// a friend's sticker comes into the pocket, flying in as a received one does, once the page
// has settled from its turn (one thing at a time)
function arrive(): void {
  setTimeout(() => {
    void stickerStore
      .pocketSample(sampleStickers().friend)
      .then((id) => feedback.landed(id, "pocket", null));
  }, 900);
}

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

export function startTutorial(arrivedByLink: boolean): void {
  if (DEBUG_BUILD && testFlag("skip-tutorial")) {
    publish(DONE, false);
    return;
  }
  void Promise.all([settings.get("tutorial").catch(() => null), readyStore()]).then(
    async ([saved, snap]) => {
      const first = chooseFlow({ saved, stickers: snap.stickers.length, arrivedByLink });
      if (!saved && "flow" in first && first.flow === "tutorial.start") {
        await stickerStore.seedSamples(sampleStickers().pages);
      }
      publish(first);
    },
  );
}
