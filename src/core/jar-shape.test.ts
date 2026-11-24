import { describe, expect, test } from "vite-plus/test";
import {
  blockShape,
  convexHull,
  decompose,
  MAX_PARTS,
  polygonArea,
  signedArea,
  simplifyClosed,
  type BlockShape,
} from "./jar-shape.ts";
import { PIXEL_COUNT, STICKER_SIZE, type Sticker } from "./payload.ts";
import type { Point } from "./render.ts";
import { FIXTURES } from "./testing/fixtures.ts";

const sticker = (filled: (x: number, y: number) => boolean): Sticker => ({
  paletteId: 0,
  transparentIndex: 0,
  snsKind: 1,
  snsId: "t",
  pixels: Uint8Array.from({ length: PIXEL_COUNT }, (_, i) =>
    filled(i % STICKER_SIZE, Math.floor(i / STICKER_SIZE)) ? 5 : 0,
  ),
});

const disc = (cx: number, cy: number, r: number) => (x: number, y: number) =>
  Math.hypot(x - cx, y - cy) <= r;
const box = (x0: number, y0: number, x1: number, y1: number) => (x: number, y: number) =>
  x >= x0 && x <= x1 && y >= y0 && y <= y1;

const isConvex = (p: readonly Point[]) => {
  const sign = Math.sign(signedArea(p));
  return p.every((a, i) => {
    const b = p[(i + 1) % p.length] ?? a;
    const c = p[(i + 2) % p.length] ?? a;
    return sign * ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) >= -1e-9;
  });
};

const inside = (p: readonly Point[], [x, y]: Point) =>
  p.reduce((acc, [x0, y0], i) => {
    const [x1, y1] = p[(i + 1) % p.length] ?? [x0, y0];
    return y0 > y !== y1 > y && x < ((x1 - x0) * (y - y0)) / (y1 - y0) + x0 ? !acc : acc;
  }, false);

const covered = (shape: BlockShape, at: Point) => shape.parts.some((part) => inside(part, at));
const partsArea = (shape: BlockShape) => shape.parts.reduce((s, p) => s + polygonArea(p), 0);
const bounds = (pts: readonly Point[]) => ({
  w: Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])),
  h: Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1])),
});

describe("simplifyClosed", () => {
  test("straightens pixel stairs and is deterministic", () => {
    const stairs: Point[] = [[0, 0]];
    for (let i = 0; i < 10; i++) stairs.push([i + 1, i], [i + 1, i + 1]);
    stairs.push([0, 11]);
    const out = simplifyClosed(stairs, 1);
    expect(out.length).toBeLessThan(stairs.length / 2);
    expect(simplifyClosed(stairs, 1)).toEqual(out);
    expect(Math.abs(polygonArea(out) - polygonArea(stairs))).toBeLessThan(8);
  });
  test("keeps tiny loops as they are", () => {
    const tri: Point[] = [
      [0, 0],
      [4, 0],
      [0, 4],
    ];
    expect(simplifyClosed(tri, 1)).toEqual(tri);
  });
});

describe("convexHull", () => {
  test("drops interior and collinear points", () => {
    const hull = convexHull([
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [2, 2],
      [2, 0],
    ]);
    expect(hull).toHaveLength(4);
    expect(polygonArea(hull)).toBe(16);
  });
});

describe("decompose", () => {
  const ell: Point[] = [
    [0, 0],
    [4, 0],
    [4, 2],
    [2, 2],
    [2, 6],
    [0, 6],
  ];
  test("splits an L into convex parts that tile it exactly", () => {
    const parts = decompose(ell);
    expect(parts).not.toBeNull();
    expect(parts?.length).toBeGreaterThanOrEqual(2);
    expect(parts?.every(isConvex)).toBe(true);
    expect(parts?.reduce((s, p) => s + polygonArea(p), 0)).toBeCloseTo(polygonArea(ell));
  });
  test("accepts either winding and a convex polygon stays whole", () => {
    expect(decompose(ell.toReversed())?.length).toBeGreaterThanOrEqual(2);
    expect(
      decompose([
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ]),
    ).toHaveLength(1);
  });
});

describe("blockShape", () => {
  test("a fixture sticker gets a bounded number of convex parts covering its silhouette", () => {
    const slime = FIXTURES.slime;
    if (!slime) throw new Error("no fixture");
    const shape = blockShape(slime);
    expect(shape.parts.length).toBeGreaterThanOrEqual(1);
    expect(shape.parts.length).toBeLessThanOrEqual(MAX_PARTS);
    expect(shape.parts.every(isConvex)).toBe(true);
    expect(covered(shape, [0, 0.12])).toBe(true);
    expect(blockShape(slime)).toEqual(shape);
  });

  test("a concave sticker is split, a round one is a single hull", () => {
    const ell = blockShape(sticker((x, y) => box(4, 4, 11, 27)(x, y) || box(4, 20, 27, 27)(x, y)));
    expect(ell.kind).toBe("silhouette");
    expect(ell.parts.length).toBeGreaterThanOrEqual(2);
    expect(ell.parts.every(isConvex)).toBe(true);
    // the notch of the L is empty, so no part reaches into it
    expect(covered(ell, [0.2, -0.2])).toBe(false);

    const round = blockShape(sticker(disc(15.5, 15.5, 11)));
    expect(round.kind).toBe("hull");
    expect(round.parts).toHaveLength(1);
  });

  test("a sticker with a hole gets a solid slab (the white base fills the hole)", () => {
    const ring = blockShape(
      sticker((x, y) => disc(15.5, 15.5, 12)(x, y) && !disc(15.5, 15.5, 5)(x, y)),
    );
    expect(covered(ring, [0, 0])).toBe(true);
  });

  test("separate blobs become one slab through their hull", () => {
    const pair = blockShape(sticker((x, y) => disc(6, 16, 3)(x, y) || disc(26, 16, 3)(x, y)));
    expect(pair.kind).toBe("hull");
    expect(pair.parts).toHaveLength(1);
    expect(covered(pair, [0, 0])).toBe(true);
  });

  test("falls back to a small rounded square for nothing, or a speck", () => {
    const nothing = blockShape(sticker(() => false));
    const speck = blockShape(sticker((x, y) => x === 16 && y === 16));
    expect(nothing.kind).toBe("square");
    expect(speck.kind).toBe("square");
    expect(nothing.parts).toHaveLength(1);
    expect(nothing.centre).toEqual([0, 0]);
    expect(partsArea(nothing)).toBeGreaterThan(0.1);
  });

  test("size follows the sticker's side, not each shape's area", () => {
    const full = blockShape(sticker(() => true));
    const small = blockShape(sticker(disc(15.5, 15.5, 5)));
    expect(bounds(full.outline).w).toBeGreaterThan(0.85);
    expect(bounds(full.outline).w).toBeLessThanOrEqual(1);
    expect(bounds(small.outline).w).toBeLessThan(0.5);
  });

  test("the centre is the area centroid of the parts", () => {
    const left = blockShape(sticker(box(2, 8, 12, 24)));
    expect(left.centre[0]).toBeLessThan(-0.15);
    expect(Math.abs(left.centre[1])).toBeLessThan(0.02);
  });
});
