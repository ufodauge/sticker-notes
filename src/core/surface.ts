import type { Placement } from "./album.ts";

// Where a sticker can be stuck off the album: the bare desk the album lies on. A sticker stuck there
// is a placement whose `pageId` is the surface's ID: no page is made for it, and the album, its
// pages and its print never show it. (One table of surfaces, so more could join it.)
//
// Sizes are in pages (one page of the album, as wide as it is shown): the desk spreads around the
// open album. A sticker is measured in dots, 300 to a page, so it keeps its size on the desk.
const DOTS_PER_PAGE = 300;

export const SURFACES = {
  desk: { id: "surface:desk", capacity: 40, w: 9, h: 7 },
} as const satisfies Record<
  string,
  { readonly id: string; readonly capacity: number; readonly w: number; readonly h: number }
>;

export type SurfaceKind = keyof typeof SURFACES;
const SURFACE_KINDS = Object.keys(SURFACES) as readonly SurfaceKind[];

export const dotsOf = (kind: SurfaceKind): number => SURFACES[kind].w * DOTS_PER_PAGE;

const BY_ID: ReadonlyMap<string, SurfaceKind> = new Map(
  SURFACE_KINDS.map((k) => [SURFACES[k].id, k]),
);

export const surfaceOf = (pageId: string): SurfaceKind | undefined => BY_ID.get(pageId);
export const isSurface = (pageId: string): boolean => BY_ID.has(pageId);

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
