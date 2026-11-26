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
    expect(surfaceOf("surface:laptop")).toBe("laptop");
    expect(isSurface("surface:desk")).toBe(true);
    expect(isSurface(crypto.randomUUID())).toBe(false);
    expect(isSurface("")).toBe(false);
  });

  test("the desk is there from the start; the laptop arrives with the third person", () => {
    expect(surfacesFor(0)).toEqual(["desk"]);
    expect(surfacesFor(2)).toEqual(["desk"]);
    expect(surfacesFor(3)).toEqual(["desk", "laptop"]);
    expect(surfacesFor(50)).toEqual(["desk", "laptop"]);
  });

  test("a surface holds only so many; one already there can still move about on it", () => {
    const full = Array.from({ length: SURFACES.desk.capacity }, (_, i) =>
      on("surface:desk", `s${i}`),
    );
    expect(hasRoom("desk", full.slice(1))).toBe(true);
    expect(hasRoom("desk", full)).toBe(false);
    expect(hasRoom("desk", full, "s0")).toBe(true);
    expect(hasRoom("laptop", full)).toBe(true);
  });

  test("each thing lies where it was put; unmoved, the mat and laptop sit side by side or stacked", () => {
    expect(spotOf(undefined, "tall", "desk").x).toBeLessThan(spotOf(undefined, "tall", "laptop").x);
    expect(spotOf(undefined, "wide", "desk").y).toBeLessThan(spotOf(undefined, "wide", "laptop").y);
    expect(spotOf({ laptop: { x: 0.4, y: 0.6 } }, "tall", "laptop")).toEqual({ x: 0.4, y: 0.6 });
    expect(spotOf({ laptop: { x: 0.4, y: 0.6 } }, "tall", "desk")).toEqual(
      spotOf(undefined, "tall", "desk"),
    );
  });

  test("a thing may hang over the desk's edge a little, never off it", () => {
    expect(clampSpot({ x: -3, y: 9 })).toEqual({ x: 0.08, y: 0.92 });
    expect(clampSpot({ x: 0.5, y: 0.5 })).toEqual({ x: 0.5, y: 0.5 });
    expect(spotOf({ desk: { x: 2, y: -1 } }, "wide", "desk")).toEqual({ x: 0.92, y: 0.08 });
  });
});
