// The sticker the tutorial wants peeled (a placement ID), or none. The album draws that one with
// an edge curling up now and then (TeaseCanvas.tsx), and marks where the edge lifts with
// `[data-tease-grip]`, for the tutorial's finger.

type Listener = () => void;
const state: { id: string | null; listeners: Set<Listener> } = {
  id: null,
  listeners: new Set(),
};

export const tease = {
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
