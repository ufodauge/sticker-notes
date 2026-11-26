import type { AppEvent } from "../core/events.ts";

// The one stream of what happens in the album (core/events.ts). Where a thing is done it is
// emitted here; listeners react. The last events are kept for the debug flow view.

type Listener = (e: AppEvent) => void;
export type Logged = { readonly at: number; readonly event: AppEvent };

const KEEP = 40;
const state: { listeners: Set<Listener>; log: readonly Logged[]; watchers: Set<() => void> } = {
  listeners: new Set(),
  log: [],
  watchers: new Set(),
};

export const events = {
  emit: (e: AppEvent): void => {
    state.log = [...state.log.slice(-(KEEP - 1)), { at: Date.now(), event: e }];
    state.listeners.forEach((l) => l(e));
    state.watchers.forEach((w) => w());
  },
  on: (l: Listener): (() => void) => {
    state.listeners.add(l);
    return () => state.listeners.delete(l);
  },
  // the log, as an external store
  subscribe: (w: () => void): (() => void) => {
    state.watchers.add(w);
    return () => state.watchers.delete(w);
  },
  log: (): readonly Logged[] => state.log,
};
