import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import {
  spreadsFromPages,
  PAGE_ASPECT,
  PAGE_CAPACITY,
  PlacementSchema,
  applyChange,
  autoPlace,
  bringToFront,
  nextPageOrder,
  sortedPages,
  topZ,
  normalizeRotation,
  snapScale,
  type Page,
  type Placement,
} from "./album.ts";

const sid = (n: number) => n.toString(16).padStart(32, "0");

function fill(n: number) {
  return Array.from({ length: n }).reduce<{ pages: Page[]; placements: Placement[] }>(
    (acc, _, i) => {
      const r = autoPlace(acc.pages, acc.placements, sid(i + 1), {
        page: `p${i}`,
        placement: `x${i}`,
      });
      return {
        pages: r.newPage ? [...acc.pages, r.newPage] : acc.pages,
        placements: [...acc.placements, r.placement],
      };
    },
    { pages: [], placements: [] },
  );
}

describe("auto placement", () => {
  test("the first sticker creates the first page", () => {
    const r = autoPlace([], [], sid(1), { page: "p", placement: "x" });
    expect(r.newPage).toEqual({ id: "p", order: 0 });
    expect(r.placement).toMatchObject({ pageId: "p", scale: 2, z: 1 });
  });

  test("a full page makes a new one; one sticker per slot", () => {
    const { pages, placements } = fill(PAGE_CAPACITY + 1);
    expect(pages).toHaveLength(2);
    expect(placements.filter((p) => p.pageId === pages[0]?.id)).toHaveLength(PAGE_CAPACITY);
    expect(placements.at(-1)?.pageId).toBe(pages[1]?.id);
    const cells = new Set(
      placements
        .slice(0, PAGE_CAPACITY)
        .map((p) => `${Math.floor(p.x * 6)},${Math.floor(p.y * 4)}`),
    );
    expect(cells.size).toBe(PAGE_CAPACITY);
  });

  test("a freed slot on the last page is filled first", () => {
    const { pages, placements } = fill(3);
    const without = placements.filter((p) => p.id !== "x1");
    const r = autoPlace(pages, without, sid(99), { page: "n", placement: "y" });
    expect(r.newPage).toBeNull();
    expect(Math.floor(r.placement.x * 6)).toBe(1);
  });

  test("a preferred page with room is used before the last page", () => {
    const { pages, placements } = fill(PAGE_CAPACITY + 1);
    const first = pages[0]?.id ?? "";
    const without = placements.filter((p) => p.id !== "x4");
    const r = autoPlace(pages, without, sid(99), { page: "n", placement: "y" }, first);
    expect(r.placement.pageId).toBe(first);
    const full = autoPlace(pages, placements, sid(98), { page: "n", placement: "z" }, first);
    expect(full.placement.pageId).toBe(pages[1]?.id);
  });

  test("placements pass the schema", () => {
    fill(20).placements.forEach((p) => expect(v.is(PlacementSchema, p)).toBe(true));
  });
});

describe("album helpers", () => {
  test("snapScale / normalizeRotation", () => {
    expect([0.2, 1.4, 1.6, 3.5, 9].map(snapScale)).toEqual([1, 1, 2, 4, 4]);
    expect(normalizeRotation(190)).toBe(-170);
    expect(normalizeRotation(-180)).toBe(180);
  });

  test("applyChange clamps and snaps", () => {
    const p = fill(1).placements[0] as Placement;
    expect(applyChange(p, { x: 1.5, scale: 2.6, rotation: 370 })).toMatchObject({
      x: 1,
      scale: 3,
      rotation: 10,
    });
  });

  test("bringToFront", () => {
    const [a, b] = fill(2).placements as [Placement, Placement];
    expect(bringToFront([a, b], a).z).toBe(3);
    expect(bringToFront([a, b], b)).toBe(b);
  });

  test("nextPageOrder", () => {
    expect(
      nextPageOrder([
        { id: "a", order: 0 },
        { id: "b", order: 1 },
      ]),
    ).toBe(2);
  });
});

const placement = (over: Partial<Placement>): Placement => ({
  id: "q",
  pageId: "p",
  stickerId: sid(1),
  x: 0.5,
  y: 0.5,
  scale: 2,
  rotation: 0,
  z: 1,
  ...over,
});

