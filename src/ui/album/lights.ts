import { watchAmbientLight } from "../../data/ambient-light.ts";

// The album's light switch. Lights out, the album goes dark and only glow-in-the-dark stickers
// shine. Where the browser can measure the room, the lights follow
// it until the switch is touched by hand.

type Listener = () => void;
const state = { off: false, byHand: false, listeners: new Set<Listener>() };

function set(off: boolean): void {
  if (off === state.off) return;
  state.off = off;
  state.listeners.forEach((l) => l());
}

export const lights = {
  subscribe: (l: Listener): (() => void) => {
    state.listeners.add(l);
    return () => state.listeners.delete(l);
  },
  off: (): boolean => state.off,
  toggle: (): void => {
    state.byHand = true;
    set(!state.off);
  },
};

export function followRoomLight(signal: AbortSignal): void {
  watchAmbientLight((dark) => {
    if (!state.byHand) set(dark);
  }, signal);
}
