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
