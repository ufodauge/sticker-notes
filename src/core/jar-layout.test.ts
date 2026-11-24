import { describe, expect, test } from "vite-plus/test";
import { blockSide, initialPile, MAX_SIDE, MIN_SIDE } from "./jar-layout.ts";

const jar = { width: 360, height: 640 };

describe("blockSide", () => {
  test("shrinks as the count grows, within bounds", () => {
    expect(blockSide(1, jar)).toBe(MAX_SIDE);
    expect(blockSide(20, jar)).toBeGreaterThan(blockSide(100, jar));
    expect(blockSide(100, jar)).toBeGreaterThan(blockSide(300, jar));
    expect(blockSide(100000, jar)).toBe(MIN_SIDE);
  });
});

describe("initialPile", () => {
  test("is deterministic and inside the jar", () => {
    const side = blockSide(100, jar);
    const a = initialPile(100, jar, side, 0);
    expect(initialPile(100, jar, side, 0)).toEqual(a);
    expect(a).toHaveLength(100);
    for (const p of a) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(jar.width);
      expect(p.y).toBeLessThan(jar.height);
    }
  });

  test("lift raises every block by the same amount", () => {
    const a = initialPile(10, jar, 40, 0);
    const b = initialPile(10, jar, 40, 100);
    expect((b[3]?.y ?? 0) - (a[3]?.y ?? 0)).toBeCloseTo(-100);
  });
});
