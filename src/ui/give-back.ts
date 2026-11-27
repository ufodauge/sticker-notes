// The sticker just received that has not been answered yet: the create button beats for it,
// and one made then is given back to it (its QR comes up for that person). Answered once that QR
// is put away. Not kept across reloads.

type Listener = () => void;
const state: { id: string | null; listeners: Set<Listener> } = { id: null, listeners: new Set() };

export const giveBack = {
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
