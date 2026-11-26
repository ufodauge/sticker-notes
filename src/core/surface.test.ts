import { describe, expect, test } from "vite-plus/test";
import type { Placement } from "./album.ts";
import { SURFACES, dotsOf, hasRoom, isSurface, localOf, screenOf, surfaceOf } from "./surface.ts";

const on = (pageId: string, stickerId: string): Placement => ({
  id: `p-${stickerId}`,
  pageId,
  stickerId,
  x: 0.5,
  y: 0.5,
  scale: 2,
  rotation: 0,
  z: 1,
});

describe("the desk", () => {
  test("is known by its ID; a page's ID is not a surface", () => {
    expect(surfaceOf("surface:desk")).toBe("desk");
    expect(isSurface("surface:desk")).toBe(true);
    expect(surfaceOf("surface:laptop")).toBeUndefined();
    expect(isSurface(crypto.randomUUID())).toBe(false);
    expect(isSurface("")).toBe(false);
  });

  test("a sticker keeps its size on it: dots are 300 to a page", () => {
    expect(dotsOf("desk")).toBe(SURFACES.desk.w * 300);
  });

  test("holds only so many; one already there can still move about on it", () => {
    const full = Array.from({ length: SURFACES.desk.capacity }, (_, i) =>
      on("surface:desk", `s${i}`),
    );
    expect(hasRoom("desk", full.slice(1))).toBe(true);
    expect(hasRoom("desk", full)).toBe(false);
    expect(hasRoom("desk", full, "s0")).toBe(true);
    expect(hasRoom("desk", [on("page-1", "x")])).toBe(true);
  });
});

describe("a turned surface on the screen", () => {
  const f = { cx: 200, cy: 100, w: 100, h: 60, angle: 90 };

  test("the centre is the middle of the surface, however it is turned", () => {
    expect(localOf(f, 200, 100)).toEqual({ u: 0.5, v: 0.5 });
  });

  test("turned a quarter, its top left corner lies at the top right", () => {
    const corner = screenOf(f, 0, 0);
    expect(corner.x).toBeCloseTo(230);
    expect(corner.y).toBeCloseTo(50);
    const back = localOf(f, corner.x, corner.y);
    expect(back.u).toBeCloseTo(0);
    expect(back.v).toBeCloseTo(0);
  });

  test("there and back again, at any turn", () => {
    for (const angle of [0, 17, -45, 135, 180]) {
      const g = { ...f, angle };
      const p = screenOf(g, 0.2, 0.9);
      const q = localOf(g, p.x, p.y);
      expect(q.u).toBeCloseTo(0.2);
      expect(q.v).toBeCloseTo(0.9);
    }
  });
});
