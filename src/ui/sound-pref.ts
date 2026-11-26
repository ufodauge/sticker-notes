import { settings } from "../data/sticker-store.ts";

// Whether the album makes its paper sounds: on unless turned off in the menu.

type Listener = () => void;
const state = { on: true, listeners: new Set<Listener>() };

void settings
  .get("sound")
  .then((on) => {
    if (on === null || on === state.on) return;
    state.on = on;
    state.listeners.forEach((l) => l());
  })
  .catch(() => {});

export const soundPref = {
  subscribe: (l: Listener): (() => void) => {
    state.listeners.add(l);
    return () => state.listeners.delete(l);
  },
  get: (): boolean => state.on,
  set: (on: boolean): void => {
    state.on = on;
    state.listeners.forEach((l) => l());
    void settings.set("sound", on).catch(() => {});
  },
};
