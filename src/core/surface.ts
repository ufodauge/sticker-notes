import type { Placement } from "./album.ts";

// Places off the album where a sticker can be stuck: the bare desk the album lies on, and the
// things lying on the desk (a notebook from the start, a laptop that arrives as one exchanges with
// more people). A sticker stuck on one is a placement whose `pageId` is the surface's ID: no page
// is made for it, and the album, its pages and its print never show it.
//
// Sizes are in pages (one page of the album, as wide as it is shown): the desk spreads around the
// open album, a closed notebook is a page, a laptop about a spread. A sticker is measured in dots,
// 300 to a page, so it keeps its size wherever it is stuck.
const DOTS_PER_PAGE = 300;

export const SURFACES = {
  desk: { id: "surface:desk", people: 0, capacity: 40, w: 9, h: 7 },
  notebook: { id: "surface:notebook", people: 0, capacity: 8, w: 1, h: 4 / 3 },
  laptop: { id: "surface:laptop", people: 3, capacity: 16, w: 2.05, h: 1.43 },
} as const satisfies Record<
  string,
  {
    readonly id: string;
    readonly people: number;
    readonly capacity: number;
    readonly w: number;
    readonly h: number;
  }
>;

export type SurfaceKind = keyof typeof SURFACES;
export const SURFACE_KINDS = Object.keys(SURFACES) as readonly SurfaceKind[];
// the things lying on the desk (the desk itself does not move)
export type ThingKind = Exclude<SurfaceKind, "desk">;
export const THING_KINDS = SURFACE_KINDS.filter((k): k is ThingKind => k !== "desk");

export const dotsOf = (kind: SurfaceKind): number => SURFACES[kind].w * DOTS_PER_PAGE;

const BY_ID: ReadonlyMap<string, SurfaceKind> = new Map(
  SURFACE_KINDS.map((k) => [SURFACES[k].id, k]),
);

export const surfaceOf = (pageId: string): SurfaceKind | undefined => BY_ID.get(pageId);
export const isSurface = (pageId: string): boolean => BY_ID.has(pageId);

// the surfaces on the desk for someone who has exchanged with `people` people
export const surfacesFor = (people: number): readonly SurfaceKind[] =>
  SURFACE_KINDS.filter((k) => people >= SURFACES[k].people);

// whether another sticker fits (one already there may always move about on it)
export function hasRoom(
  kind: SurfaceKind,
  placements: readonly Placement[],
  moving?: string,
): boolean {
  const id = SURFACES[kind].id;
  const on = placements.filter((p) => p.pageId === id && p.stickerId !== moving).length;
  return on < SURFACES[kind].capacity;
}

// Where each thing lies on the desk: its centre, in pages from the middle of the desk (where the
// album lies), and how far it is turned (degrees). A tall screen (the album fills its width) and a
// wide one start from different layouts, and each keeps its own once things are moved.
export type Spot = { readonly x: number; readonly y: number; readonly r: number };
export type DeskShape = "tall" | "wide";

const DEFAULT_SPOTS: Readonly<Record<DeskShape, Readonly<Record<ThingKind, Spot>>>> = {
  tall: { notebook: { x: -0.45, y: 1.85, r: -9 }, laptop: { x: 1.05, y: 2.0, r: 7 } },
  wide: { notebook: { x: -1.6, y: 0.8, r: -12 }, laptop: { x: 1.95, y: 0.3, r: 8 } },
};

// a thing is kept on the desk: its centre this far inside the desk's edges
const MARGIN = 0.4;

export const clampSpot = (s: Spot): Spot => {
  const hx = SURFACES.desk.w / 2 - MARGIN;
  const hy = SURFACES.desk.h / 2 - MARGIN;
  const r = ((((s.r + 180) % 360) + 360) % 360) - 180;
  return {
    x: Math.min(hx, Math.max(-hx, s.x)),
    y: Math.min(hy, Math.max(-hy, s.y)),
    r: Object.is(r, -0) ? 0 : r,
  };
};

export function spotOf(
  saved: Partial<Record<ThingKind, Spot>> | undefined,
  shape: DeskShape,
  kind: ThingKind,
): Spot {
  return clampSpot(saved?.[kind] ?? DEFAULT_SPOTS[shape][kind]);
}

// A surface as laid on the screen: its centre, its size before it is turned, and its turn.
export type Frame = {
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
  readonly angle: number;
};

// Where a point on the screen lies on the surface, from its top left corner as it lies unturned
// (0..1 each way while on it).
export function localOf(
  f: Frame,
  x: number,
  y: number,
): { readonly u: number; readonly v: number } {
  const a = (-f.angle * Math.PI) / 180;
  const dx = x - f.cx;
  const dy = y - f.cy;
  return {
    u: (dx * Math.cos(a) - dy * Math.sin(a)) / f.w + 0.5,
    v: (dx * Math.sin(a) + dy * Math.cos(a)) / f.h + 0.5,
  };
}

// Where a point of the surface lies on the screen (the reverse of localOf).
export function screenOf(
  f: Frame,
  u: number,
  v: number,
): { readonly x: number; readonly y: number } {
  const a = (f.angle * Math.PI) / 180;
  const lx = (u - 0.5) * f.w;
  const ly = (v - 0.5) * f.h;
  return {
    x: f.cx + lx * Math.cos(a) - ly * Math.sin(a),
    y: f.cy + lx * Math.sin(a) + ly * Math.cos(a),
  };
}
