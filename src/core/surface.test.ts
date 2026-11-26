import { describe, expect, test } from "vite-plus/test";
import type { Placement } from "./album.ts";
import { SURFACES, hasRoom, isSurface, surfaceOf, surfacesFor } from "./surface.ts";

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
});
