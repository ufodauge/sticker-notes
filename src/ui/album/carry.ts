import type { Sticker } from "../../core/payload.ts";

// A sticker held in the hand: peeled off a page or pulled out of the pocket, it leaves its place
// and follows the finger above everything until it is put down. Held at a screen edge for a
// moment, it turns the page.

export type Held = {
  readonly stickerId: string;
  readonly sticker: Sticker;
  // its size on screen in CSS pixels, and its angle
  readonly size: number;
  readonly rotation: number;
  // from the finger to the sticker's centre, so it stays where it was grabbed
  readonly offset?: { readonly x: number; readonly y: number };
  // peeled off: the direction it was rolled toward (on screen); it starts tipped up that way and
  // settles flat
  readonly tipped?: { readonly x: number; readonly y: number };
};

type Listener = () => void;

const EDGE_PX = 32;
const EDGE_HOLD_MS = 480;
// held on, it keeps turning, once each page has finished going over
const EDGE_REPEAT_MS = 1600;

const state: {
  held: Held | null;
  layer: HTMLElement | null;
  peel: HTMLCanvasElement | null;
  edge: { side: -1 | 0 | 1; since: number; timer: ReturnType<typeof setTimeout> | undefined };
  turnPage: ((direction: -1 | 1) => void) | null;
  listeners: Set<Listener>;
} = {
  held: null,
  layer: null,
  peel: null,
  edge: { side: 0, since: 0, timer: undefined },
  turnPage: null,
  listeners: new Set(),
};

function publish(): void {
  state.listeners.forEach((l) => l());
}

function place(x: number, y: number): void {
  const o = state.held?.offset ?? { x: 0, y: 0 };
  state.layer?.style.setProperty("--carry-x", `${x + o.x}px`);
  state.layer?.style.setProperty("--carry-y", `${y + o.y}px`);
}

function watchEdge(x: number): void {
  const side = x < EDGE_PX ? -1 : x > innerWidth - EDGE_PX ? 1 : 0;
  if (side === state.edge.side) return;
  clearTimeout(state.edge.timer);
  state.edge = { side, since: performance.now(), timer: undefined };
  if (side === 0) return;
  const turn = () => {
    state.turnPage?.(side);
    state.edge.timer = setTimeout(turn, EDGE_REPEAT_MS);
  };
  state.edge.timer = setTimeout(turn, EDGE_HOLD_MS);
}

export const carry = {
  subscribe: (l: Listener): (() => void) => {
    state.listeners.add(l);
    return () => state.listeners.delete(l);
  },
  held: (): Held | null => state.held,

  pickUp: (held: Held, x: number, y: number): void => {
    state.held = held;
    place(x, y);
    publish();
  },
  move: (x: number, y: number): void => {
    if (!state.held) return;
    place(x, y);
    watchEdge(x);
  },
  // where the held sticker's centre is when the finger is at (x, y)
  centre: (x: number, y: number): { x: number; y: number } => {
    const o = state.held?.offset ?? { x: 0, y: 0 };
    return { x: x + o.x, y: y + o.y };
  },
  putDown: (): void => {
    clearTimeout(state.edge.timer);
    state.edge = { side: 0, since: 0, timer: undefined };
    state.held = null;
    publish();
  },

  // the element the held sticker is drawn in (a ref callback)
  attach: (el: HTMLElement | null): void => {
    state.layer = el;
  },
  // the canvas a sticker is drawn on while it is being peeled (over everything, the whole window)
  attachPeel: (el: HTMLCanvasElement | null): void => {
    state.peel = el;
  },
  peelCanvas: (): HTMLCanvasElement | null => state.peel,
  // what an edge hold does (the album registers its page turning)
  onEdge: (turn: (direction: -1 | 1) => void): (() => void) => {
    state.turnPage = turn;
    return () => {
      if (state.turnPage === turn) state.turnPage = null;
    };
  },
};

export type DropTarget =
  | {
      readonly kind: "page";
      readonly pageId: string | null;
      readonly x: number;
      readonly y: number;
    }
  | { readonly kind: "pocket" };

// What lies under a point: a page (null for the blank spread after the last page, which a
// sticker put on it makes into a page), or the pocket. By
// geometry rather than hit testing, so it also works while a modal dialog makes the album inert.
// Where leaves overlap, the one on top of its stack wins.
export function dropTarget(x: number, y: number): DropTarget | undefined {
  const inside = (el: Element) => {
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  if ([...document.querySelectorAll("[data-pocket]")].some(inside)) return { kind: "pocket" };
  const stackOrder = (el: Element) =>
    Number(getComputedStyle(el.closest("[data-leaf]") ?? el).zIndex) || 0;
  const found = [
    ...document.querySelectorAll<HTMLElement>("[data-shown] [data-facing] [data-paper]"),
  ]
    .filter(inside)
    .toSorted((a, b) => stackOrder(b) - stackOrder(a))[0];
  if (!found) return undefined;
  const r = found.getBoundingClientRect();
  const at = { x: (x - r.left) / r.width, y: (y - r.top) / r.height };
  const pageId = found.closest<HTMLElement>("[data-spread]")?.dataset.spread || null;
  return { kind: "page", pageId, ...at };
}

// The size a sticker of the given scale has on a page as it is shown now.
export function pageStickerSize(scale: number): number {
  const paper =
    document.querySelector<HTMLElement>("[data-shown] [data-facing] [data-paper]") ??
    document.querySelector<HTMLElement>("[data-paper]");
  return paper ? (paper.getBoundingClientRect().width / 600) * 36 * scale : 72;
}
