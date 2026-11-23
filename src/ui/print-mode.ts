import { flushSync } from "react-dom";

type Listener = () => void;
const state: { printing: boolean; listeners: Set<Listener> } = {
  printing: false,
  listeners: new Set(),
};

function set(printing: boolean): void {
  state.printing = printing;
  state.listeners.forEach((l) => l());
}

export const printMode = {
  subscribe: (l: Listener): (() => void) => {
    state.listeners.add(l);
    return () => state.listeners.delete(l);
  },
  get: (): boolean => state.printing,
};

export function listenForPrint(signal: AbortSignal): void {
  window.addEventListener("beforeprint", () => flushSync(() => set(true)), { signal });
  window.addEventListener("afterprint", () => set(false), { signal });
}
