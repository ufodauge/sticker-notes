import { describe, expect, test } from "vite-plus/test";
import {
  distanceToWall,
  insideJar,
  jarGeometry,
  pushInside,
  wallSegments,
} from "./jar-geometry.ts";

const sizes = [
  [320, 560],
  [360, 640],
  [440, 900],
  [900, 500],
] as const;

describe("jarGeometry", () => {
  test.each(sizes)("fits inside a %i x %i canvas", (w, h) => {
    const g = jarGeometry(w, h);
    for (const [x, y] of [...g.outer, ...g.inner]) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(w);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(h);
    }
    expect(g.rim.y0).toBeGreaterThanOrEqual(0);
    expect(g.room.width).toBeGreaterThan(0);
    expect(g.room.height).toBeGreaterThan(0);
  });

  test("is mirror-symmetric and the glass has thickness", () => {
    const g = jarGeometry(360, 640);
    g.inner.forEach(([x, y], i) => {
      const [mx, my] = g.inner[g.inner.length - 1 - i] ?? [0, 0];
      expect(x + mx).toBeCloseTo(360);
      expect(y).toBeCloseTo(my);
    });
    expect(g.wall).toBeGreaterThan(4);
    expect(g.base).toBeGreaterThan(g.wall);
    // the inner floor is above the outer bottom by the base thickness
    expect(g.floorY).toBeCloseTo(g.bottomY - g.base);
    const lowestInner = Math.max(...g.inner.map((p) => p[1]));
    expect(lowestInner).toBeCloseTo(g.floorY);
  });

  test("the cavity wall stays inside the outer glass and keeps its distance", () => {
    const g = jarGeometry(360, 640);
    for (const [x, y] of g.inner) {
      expect(x).toBeGreaterThan(g.bodyX0 - 0.001);
      expect(x).toBeLessThan(g.bodyX1 + 0.001);
      expect(y).toBeLessThan(g.bottomY);
    }
    expect(g.mouth.x0).toBeGreaterThan(g.rim.x0);
    expect(g.mouth.x1).toBeLessThan(g.rim.x1);
  });

  test("the mouth is narrower than the body (a neck)", () => {
    const g = jarGeometry(360, 640);
    expect(g.mouth.x1 - g.mouth.x0).toBeLessThan(g.room.width);
  });

  test("the bottom corners are rounded: the wall turns gradually", () => {
    const g = jarGeometry(360, 640);
    const corner = g.inner.filter(([x, y]) => x < 180 && y > g.bodyEndY);
    expect(corner.length).toBeGreaterThan(6);
    const heads = corner.slice(1).map(([x, y], i) => {
      const [px, py] = corner[i] ?? [0, 0];
      return Math.atan2(y - py, x - px);
    });
    heads.slice(1).forEach((a, i) => {
      expect(Math.abs(a - (heads[i] ?? 0))).toBeLessThan(0.4);
    });
  });
});

describe("insideJar", () => {
  const g = jarGeometry(360, 640);
  test("the middle of the cavity is inside, glass and the outside are not", () => {
    expect(insideJar(g, 180, g.floorY - 30)).toBe(true);
    expect(insideJar(g, 180, g.mouth.y - 80)).toBe(true);
    expect(insideJar(g, g.bodyX0 + g.wall / 2, g.bodyEndY - 40)).toBe(false);
    expect(insideJar(g, 2, 300)).toBe(false);
    expect(insideJar(g, 180, g.floorY + g.base / 2)).toBe(false);
  });
  test("the rounded bottom corner cuts off the square corner", () => {
    expect(insideJar(g, g.bodyX0 + g.wall + 2, g.floorY - 2)).toBe(false);
    expect(insideJar(g, g.bodyX0 + g.wall + g.corner, g.floorY - 2)).toBe(true);
  });
  test("is above the mouth only between the neck walls", () => {
    expect(insideJar(g, g.mouth.x0 - 5, g.mouth.y - 50)).toBe(false);
    expect(insideJar(g, g.mouth.x0 + 5, g.mouth.y - 50)).toBe(true);
  });
});

describe("pushInside", () => {
  const g = jarGeometry(360, 640);
  test("leaves a good position alone", () => {
    expect(pushInside(g, [180, g.floorY - 40], 20)).toEqual([180, g.floorY - 40]);
  });
  test("brings a block that sits in the glass back clear of the wall", () => {
    const [x, y] = pushInside(g, [g.bodyX0 + 2, g.floorY], 25);
    expect(insideJar(g, x, y)).toBe(true);
    expect(distanceToWall(g, x, y)).toBeGreaterThanOrEqual(25);
  });
});

describe("wallSegments", () => {
  test("every slab lies outside the cavity, away from the wall line", () => {
    const g = jarGeometry(360, 640);
    const segments = wallSegments(g, 640);
    expect(segments.length).toBeGreaterThan(30);
    for (const s of segments) {
      const out = { x: s.x + s.nx * 10, y: s.y + s.ny * 10 };
      const inn = { x: s.x - s.nx * 10, y: s.y - s.ny * 10 };
      if (s.y < g.mouth.y) continue;
      expect(insideJar(g, out.x, out.y)).toBe(false);
      expect(insideJar(g, inn.x, inn.y)).toBe(true);
    }
  });
});
