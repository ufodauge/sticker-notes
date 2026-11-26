import { describe, expect, test } from "vite-plus/test";
import type { Placement } from "./album.ts";
import {
  SURFACES,
  clampSpot,
  hasRoom,
  isSurface,
  spotOf,
  surfaceOf,
  surfacesFor,
  THING_KINDS,
  dotsOf,
  localOf,
  screenOf,
} from "./surface.ts";

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

describe("surfaces", () => {
  test("a surface is known by its ID; a page's ID is not one", () => {
    expect(surfaceOf("surface:desk")).toBe("desk");
    expect(surfaceOf("surface:notebook")).toBe("notebook");
    expect(surfaceOf("surface:laptop")).toBe("laptop");
    expect(isSurface("surface:desk")).toBe(true);
    expect(isSurface(crypto.randomUUID())).toBe(false);
    expect(isSurface("")).toBe(false);
  });

  test("the desk and a notebook are there from the start; the laptop arrives with the third person", () => {
    expect(surfacesFor(0)).toEqual(["desk", "notebook"]);
    expect(surfacesFor(2)).toEqual(["desk", "notebook"]);
    expect(surfacesFor(3)).toEqual(["desk", "notebook", "laptop"]);
    expect(THING_KINDS).toEqual(["notebook", "laptop"]);
  });

  test("a sticker keeps its size: dots are 300 to a page, whatever it is stuck on", () => {
    expect(dotsOf("notebook")).toBe(300);
    expect(dotsOf("desk")).toBe(SURFACES.desk.w * 300);
    expect(dotsOf("laptop")).toBeCloseTo(615);
  });

  test("a surface holds only so many; one already there can still move about on it", () => {
    const full = Array.from({ length: SURFACES.notebook.capacity }, (_, i) =>
      on("surface:notebook", `s${i}`),
    );
    expect(hasRoom("notebook", full.slice(1))).toBe(true);
    expect(hasRoom("notebook", full)).toBe(false);
    expect(hasRoom("notebook", full, "s0")).toBe(true);
    expect(hasRoom("laptop", full)).toBe(true);
  });

  test("each thing lies where it was put, turned as it was; unmoved, it starts from the shape's layout", () => {
    const saved = { laptop: { x: 1, y: -1, r: 30 } };
    expect(spotOf(saved, "tall", "laptop")).toEqual({ x: 1, y: -1, r: 30 });
    expect(spotOf(saved, "tall", "notebook")).toEqual(spotOf(undefined, "tall", "notebook"));
    expect(spotOf(undefined, "wide", "laptop").x).toBeGreaterThan(1);
  });

  test("a thing stays on the desk, and its turn is kept within a half turn either way", () => {
    expect(clampSpot({ x: -30, y: 30, r: 0 })).toEqual({ x: -4.1, y: 3.1, r: 0 });
    expect(clampSpot({ x: 0, y: 0, r: 200 }).r).toBeCloseTo(-160);
    expect(clampSpot({ x: 0, y: 0, r: -190 }).r).toBeCloseTo(170);
    expect(clampSpot({ x: 0, y: 0, r: 360 }).r).toBe(0);
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
