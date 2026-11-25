// Where the notebook is open: `flipped` leaves have been turned, so spread number `flipped` lies
// open (its left half on the back of the last leaf turned, or the inside of the cover; its right
// half on the next leaf). A wide screen shows the whole spread; a narrow one shows one half of it
// at a time (`side`), sliding between them. A "face" counts halves: spread·2 + (right ? 1 : 0).

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
  pos: { flipped: 0, side: "left" },
  moved: false,
  faces: 1,
  wide: false,
  turner: null,
  listeners: new Set(),
};

// Turns a leaf on screen, then calls `apply`; false when it cannot (the step applies at once).
type Turner = (direction: -1 | 1, apply: () => void) => boolean;

// the last spread is the "+" one; no leaf is turned past it
const lastSpread = () => Math.max(0, Math.ceil(state.faces / 2) - 1);

const faceOf = (pos: BookPos): number => pos.flipped * 2 + (pos.side === "right" ? 1 : 0);

const posOf = (face: number): BookPos => ({
  flipped: Math.floor(face / 2),
  side: face % 2 === 0 ? "left" : "right",
});

function set(pos: BookPos): void {
  const flipped = Math.max(0, Math.min(lastSpread(), pos.flipped));
  const side = pos.side;
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
  // the half shown (on a wide screen, either half of the open spread)
  face: (): number => faceOf(state.pos),
  // the spread lying open
  spread: (): number => state.pos.flipped,

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
      ? { flipped: flipped + direction, side }
      : direction > 0
        ? side === "left"
          ? { flipped, side: "right" }
          : { flipped: flipped + 1, side: "left" }
        : side === "right"
          ? { flipped, side: "left" }
          : { flipped: flipped - 1, side: "right" };
    if (next.flipped < 0 || next.flipped > lastSpread()) return;
    const turns = next.flipped !== flipped;
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

// opens the notebook at a half (spread·2 for its left half)
export const showPage = (face: number): void => pagePosition.show(face);
