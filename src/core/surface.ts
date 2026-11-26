import type { Placement } from "./album.ts";

// Places off the album where a sticker can be stuck: the bare desk beside it (a few, the special
// ones) and the things that arrive on the desk as one exchanges with more people (a laptop). A
// sticker stuck on one is a placement whose `pageId` is the surface's ID: no page is made for it,
// and the album, its pages and its print never show it.
//
// `dots`: how wide the surface is, in the dots a sticker is measured in (a sticker is 36 dots at
// scale 1; a page's spread is 600), so a sticker keeps about its size wherever it is stuck.
export const SURFACES = {
  desk: { id: "surface:desk", people: 0, capacity: 4, dots: 180 },
  laptop: { id: "surface:laptop", people: 3, capacity: 16, dots: 240 },
} as const satisfies Record<
  string,
  { readonly id: string; readonly people: number; readonly capacity: number; readonly dots: number }
>;

export type SurfaceKind = keyof typeof SURFACES;
export const SURFACE_KINDS = Object.keys(SURFACES) as readonly SurfaceKind[];

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

// Where each surface lies on the desk, as its centre in the desk's own box (0..1 each way). The
// desk is a band below the book on a tall screen and a column beside it on a wide one, so each
// shape keeps its own layout.
export type Spot = { readonly x: number; readonly y: number };
export type DeskShape = "tall" | "wide";

const DEFAULT_SPOTS: Readonly<Record<DeskShape, Readonly<Record<SurfaceKind, Spot>>>> = {
  tall: { desk: { x: 0.24, y: 0.5 }, laptop: { x: 0.72, y: 0.5 } },
  wide: { desk: { x: 0.5, y: 0.3 }, laptop: { x: 0.5, y: 0.72 } },
};

// a surface is kept this far inside the desk's edges (it may hang over them a little, as on a
// real desk, but never be lost)
const MARGIN = 0.08;

export const clampSpot = (s: Spot): Spot => ({
  x: Math.min(1 - MARGIN, Math.max(MARGIN, s.x)),
  y: Math.min(1 - MARGIN, Math.max(MARGIN, s.y)),
});

export function spotOf(
  saved: Partial<Record<SurfaceKind, Spot>> | undefined,
  shape: DeskShape,
  kind: SurfaceKind,
): Spot {
  return clampSpot(saved?.[kind] ?? DEFAULT_SPOTS[shape][kind]);
}
