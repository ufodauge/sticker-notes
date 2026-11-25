import { settings } from "../data/sticker-store.ts";

// Debug mode: opening the app with `?debug` once turns it on (it is remembered); a bug button in
// the toolbar then opens the debug menu. In the browser console, `stickerNotesDebug.unlockAll()`
// does the same as the menu's switch.

export type DebugState = { readonly on: boolean; readonly unlockAll: boolean };
type Listener = () => void;

const state: { value: DebugState; listeners: Set<Listener> } = {
  value: { on: false, unlockAll: false },
  listeners: new Set(),
};

function publish(next: DebugState): void {
  state.value = next;
  state.listeners.forEach((l) => l());
  void settings.set("debug", next).catch(() => {});
}

export const debug = {
  subscribe: (l: Listener): (() => void) => {
    state.listeners.add(l);
    return () => state.listeners.delete(l);
  },
  get: (): DebugState => state.value,
  setUnlockAll: (unlockAll: boolean): void => publish({ ...state.value, unlockAll }),
  turnOff: (): void => publish({ on: false, unlockAll: false }),
};

export async function startDebug(): Promise<void> {
  const saved = await settings.get("debug").catch(() => null);
  const asked = new URLSearchParams(location.search).has("debug");
  const value = saved ?? state.value;
  if (asked && !value.on) publish({ ...value, on: true });
  else if (saved) {
    state.value = saved;
    state.listeners.forEach((l) => l());
  }
  Object.assign(globalThis, {
    stickerNotesDebug: {
      unlockAll: (on = true) => publish({ on: true, unlockAll: on }),
      off: debug.turnOff,
    },
  });
}
