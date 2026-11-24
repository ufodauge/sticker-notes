type Listener = () => void;

const state: { id: string | null; listeners: Set<Listener> } = { id: null, listeners: new Set() };

// The block picked by tapping it in the jar: the canvas owns the pixels, the app owns the action bar.
export const blockSelection = {
  subscribe: (l: Listener): (() => void) => {
    state.listeners.add(l);
    return () => state.listeners.delete(l);
  },
  get: (): string | null => state.id,
  set: (id: string | null): void => {
    if (state.id === id) return;
    state.id = id;
    state.listeners.forEach((l) => l());
  },
};
