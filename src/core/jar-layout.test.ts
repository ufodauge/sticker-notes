import { describe, expect, test } from "vite-plus/test";
import {
  blockSide,
  dropPose,
  fitSide,
  initialPile,
  MAX_SIDE,
  MIN_SIDE,
  rescalePose,
} from "./jar-layout.ts";

const jar = { width: 360, height: 640 };

describe("blockSide", () => {
  test("shrinks as the count grows, within bounds", () => {
    expect(blockSide(1, jar)).toBe(MAX_SIDE);
    expect(blockSide(20, jar)).toBeGreaterThan(blockSide(100, jar));
    expect(blockSide(100, jar)).toBeGreaterThan(blockSide(300, jar));
    expect(blockSide(100000, jar)).toBe(MIN_SIDE);
  });
});

describe("fitSide", () => {
  test("keeps the current side for a one-block change and follows big changes", () => {
    const side = blockSide(40, jar);
    expect(fitSide(side, 41, jar)).toBe(side);
    expect(fitSide(side, 120, jar)).toBe(blockSide(120, jar));
  });
});

describe("initialPile", () => {
  test("is deterministic and inside the jar", () => {
    const side = blockSide(100, jar);
    const a = initialPile(100, jar, side);
    expect(initialPile(100, jar, side)).toEqual(a);
    expect(a).toHaveLength(100);
    for (const p of a) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(jar.width);
      expect(p.y).toBeLessThan(jar.height);
    }
  });
});

describe("dropPose", () => {
  test("starts above the rim, inside the walls, and differs between neighbours", () => {
    const side = 40;
    const poses = Array.from({ length: 30 }, (_, i) => dropPose(i, jar, side));
    for (const p of poses) {
      expect(p.y).toBeLessThan(0);
      expect(p.x).toBeGreaterThan(side / 2);
      expect(p.x).toBeLessThan(jar.width - side / 2);
    }
    const keys = new Set(poses.map((p) => `${p.x}:${p.y}`));
    expect(keys.size).toBe(30);
  });
});

describe("rescalePose", () => {
  const big = { width: 400, height: 700 };

  test("an unchanged jar leaves the pose alone", () => {
    const p = { x: 120, y: 600, angle: 0.1 };
    expect(rescalePose(p, jar, jar, 40, 40)).toEqual(p);
  });

  test("keeps the distance from the floor proportional to the block size", () => {
    const p = { x: 180, y: jar.height - 60, angle: 0 };
    const q = rescalePose(p, jar, big, 40, 80);
    expect(big.height - q.y).toBeCloseTo(120);
  });

  test("clamps poses inside the new jar", () => {
    const small = { width: 200, height: 300 };
    for (const x of [0, 10, 180, 350]) {
      const q = rescalePose({ x, y: 100, angle: 0 }, jar, small, 40, 40);
      expect(q.x).toBeGreaterThanOrEqual(20);
      expect(q.x).toBeLessThanOrEqual(small.width - 20);
    }
  });

  test("a block on the floor stays on the floor", () => {
    const q = rescalePose({ x: 100, y: jar.height - 20, angle: 0 }, jar, small(), 40, 30);
    expect(q.y).toBeCloseTo(small().height - 15);
  });
});

function small() {
  return { width: 300, height: 480 };
}
