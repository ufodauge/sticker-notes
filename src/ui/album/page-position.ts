// Where the notebook is open. The album is a stack of leaves: leaf k carries page 2k on its front
// and page 2k + 1 on its back. With `flipped` leaves turned over to the left, the open spread
// shows page 2·flipped − 1 on the left and page 2·flipped on the right. A wide screen shows the
// whole spread; a narrow one shows one side of it at a time (`side`), sliding between them.

export type BookPos = { readonly flipped: number; readonly side: "left" | "right" };

type Listener = () => void;

const state: {
  pos: BookPos;
  moved: boolean;
  faces: number;
  wide: boolean;
  turner: Turner | null;
  listeners: Set<Listener>;
} = {
  pos: { flipped: 0, side: "right" },
  moved: false,
  faces: 1,
  wide: false,
  turner: null,
  listeners: new Set(),
};

// Turns a leaf on screen, then calls `apply`; false when it cannot (the step applies at once).
type Turner = (direction: -1 | 1, apply: () => void) => boolean;

const leaves = () => Math.ceil(state.faces / 2);

const faceOf = (pos: BookPos): number =>
  pos.side === "right" ? pos.flipped * 2 : pos.flipped * 2 - 1;

const posOf = (face: number): BookPos =>
  face % 2 === 0 ? { flipped: face / 2, side: "right" } : { flipped: (face + 1) / 2, side: "left" };

function set(pos: BookPos): void {
  const flipped = Math.max(0, Math.min(leaves(), pos.flipped));
  const side = flipped === 0 ? "right" : flipped === leaves() ? "left" : pos.side;
  if (flipped === state.pos.flipped && side === state.pos.side) return;
  state.pos = { flipped, side };
  state.moved = true;
  state.listeners.forEach((l) => l());
}

export const pagePosition = {
  subscribe: (l: Listener): (() => void) => {
    state.listeners.add(l);
    return () => state.listeners.delete(l);
  },
  get: (): BookPos => state.pos,
  // whether the book has been turned at all since it opened (no page animates on first sight)
  moved: (): boolean => state.moved,
  // the page shown (on a wide screen, the right page of the spread, or the left one at the end)
  face: (): number => faceOf(state.pos),

  // the album tells how many pages (with the "+" at the end) there are and how wide it is
  configure: (faces: number, wide: boolean): void => {
    state.faces = Math.max(1, faces);
    state.wide = wide;
    set(state.pos);
  },

  // one step forward or back: turn a leaf (shown turning, unless `shown` says it already was),
  // or on a narrow screen slide to the other side
  step: (direction: -1 | 1, shown = false): void => {
    const { flipped, side } = state.pos;
    const next: BookPos = state.wide
      ? { flipped: flipped + direction, side: direction > 0 ? "left" : "right" }
      : direction > 0
        ? side === "left"
          ? { flipped, side: "right" }
          : { flipped: flipped + 1, side: "left" }
        : side === "right"
          ? { flipped, side: "left" }
          : { flipped: flipped - 1, side: "right" };
    const turns = next.flipped !== flipped && next.flipped >= 0 && next.flipped <= leaves();
    if (turns && !shown && state.turner?.(direction, () => set(next))) return;
    set(next);
  },

  // the album shows leaves turning; one at a time
  onTurn: (turner: Turner): (() => void) => {
    state.turner = turner;
    return () => {
      if (state.turner === turner) state.turner = null;
    };
  },

  show: (face: number): void => set(posOf(Math.max(0, Math.min(state.faces - 1, face)))),
};

export const showPage = (index: number): void => pagePosition.show(index);
