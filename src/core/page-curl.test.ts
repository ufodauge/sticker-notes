import { describe, expect, test } from "vite-plus/test";
import { apply, fold, reach, settle } from "./page-curl.ts";

const W = 300;
const H = 400;
const corner = { x: W, y: H };

describe("page curl", () => {
  test("no fold while the corner is where it lies", () => {
    expect(fold(corner, corner, W, H)).toBeUndefined();
  });

  test("the fold puts the corner under the finger and keeps the spine side flat", () => {
    const finger = { x: 200, y: 330 };
    const f = fold(corner, finger, W, H);
    if (!f) throw new Error("no fold");
    const moved = apply(f.mirror, corner);
    expect(moved.x).toBeCloseTo(finger.x);
    expect(moved.y).toBeCloseTo(finger.y);
    expect(f.flat.some((p) => p.x === 0 && p.y === 0)).toBe(true);
    expect(f.flap.length).toBeGreaterThanOrEqual(3);
  });

  test("turned all the way, the page lies mirrored on the other side of the spine", () => {
    const f = fold(corner, { x: -W, y: H }, W, H);
    if (!f) throw new Error("no fold");
    expect(f.flat).toHaveLength(0);
    const xs = f.flap.map((p) => Math.round(p.x));
    expect(Math.min(...xs)).toBe(-W);
    expect(Math.max(...xs)).toBe(0);
  });

  test("the corner cannot leave the page's reach from the spine", () => {
    const far = reach(corner, { x: 900, y: H }, W, H);
    expect(Math.hypot(far.x, far.y - H)).toBeCloseTo(W);
    const up = reach(corner, { x: 0, y: -500 }, W, H);
    expect(Math.hypot(up.x, up.y - H)).toBeLessThanOrEqual(W + 1e-6);
  });

  test("letting go eases the corner to its target", () => {
    const from = { x: 100, y: 380 };
    const to = { x: -W, y: H };
    expect(settle(from, to, 0, H)).toEqual(from);
    const end = settle(from, to, 1, H);
    expect(end.x).toBeCloseTo(to.x);
    expect(end.y).toBeCloseTo(to.y);
  });
});
