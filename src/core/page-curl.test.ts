import { describe, expect, test } from "vite-plus/test";
import { apply, fold, reach, roll, settle, stripMatrix } from "./page-curl.ts";

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

describe("gripped by the edge", () => {
  test("pulled straight across, the page folds along a straight up-and-down line", () => {
    const grip = { x: W, y: H / 2 };
    const f = fold(grip, { x: W - 120, y: H / 2 }, W, H);
    if (!f) throw new Error("no fold");
    expect(f.normal.x).toBeCloseTo(1);
    expect(f.normal.y).toBeCloseTo(0);
    expect(f.at.x).toBeCloseTo(W - 60);
  });
});

describe("roll", () => {
  test("the gripped point lands under the finger", () => {
    const grip = { x: W, y: H / 2 };
    const finger = { x: W - 150, y: H / 2 };
    const r = roll(grip, finger, W, H);
    if (!r) throw new Error("no roll");
    const last = r.strips.at(-1);
    if (!last) throw new Error("no strips");
    const landed = apply(stripMatrix(r, last), grip);
    expect(landed.x).toBeCloseTo(finger.x, 0);
    expect(landed.y).toBeCloseTo(finger.y, 0);
  });

  test("the roll turns from front to back over its top", () => {
    const r = roll({ x: W, y: H / 2 }, { x: W - 200, y: H / 2 }, W, H);
    if (!r) throw new Error("no roll");
    expect(r.strips[0]?.back).toBe(false);
    expect(r.strips.at(-1)?.back).toBe(true);
    expect(Math.max(...r.strips.map((s) => s.height))).toBeCloseTo(1);
  });
});
