import { expect, test } from "vite-plus/test";
import { jarGeometry } from "./jar-geometry.ts";
import {
  LIGHT_FLOOR,
  beamOf,
  dustMotes,
  glintPhase,
  glintPoint,
  glintStrength,
  lightAt,
} from "./jar-light.ts";

const beam = beamOf(jarGeometry(400, 620));

test("the light is brightest under the mouth and fades down and sideways", () => {
  const top = lightAt(beam, beam.cx, beam.top);
  const mid = lightAt(beam, beam.cx, (beam.top + beam.bottom) / 2);
  const low = lightAt(beam, beam.cx, beam.bottom);
  expect(top).toBeCloseTo(1, 5);
  expect(top).toBeGreaterThan(mid);
  expect(mid).toBeGreaterThan(low);
  expect(low).toBeGreaterThan(LIGHT_FLOOR);
  const y = (beam.top + beam.bottom) / 2;
  expect(lightAt(beam, beam.cx, y)).toBeGreaterThan(lightAt(beam, beam.cx + beam.half * 0.7, y));
  expect(lightAt(beam, beam.cx + beam.half, y)).toBeCloseTo(lightAt(beam, beam.cx - beam.half, y));
});

test("the light stays within its floor and 1, however far outside the jar", () => {
  for (const [x, y] of [
    [-500, -500],
    [5000, 5000],
    [beam.cx, -100],
    [0, beam.bottom],
  ] as const) {
    const v = lightAt(beam, x, y);
    expect(v).toBeGreaterThanOrEqual(LIGHT_FLOOR);
    expect(v).toBeLessThanOrEqual(1);
  }
});

test("glints flash about three times per turn, sharply, and differ by phase", () => {
  const turn = Array.from({ length: 360 }, (_, i) => glintStrength((i / 360) * Math.PI * 2, 0.2));
  const peaks = turn.filter((v, i) => v > 0.99 && (turn[(i + 359) % 360] ?? 0) <= v);
  expect(peaks.length).toBe(3);
  expect(Math.max(...turn)).toBeCloseTo(1, 2);
  expect(turn.filter((v) => v > 0.1).length).toBeLessThan(180);
  expect(glintStrength(0, 0)).toBeCloseTo(1, 5);
  expect(glintStrength(0, 0.5)).toBe(0);
});

test("the glint sits on the outline point that faces the light", () => {
  const square: [number, number][] = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ];
  const [x0, y0] = glintPoint(square, [0, 0], 0);
  expect(y0).toBe(-0.5);
  expect(Math.abs(x0)).toBe(0.5);
  // turned a quarter, a different corner is on top
  const [x1, y1] = glintPoint(square, [0, 0], Math.PI / 4);
  expect(Math.abs(x1) + Math.abs(y1)).toBeCloseTo(1);
  const world = (a: number, [x, y]: [number, number]) => x * Math.sin(a) + y * Math.cos(a);
  const top = Math.min(...square.map((p) => world(Math.PI / 4, p)));
  expect(world(Math.PI / 4, [x1, y1])).toBeCloseTo(top);
});

test("dust is deterministic and hangs inside a cone around the beam's axis", () => {
  const motes = dustMotes(12);
  expect(motes).toEqual(dustMotes(12));
  expect(motes).toHaveLength(12);
  for (const m of motes) {
    expect(m.y).toBeGreaterThanOrEqual(0);
    expect(m.y).toBeLessThanOrEqual(85);
    expect(Math.abs(m.x - 50)).toBeLessThanOrEqual(14 + 0.2 * m.y + 1e-9);
    expect(m.seconds).toBeGreaterThan(10);
    expect(m.delay).toBeLessThanOrEqual(0);
  }
});

test("a block keeps its glint phase, and different ids differ", () => {
  expect(glintPhase("abc")).toBe(glintPhase("abc"));
  const phases = new Set(Array.from({ length: 30 }, (_, i) => glintPhase(`block-${i}`)));
  expect(phases.size).toBe(30);
  for (const p of phases) {
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(1);
  }
});
