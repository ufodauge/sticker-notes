import { MATERIAL_KINDS, MATERIALS, type MaterialKind } from "../../../core/material.ts";
import { peopleOf } from "../../../core/people.ts";
import { settings, stickerStore } from "../../../data/sticker-store.ts";
import { debug } from "../../debug.ts";

// Which materials the maker has already met in the picker. One that has opened up since (more
// people exchanged with) is new: the create button shows a dot, and in the picker it arrives
// with a little fanfare until a sticker has been made.

type Listener = () => void;

const STARTING: readonly MaterialKind[] = MATERIAL_KINDS.filter((k) => MATERIALS[k].people === 0);

const state: { seen: readonly MaterialKind[]; listeners: Set<Listener> } = {
  seen: STARTING,
  listeners: new Set(),
};

function publish(seen: readonly MaterialKind[]): void {
  state.seen = seen;
  state.listeners.forEach((l) => l());
}

void settings
  .get("materialsSeen")
  .then((saved) => {
    if (saved) publish([...new Set([...STARTING, ...saved])]);
  })
  .catch(() => {});

export function availableMaterials(): readonly MaterialKind[] {
  if (debug.get().unlockAll) return MATERIAL_KINDS;
  const snap = stickerStore.getSnapshot();
  const people = snap.status === "ready" ? peopleOf(snap.stickers).length : 0;
  return MATERIAL_KINDS.filter((k) => people >= MATERIALS[k].people);
}

export const materialsSeen = {
  subscribe: (l: Listener): (() => void) => {
    state.listeners.add(l);
    return () => state.listeners.delete(l);
  },
  get: (): readonly MaterialKind[] => state.seen,
  // after a sticker has been made, everything on offer counts as met
  markAll: (kinds: readonly MaterialKind[]): void => {
    const seen = [...new Set([...state.seen, ...kinds])];
    publish(seen);
    void settings.set("materialsSeen", seen).catch(() => {});
  },
};
