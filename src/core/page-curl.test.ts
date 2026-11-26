import { describe, expect, test } from "vite-plus/test";
import {
  apply,
  peelPull,
  reach,
  roll,
  settle,
  stripMatrix,
  stripPolygon,
  type Pt,
} from "./page-curl.ts";

const W = 300;
const H = 400;

const area = (poly: readonly Pt[]) =>
  Math.abs(
    poly.reduce((sum, p, i) => {
      const q = poly[(i + 1) % poly.length] ?? p;
      return sum + p.x * q.y - q.x * p.y;
    }, 0),
  ) / 2;

const distance = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

describe("reach", () => {
  const grip = { x: W, y: H };

  test("a finger within reach is followed exactly", () => {
    expect(reach(grip, { x: 120, y: 330 }, W, H)).toEqual({ x: 120, y: 330 });
    expect(reach(grip, grip, W, H)).toEqual(grip);
  });

  test("beyond reach, the held point stays as far from the ends of the spine as it was", () => {
    // pulled straight out past the edge: it stays within both reaches, by the edge
    const far = reach(grip, { x: 900, y: H }, W, H);
    expect(distance(far, { x: 0, y: H })).toBeLessThanOrEqual(W + 1e-9);
    expect(distance(far, { x: 0, y: 0 })).toBeLessThanOrEqual(Math.hypot(W, H) + 1e-9);
    expect(far.x).toBeGreaterThan(W * 0.9);
    const up = reach(grip, { x: 0, y: -500 }, W, H);
    expect(distance(up, { x: 0, y: H })).toBeCloseTo(W);
    expect(up.y).toBeLessThan(H);
    const down = reach({ x: W, y: 0 }, { x: 0, y: 2000 }, W, H);
    expect(distance(down, { x: 0, y: 0 })).toBeCloseTo(W);
    expect(down.y).toBeGreaterThan(0);
    const back = reach({ x: W, y: 0 }, { x: -2000, y: 0 }, W, H);
    expect(distance(back, { x: 0, y: 0 })).toBeCloseTo(W);
    expect(back.x).toBeCloseTo(-W);
  });
});

describe("apply", () => {
  test("applies a canvas matrix [a, b, c, d, e, f]", () => {
    expect(apply([1, 2, 3, 4, 5, 6], { x: 10, y: 100 })).toEqual({ x: 315, y: 426 });
  });
});

describe("settle", () => {
  const from = { x: 100, y: 380 };

  test("starts where it was let go and ends on the target", () => {
    const to = { x: -W, y: H };
    expect(settle(from, to, 0, H)).toEqual(from);
    const end = settle(from, to, 1, H);
    expect(end.x).toBeCloseTo(to.x);
    expect(end.y).toBeCloseTo(to.y);
  });

  test("eases out along a low arc: up toward a target low on the page, down toward a high one", () => {
    const e = 1 - 0.7 ** 3;
    const lift = Math.sin(e * Math.PI) * H * 0.06;
    const low = settle(from, { x: -W, y: H }, 0.3, H);
    expect(low.x).toBeCloseTo(from.x + (-W - from.x) * e);
    expect(low.y).toBeCloseTo(from.y + (H - from.y) * e - lift);
    const high = settle({ x: 100, y: 20 }, { x: -W, y: 0 }, 0.3, H);
    expect(high.y).toBeCloseTo(20 - 20 * e + lift);
  });
});

