// Whether the debug flow view is open (debug builds only; not kept across reloads).
type Listener = () => void;
const state = { open: false, listeners: new Set<Listener>() };

export const flowPanel = {
  subscribe: (l: Listener): (() => void) => {
    state.listeners.add(l);
    return () => state.listeners.delete(l);
  },
  open: (): boolean => state.open,
  toggle: (open: boolean): void => {
    state.open = open;
    state.listeners.forEach((l) => l());
  },
};
