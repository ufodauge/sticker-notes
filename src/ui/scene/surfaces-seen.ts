import { peopleOf } from "../../core/people.ts";
import { SURFACE_KINDS, surfacesFor, type SurfaceKind } from "../../core/surface.ts";
import { settings, stickerStore } from "../../data/sticker-store.ts";
import { debug } from "../debug.ts";

// The things on the desk: which there are (by the people exchanged with), and which have already
// been seen arriving. One that has just come slides in across the desk, once.

type Listener = () => void;

const state: { seen: readonly SurfaceKind[] | null; listeners: Set<Listener> } = {
  // null until the saved list is read: nothing arrives before it is known what has been seen
  seen: null,
  listeners: new Set(),
};

function publish(seen: readonly SurfaceKind[]): void {
  state.seen = seen;
  state.listeners.forEach((l) => l());
}

void settings
  .get("surfacesSeen")
  .then((saved) => publish(saved ?? surfacesFor(0)))
  .catch(() => publish(SURFACE_KINDS));

export function availableSurfaces(): readonly SurfaceKind[] {
  if (debug.get().unlockAll) return SURFACE_KINDS;
  const snap = stickerStore.getSnapshot();
  return surfacesFor(snap.status === "ready" ? peopleOf(snap.stickers).length : 0);
}

export const surfacesSeen = {
  subscribe: (l: Listener): (() => void) => {
    state.listeners.add(l);
    return () => state.listeners.delete(l);
  },
  get: (): readonly SurfaceKind[] | null => state.seen,
  arrived: (kind: SurfaceKind): void => {
    const seen = [...new Set([...(state.seen ?? []), kind])];
    publish(seen);
    void settings.set("surfacesSeen", seen).catch(() => {});
  },
};