describe("roll", () => {
  test("nothing rolls while the paper is held where it lies", () => {
    expect(roll({ x: W, y: H }, { x: W, y: H }, W, H)).toBeUndefined();
    expect(roll({ x: W, y: H }, { x: W - 0.4, y: H }, W, H)).toBeUndefined();
  });

  test.each([
    ["the edge, straight across", { x: W, y: H / 2 }, { x: W - 150, y: H / 2 }],
    ["a corner, on a slant", { x: W, y: H }, { x: 140, y: 300 }],
    ["the top edge, pulled down", { x: W / 2, y: 0 }, { x: W / 2 + 20, y: 160 }],
  ])("held at %s, the held point lands under the finger", (_, grip, finger) => {
    const r = roll(grip, finger, W, H);
    if (!r) throw new Error("no roll");
    const d = (grip.x - r.at.x) * r.normal.x + (grip.y - r.at.y) * r.normal.y;
    const strip = r.strips.find((s) => d >= s.d0 && d <= s.d1);
    if (!strip) throw new Error("the grip is on no strip");
    const landed = apply(stripMatrix(r, strip), grip);
    expect(landed.x).toBeCloseTo(finger.x, 6);
    expect(landed.y).toBeCloseTo(finger.y, 6);
  });

  test("the strips cover the lifted paper exactly, side by side, without gaps", () => {
    const r = roll({ x: W, y: H * 0.7 }, { x: 60, y: H * 0.6 }, W, H);
    if (!r) throw new Error("no roll");
    const total = r.strips.reduce((sum, s) => sum + area(stripPolygon(r, s)), 0);
    expect(total).toBeCloseTo(area(r.lifted), 3);
    expect(area(r.flat) + area(r.lifted)).toBeCloseTo(W * H, 3);
    r.strips.slice(1).forEach((s, i) => {
      const before = r.strips[i];
      expect(s.d0).toBeCloseTo(before?.d1 ?? Number.NaN);
      expect(s.x0).toBeCloseTo(before?.x1 ?? Number.NaN);
    });
  });

  test("the paper rises face up, comes over the top and lies turned over beyond", () => {
    const r = roll({ x: W, y: H / 2 }, { x: W - 200, y: H / 2 }, W, H);
    if (!r) throw new Error("no roll");
    const onRoll = r.strips.slice(0, -1);
    const beyond = r.strips.at(-1);
    expect(onRoll).toHaveLength(18);
    expect(onRoll.slice(0, 9).every((s) => !s.back)).toBe(true);
    expect(onRoll.slice(9).every((s) => s.back)).toBe(true);
    expect(beyond).toMatchObject({ back: true, height: 1 });
    expect(beyond?.d0).toBeCloseTo(Math.PI * r.radius);
    const heights = onRoll.map((s) => s.height);
    expect(heights.every((h, i) => i === 0 || h > (heights[i - 1] ?? 0))).toBe(true);
    expect(heights.at(-1)).toBeGreaterThan(0.99);
    expect(Math.max(...onRoll.map((s) => s.x1))).toBeLessThanOrEqual(r.radius + 1e-9);
    expect(beyond?.x1).toBeLessThan(0);
  });

  test("the radius grows with the pull, up to a share of the paper, and tightens to flat", () => {
    const short = roll({ x: W, y: H / 2 }, { x: W - 100, y: H / 2 }, W, H);
    const long = roll({ x: W, y: H / 2 }, { x: -W, y: H / 2 }, W, H);
    const loose = roll({ x: W, y: H / 2 }, { x: W - 100, y: H / 2 }, W, H, 0.5);
    const flat = roll({ x: W, y: H / 2 }, { x: W - 100, y: H / 2 }, W, H, 0);
    expect(short?.radius).toBeCloseTo(12);
    expect(long?.radius).toBeCloseTo(H * 0.08);
    expect(loose?.radius).toBeCloseTo(6);
    expect(flat?.radius).toBeCloseTo(0.01);
  });

  test("barely lifted, nearly all of the paper still lies flat", () => {
    const r = roll({ x: W, y: H / 2 }, { x: W - 4, y: H / 2 }, W, H);
    if (!r) throw new Error("no roll");
    expect(area(r.flat)).toBeGreaterThan(W * H * 0.98);
    expect(r.flat.some((p) => p.x === 0 && p.y === 0)).toBe(true);
  });

  test("pulled back over the spine and past it, nothing lies flat", () => {
    const r = roll({ x: W, y: H / 2 }, { x: -W - 50, y: H / 2 }, W, H);
    expect(r?.flat).toEqual([]);
  });
});

