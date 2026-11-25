import * as v from "valibot";

// A page of the album is an open spread: two 3:4 halves side by side, one on each side of the
// spine. Positions are fractions of the whole spread; a sticker is 36 dots of 1/600 its width.
export const PAGE_ASPECT = 3 / 2;
export const HALF_ASPECT = 3 / 4;
const SLOT_COLUMNS = 6;
const SLOT_ROWS = 4;
export const PAGE_CAPACITY = SLOT_COLUMNS * SLOT_ROWS;
const DEFAULT_SCALE = 2;

const unit = v.pipe(v.number(), v.minValue(0), v.maxValue(1));

export const PageSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  order: v.pipe(v.number(), v.finite()),
});

export const PlacementSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  pageId: v.pipe(v.string(), v.minLength(1)),
  stickerId: v.pipe(v.string(), v.regex(/^[0-9a-f]{32}$/)),
  x: unit,
  y: unit,
  scale: v.picklist([1, 2, 3, 4]),
  rotation: v.pipe(v.number(), v.finite()),
  z: v.pipe(v.number(), v.finite()),
});

export type Page = v.InferOutput<typeof PageSchema>;
export type Placement = v.InferOutput<typeof PlacementSchema>;
export type Scale = Placement["scale"];

export function snapScale(raw: number): Scale {
  return Math.min(4, Math.max(1, Math.round(raw))) as Scale;
}

export function normalizeRotation(deg: number): number {
  const r = ((((deg + 180) % 360) + 360) % 360) - 180;
  return r === -180 ? 180 : Math.round(r * 10) / 10;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function topZ(placements: readonly Placement[], pageId: string): number {
  return placements.reduce((z, p) => (p.pageId === pageId ? Math.max(z, p.z) : z), 0);
}

export function nextPageOrder(pages: readonly Page[]): number {
  return pages.reduce((o, p) => Math.max(o, p.order), -1) + 1;
}

export function sortedPages(pages: readonly Page[]): readonly Page[] {
  return pages.toSorted((a, b) => a.order - b.order);
}

export function slotCenter(i: number): { readonly x: number; readonly y: number } {
  return {
    x: ((i % SLOT_COLUMNS) + 0.5) / SLOT_COLUMNS,
    y: (Math.floor(i / SLOT_COLUMNS) + 0.5) / SLOT_ROWS,
  };
}

function slotOf(x: number, y: number): number {
  const c = Math.min(SLOT_COLUMNS - 1, Math.floor(x * SLOT_COLUMNS));
  const r = Math.min(SLOT_ROWS - 1, Math.floor(y * SLOT_ROWS));
  return r * SLOT_COLUMNS + c;
}

function jitter(id: string): { readonly dx: number; readonly dy: number; readonly rot: number } {
  const n = (k: number) => (Number.parseInt(id.slice(k, k + 2), 16) || 0) / 255 - 0.5;
  return { dx: n(0) * 0.03, dy: n(2) * 0.05, rot: n(4) * 16 };
}

export type AutoPlace = {
  readonly newPage: Page | null;
  readonly placement: Placement;
};

export function autoPlace(
  pages: readonly Page[],
  placements: readonly Placement[],
  sticker: string,
  ids: { readonly page: string; readonly placement: string },
  preferred?: string,
): AutoPlace {
  const freeSlot = (page: Page | undefined) => {
    if (!page) return undefined;
    const taken = new Set(
      placements.filter((p) => p.pageId === page.id).map((p) => slotOf(p.x, p.y)),
    );
    const slot = Array.from({ length: PAGE_CAPACITY }, (_, i) => i).find((i) => !taken.has(i));
    return slot === undefined ? undefined : { page, slot };
  };
  const found =
    freeSlot(pages.find((p) => p.id === preferred)) ?? freeSlot(sortedPages(pages).at(-1));
  const newPage = found ? null : { id: ids.page, order: nextPageOrder(pages) };
  const pageId = found?.page.id ?? ids.page;
  const c = slotCenter(found?.slot ?? 0);
  const j = jitter(sticker);
  return {
    newPage,
    placement: {
      id: ids.placement,
      pageId,
      stickerId: sticker,
      x: clamp01(c.x + j.dx),
      y: clamp01(c.y + j.dy),
      scale: DEFAULT_SCALE,
      rotation: normalizeRotation(j.rot),
      z: topZ(placements, pageId) + 1,
    },
  };
}

export type PlacementChange = {
  readonly x?: number;
  readonly y?: number;
  readonly scale?: number;
  readonly rotation?: number;
};

export function applyChange(p: Placement, c: PlacementChange): Placement {
  return {
    ...p,
    x: c.x === undefined ? p.x : clamp01(c.x),
    y: c.y === undefined ? p.y : clamp01(c.y),
    scale: c.scale === undefined ? p.scale : snapScale(c.scale),
    rotation: c.rotation === undefined ? p.rotation : normalizeRotation(c.rotation),
  };
}

export function bringToFront(placements: readonly Placement[], p: Placement): Placement {
  const top = topZ(placements, p.pageId);
  const alone = placements.filter((q) => q.pageId === p.pageId && q.z === top).length === 1;
  return p.z === top && alone ? p : { ...p, z: top + 1 };
}

// Albums made before pages were spreads: every two pages, in order, become one spread, the first
// on its left half and the second on its right. Stickers keep their size (a dot was 1/300 of a
// page and is 1/600 of a spread).
export function spreadsFromPages(
  pages: readonly Page[],
  placements: readonly Placement[],
): { readonly pages: readonly Page[]; readonly placements: readonly Placement[] } {
  const sorted = sortedPages(pages);
  const where = new Map(
    sorted.map((p, i) => [p.id, { spread: sorted[i - (i % 2)]?.id ?? p.id, half: i % 2 }]),
  );
  return {
    pages: sorted.filter((_, i) => i % 2 === 0).map((p, i) => ({ id: p.id, order: i })),
    placements: placements.flatMap((p) => {
      const at = where.get(p.pageId);
      return at ? [{ ...p, pageId: at.spread, x: p.x / 2 + at.half / 2 }] : [];
    }),
  };
}