describe("album details", () => {
  test("a page is a spread of two 3:4 halves", () => {
    expect(PAGE_ASPECT).toBe(1.5);
  });

  test("sticker ids must be exactly 32 lowercase hex digits", () => {
    const ok = (stickerId: string) => v.is(PlacementSchema, placement({ stickerId }));
    expect(ok(sid(1))).toBe(true);
    expect(ok(`g${sid(1)}`)).toBe(false);
    expect(ok(`${sid(1)}g`)).toBe(false);
    expect(ok(sid(1).slice(1))).toBe(false);
  });

  test("sortedPages orders by order without mutating the input", () => {
    const pages: Page[] = [
      { id: "c", order: 5 },
      { id: "a", order: 1 },
      { id: "b", order: 3 },
    ];
    expect(sortedPages(pages).map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(pages.map((p) => p.id)).toEqual(["c", "a", "b"]);
  });

  test("topZ looks at one page only", () => {
    const ps = [
      placement({ id: "1", pageId: "p", z: 3 }),
      placement({ id: "2", pageId: "other", z: 9 }),
    ];
    expect(topZ(ps, "p")).toBe(3);
    expect(topZ(ps, "other")).toBe(9);
    expect(topZ(ps, "none")).toBe(0);
  });

  test("a new sticker goes on top of its own page only", () => {
    const pages: Page[] = [{ id: "p", order: 0 }];
    const ps = [placement({ pageId: "other", z: 9 }), placement({ id: "2", pageId: "p", z: 2 })];
    const r = autoPlace(pages, ps, sid(7), { page: "n", placement: "y" });
    expect(r.placement.z).toBe(3);
  });

  test("slots taken on earlier pages do not block the last page", () => {
    const { pages, placements } = fill(PAGE_CAPACITY + 1);
    const r = autoPlace(pages, placements, sid(99), { page: "n", placement: "y" });
    expect(r.newPage).toBeNull();
    expect(r.placement.pageId).toBe(pages[1]?.id);
    expect(Math.floor(r.placement.x * 6)).toBe(1);
    expect(Math.floor(r.placement.y * 4)).toBe(0);
  });

  test("the last page is the one with the highest order, not the last in the array", () => {
    const pages: Page[] = [
      { id: "late", order: 7 },
      { id: "early", order: 1 },
    ];
    const r = autoPlace(pages, [], sid(1), { page: "n", placement: "y" });
    expect(r.placement.pageId).toBe("late");
    expect(r.newPage).toBeNull();
  });

  test("a sticker at the far edge occupies the last slot", () => {
    const pages: Page[] = [{ id: "p", order: 0 }];
    const full = Array.from({ length: PAGE_CAPACITY - 1 }, (_, i) =>
      placement({
        id: `s${i}`,
        x: ((i % 6) + 0.5) / 6,
        y: (Math.floor(i / 6) + 0.5) / 4,
      }),
    );
    const edge = placement({ id: "edge", x: 1, y: 1 });
    const r = autoPlace(pages, [...full, edge], sid(1), { page: "n", placement: "y" });
    expect(r.newPage).toEqual({ id: "n", order: 1 });
  });

  test("jitter is deterministic from the sticker id and moves the slot centre", () => {
    const place = (id: string) => autoPlace([], [], id, { page: "p", placement: "x" }).placement;
    const hi = place(`ff${"00".repeat(15)}`.padEnd(32, "0"));
    expect(hi.x).toBeCloseTo(1 / 12 + 0.015, 6);
    expect(hi.y).toBeCloseTo(1 / 8 - 0.025, 6);
    expect(hi.rotation).toBe(-8);
    const mixed = place(`00ff40${"0".repeat(26)}`);
    expect(mixed.x).toBeCloseTo(1 / 12 - 0.015, 6);
    expect(mixed.y).toBeCloseTo(1 / 8 + 0.025, 6);
    expect(mixed.rotation).toBe(-4);
    expect(place(sid(5))).toEqual(place(sid(5)));
  });

  test("a non-hex id still gives finite coordinates", () => {
    const p = autoPlace([], [], "zz".repeat(16), { page: "p", placement: "x" }).placement;
    expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.rotation)).toBe(true);
    expect(p.rotation).toBe(-8);
  });

  test("applyChange changes only the given fields", () => {
    const p = placement({ x: 0.2, y: 0.3, scale: 3, rotation: 45 });
    expect(applyChange(p, {})).toEqual(p);
    expect(applyChange(p, { x: 0.9 })).toEqual({ ...p, x: 0.9 });
    expect(applyChange(p, { y: 0.9 })).toEqual({ ...p, y: 0.9 });
    expect(applyChange(p, { scale: 1 })).toEqual({ ...p, scale: 1 });
    expect(applyChange(p, { rotation: -90 })).toEqual({ ...p, rotation: -90 });
    expect(applyChange(p, { y: -2 }).y).toBe(0);
    expect(applyChange(p, { y: 2 }).y).toBe(1);
  });

  test("bringToFront only counts the same page and needs a unique top", () => {
    const a = placement({ id: "a", z: 5 });
    const b = placement({ id: "b", z: 5 });
    const elsewhere = placement({ id: "c", pageId: "other", z: 9 });
    expect(bringToFront([a, b], a).z).toBe(6);
    expect(bringToFront([a, elsewhere], a)).toBe(a);
    expect(bringToFront([a, placement({ id: "d", z: 6 })], a).z).toBe(7);
  });

  test("normalizeRotation rounds to 0.1 degree and wraps into (-180, 180]", () => {
    expect(normalizeRotation(180)).toBe(180);
    expect(normalizeRotation(540)).toBe(180);
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(12.34)).toBe(12.3);
    expect(normalizeRotation(-725)).toBe(-5);
  });
});

describe("spreads from pages", () => {
  test("every two pages become a spread, left then right; stickers move into their half", () => {
    const pages: Page[] = [
      { id: "c", order: 2 },
      { id: "a", order: 0 },
      { id: "b", order: 1 },
    ];
    const r = spreadsFromPages(pages, [
      placement({ id: "1", pageId: "a", x: 0.5 }),
      placement({ id: "2", pageId: "b", x: 0.5 }),
      placement({ id: "3", pageId: "c", x: 1 }),
    ]);
    expect(r.pages).toEqual([
      { id: "a", order: 0 },
      { id: "c", order: 1 },
    ]);
    expect(r.placements.map((p) => [p.id, p.pageId, p.x])).toEqual([
      ["1", "a", 0.25],
      ["2", "a", 0.75],
      ["3", "c", 0.5],
    ]);
  });
});