describe("a page fastened at its spine", () => {
  const spine = [
    { x: 0, y: 0 },
    { x: 0, y: H },
  ];
  const lifts = (r: NonNullable<ReturnType<typeof roll>>, p: Pt) =>
    (p.x - r.at.x) * r.normal.x + (p.y - r.at.y) * r.normal.y > 1e-9;
  const grips = [
    { x: W, y: H },
    { x: W, y: 0 },
    { x: W, y: H / 2 },
    { x: W * 0.8, y: H },
    { x: W * 0.8, y: 0 },
  ];
  const fingers = Array.from({ length: 21 * 21 }, (_, i) => ({
    x: -W * 1.5 + ((i % 21) / 20) * W * 3,
    y: -H * 0.5 + (Math.floor(i / 21) / 20) * H * 2,
  }));

  test("wherever the finger goes, the spine stays down", () => {
    const lifted = grips.flatMap((grip) =>
      fingers.flatMap((f) => {
        const r = roll(grip, reach(grip, f, W, H), W, H, 1, spine);
        return r && spine.some((p) => lifts(r, p)) ? [{ grip, f }] : [];
      }),
    );
    expect(lifted).toEqual([]);
  });

  test("unfastened paper (a sticker) lets the grip land right under the finger instead", () => {
    const grip = { x: W, y: H };
    const finger = reach(grip, { x: -W, y: -H }, W, H);
    const free = roll(grip, finger, W, H);
    const held = roll(grip, finger, W, H, 1, spine);
    if (!free || !held) throw new Error("no roll");
    expect(spine.some((p) => lifts(free, p))).toBe(true);
    expect(spine.some((p) => lifts(held, p))).toBe(false);
  });
});

describe("stripMatrix", () => {
  test("moves paper only across the axis: along it, nothing changes", () => {
    const r = roll({ x: W, y: H / 2 }, { x: W - 150, y: H / 2 + 60 }, W, H);
    if (!r) throw new Error("no roll");
    const s = r.strips[3];
    if (!s) throw new Error("no strip");
    const m = stripMatrix(r, s);
    const tangent = { x: -r.normal.y, y: r.normal.x };
    const p = { x: r.at.x + r.normal.x * s.d0, y: r.at.y + r.normal.y * s.d0 };
    const q = { x: p.x + tangent.x * 50, y: p.y + tangent.y * 50 };
    const [mp, mq] = [apply(m, p), apply(m, q)];
    expect(mq.x - mp.x).toBeCloseTo(tangent.x * 50);
    expect(mq.y - mp.y).toBeCloseTo(tangent.y * 50);
    const across = (mp.x - r.at.x) * r.normal.x + (mp.y - r.at.y) * r.normal.y;
    expect(across).toBeCloseTo(s.x0);
  });
});

describe("peelPull", () => {
  const S = 100;
  const corner = { x: S, y: S };
  // the part rolled up: the roll's axis lies (pull + π·r) / 2 back from the held edge
  const straight = (pull: number) => (pull + Math.PI * Math.min(pull * 0.12, S * 0.08)) / 2 / S;

  test("pulled straight back over the sticker, the edge follows the finger and lifts what it passes", () => {
    const edge = peelPull({ x: S, y: S / 2 }, { x: S - 80, y: S / 2 }, S);
    expect(edge.finger).toEqual({ x: S - 80, y: S / 2 });
    expect(edge.peeled).toBeCloseTo(straight(80));
    const across = peelPull({ x: S, y: S / 2 }, { x: S - 105, y: S / 2 }, S);
    expect(across.peeled).toBeCloseTo(straight(105));
    expect(across.peeled).toBeGreaterThan(0.65);
  });

  test("pulled outward, away from the sticker, nothing lifts", () => {
    const r = peelPull(corner, { x: S + 70, y: S + 70 }, S);
    expect(r.peeled).toBe(0);
    expect(r.finger.x).toBeCloseTo(corner.x);
    expect(r.finger.y).toBeCloseTo(corner.y);
    const edge = peelPull({ x: S, y: S / 2 }, { x: S + 300, y: S / 2 }, S);
    expect(edge.peeled).toBe(0);
  });

  test("a corner lifted a little and then pulled aside comes up as far as it is seen to", () => {
    const lifted = peelPull(corner, { x: S - 20, y: S - 20 }, S).peeled;
    expect(lifted).toBeLessThan(0.65);
    // then drawn down to the left, or up to the right: the roll sweeps across the sticker
    const left = peelPull(corner, { x: S - 140, y: S + 40 }, S);
    const up = peelPull(corner, { x: S + 40, y: S - 140 }, S);
    expect(left.peeled).toBeGreaterThan(0.65);
    expect(up.peeled).toBeGreaterThan(0.65);
    expect(left.peeled).toBeCloseTo(up.peeled);
  });
});
