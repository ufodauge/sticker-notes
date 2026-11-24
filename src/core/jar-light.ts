import type { JarGeometry } from "./jar-geometry.ts";
import type { Point } from "./render.ts";

// The jar stands in a dark room under one lamp above it. These are the pure numbers of that
// light: how bright it is at a point of the jar canvas, and how a tumbling block glints.

export type Beam = {
  readonly cx: number;
  // where the light enters the jar's mouth and where it has faded most (the floor)
  readonly top: number;
  readonly bottom: number;
  // half the width the beam fully lights; outside it the light falls away
  readonly half: number;
};

export const beamOf = (geo: JarGeometry): Beam => ({
  cx: geo.width / 2,
  top: geo.mouth.y,
  bottom: geo.floorY,
  half: (geo.bodyX1 - geo.bodyX0) / 2,
});

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const LIGHT_FLOOR = 0.2;

// 1 in the lamp's pool just under the mouth, LIGHT_FLOOR in the far corners and at the bottom.
export function lightAt(beam: Beam, x: number, y: number): number {
  const depth = clamp01((y - beam.top) / Math.max(1, beam.bottom - beam.top));
  const across = clamp01(Math.abs(x - beam.cx) / Math.max(1, beam.half * 1.25));
  const level = (1 - 0.75 * depth ** 0.85) * (1 - 0.45 * across ** 2);
  return LIGHT_FLOOR + (1 - LIGHT_FLOOR) * clamp01(level);
}

// How hard a block's edge flashes: the flash comes around three times per turn, so a tumbling
// block glints, and a resting one keeps the glint its angle happens to give. `phase` is a
// fixed number in [0, 1) per block, so that the pile does not flash in unison.
export function glintStrength(angle: number, phase: number): number {
  return Math.max(0, Math.cos(3 * angle + phase * Math.PI * 2)) ** 10;
}

// The point of the outline that faces the light most (the highest after turning by `angle`
// about the centre of mass `centre`), in the same unit coordinates as the outline.
export function glintPoint(outline: readonly Point[], centre: Point, angle: number): Point {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return outline.reduce<{ at: Point; top: number }>(
    (best, [x, y]) => {
      const lx = x - centre[0];
      const ly = y - centre[1];
      const top = lx * s + ly * c;
      return top < best.top ? { at: [lx, ly], top } : best;
    },
    { at: [0, 0], top: Infinity },
  ).at;
}

export type Mote = {
  // percent of the jar box
  readonly x: number;
  readonly y: number;
  // px
  readonly size: number;
  // drift in px and the seconds one cycle takes
  readonly dx: number;
  readonly dy: number;
  readonly seconds: number;
  readonly delay: number;
};

// A few specks of dust hanging in the beam, deterministic. The beam is a cone: narrow up top.
export function dustMotes(count: number): Mote[] {
  const unit = (i: number, salt: number) => {
    const v = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  return Array.from({ length: count }, (_, i): Mote => {
    const y = 4 + 76 * unit(i, 1);
    const reach = 14 + 0.2 * y;
    return {
      x: 50 + (unit(i, 2) * 2 - 1) * reach,
      y,
      size: 1.2 + 1.6 * unit(i, 3),
      dx: (unit(i, 4) * 2 - 1) * 14,
      dy: (unit(i, 5) * 2 - 1) * 20,
      seconds: 16 + 14 * unit(i, 6),
      delay: -30 * unit(i, 7),
    };
  });
}

// A fixed number in [0, 1) for a block, from its id.
export function glintPhase(id: string): number {
  const hash = Array.from(id).reduce(
    (h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619),
    2166136261,
  );
  return (hash >>> 0) / 2 ** 32;
}
