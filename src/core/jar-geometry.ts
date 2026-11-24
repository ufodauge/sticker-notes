import type { Point } from "./render.ts";
import type { JarSize } from "./jar-layout.ts";

// A wide-mouth glass jar seen from the side. All numbers are CSS px inside a canvas of
// `width` x `height`; the jar sits at the bottom of the canvas and the space above it is where
// blocks drop in from.

const SIDE_MARGIN = 0.04;
const BOTTOM_MARGIN = 0.05;
const MAX_ASPECT = 1.55;
const WALL = 0.032;
const MIN_WALL = 5;
const MAX_WALL = 13;
const BASE_PER_WALL = 1.7;
const RIM_PER_WALL = 1.5;
const LIP_PER_WALL = 0.6;
const NECK_IN = 0.05;
const NECK_HEIGHT = 0.035;
const SHOULDER_HEIGHT = 0.08;
const CORNER = 0.15;
const CURVE_STEPS = 12;

export type JarGeometry = {
  readonly width: number;
  readonly height: number;
  // glass thickness of the walls, of the base, and the lip (rim) on top
  readonly wall: number;
  readonly base: number;
  readonly rim: {
    readonly x0: number;
    readonly x1: number;
    readonly y0: number;
    readonly y1: number;
  };
  // outer glass silhouette below the rim: left side top to bottom centre, then mirrored
  readonly outer: readonly Point[];
  // the cavity wall as an open polyline from the left mouth edge round the bottom to the right
  readonly inner: readonly Point[];
  // where blocks enter: the cavity's mouth
  readonly mouth: { readonly x0: number; readonly x1: number; readonly y: number };
  // y of the cavity floor at its lowest, and the straight part's width: for block sizing
  readonly floorY: number;
  readonly room: JarSize;
  // y where the straight side walls end and the rounded bottom begins
  readonly bodyEndY: number;
  readonly shoulderEndY: number;
  readonly bodyX0: number;
  readonly bodyX1: number;
  readonly bottomY: number;
  readonly corner: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const mirror = (left: readonly Point[], width: number): Point[] => [
  ...left,
  ...left
    .slice(0, -1)
    .toReversed()
    .map(([x, y]): Point => [width - x, y]),
];

function cubic(p0: Point, p1: Point, p2: Point, p3: Point, steps: number): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
    return [
      w[0] * p0[0] + w[1] * p1[0] + w[2] * p2[0] + w[3] * p3[0],
      w[0] * p0[1] + w[1] * p1[1] + w[2] * p2[1] + w[3] * p3[1],
    ];
  });
}

export function jarGeometry(width: number, height: number): JarGeometry {
  const sideMargin = width * SIDE_MARGIN;
  const bodyX0 = sideMargin;
  const bodyX1 = width - sideMargin;
  const bodyW = bodyX1 - bodyX0;
  const bottomY = height - width * BOTTOM_MARGIN;
  const jarH = Math.max(bodyW * 0.5, Math.min(bottomY - 2, bodyW * MAX_ASPECT));
  const top = bottomY - jarH;
  const wall = clamp(bodyW * WALL, MIN_WALL, MAX_WALL);
  const base = wall * BASE_PER_WALL;
  const rimH = wall * RIM_PER_WALL;
  const lip = wall * LIP_PER_WALL;
  const mouthX0 = bodyX0 + bodyW * NECK_IN;
  const neckTop = top + rimH;
  const neckEnd = neckTop + jarH * NECK_HEIGHT;
  const shoulderEndY = neckEnd + jarH * SHOULDER_HEIGHT;
  const corner = bodyW * CORNER;
  const bodyEndY = bottomY - corner;
  const cx = width / 2;

  // left half of the glass surface offset inward by (tx, ty); tx = ty = 0 is the outside
  const profile = (tx: number, ty: number): Point[] => {
    const rx = corner - tx;
    const ry = corner - ty;
    const shoulder = cubic(
      [mouthX0 + tx, neckEnd],
      [mouthX0 + tx, neckEnd + (shoulderEndY - neckEnd) * 0.55],
      [bodyX0 + tx, shoulderEndY - (shoulderEndY - neckEnd) * 0.55],
      [bodyX0 + tx, shoulderEndY],
      CURVE_STEPS,
    );
    const arc = Array.from({ length: CURVE_STEPS + 1 }, (_, i): Point => {
      const a = Math.PI - (i / CURVE_STEPS) * (Math.PI / 2);
      return [bodyX0 + corner + rx * Math.cos(a), bodyEndY + ry * Math.sin(a)];
    });
    return [[mouthX0 + tx, neckTop], ...shoulder, ...arc, [cx, bottomY - ty]];
  };

  const outer = mirror(profile(0, 0), width);
  const inner = mirror(profile(wall, base), width);
  const floorY = bottomY - base;
  const mouthInner = { x0: mouthX0 + wall, x1: width - mouthX0 - wall, y: top };
  return {
    width,
    height,
    wall,
    base,
    rim: { x0: mouthX0 - lip, x1: width - mouthX0 + lip, y0: top, y1: neckTop },
    outer,
    inner,
    mouth: mouthInner,
    floorY,
    room: { width: bodyW - 2 * wall, height: floorY - neckEnd },
    bodyEndY,
    shoulderEndY,
    bodyX0,
    bodyX1,
    bottomY,
    corner,
  };
}

// The cavity as a closed polygon; open above (the top is closed far away) so blocks that are
// still dropping in count as inside.
function cavity(geo: JarGeometry): Point[] {
  const [first] = geo.inner;
  const last = geo.inner.at(-1);
  if (!first || !last) return [];
  return [...geo.inner, [last[0], -1e5], [first[0], -1e5]];
}

export function insideJar(geo: JarGeometry, x: number, y: number): boolean {
  const poly = cavity(geo);
  return poly.reduce((inside, [x0, y0], i) => {
    const [x1, y1] = poly[(i + 1) % poly.length] ?? [x0, y0];
    const crosses = y0 > y !== y1 > y && x < ((x1 - x0) * (y - y0)) / (y1 - y0) + x0;
    return crosses ? !inside : inside;
  }, false);
}

export function distanceToWall(geo: JarGeometry, x: number, y: number): number {
  return geo.inner.reduce((best, [x0, y0], i) => {
    const next = geo.inner[i + 1];
    if (!next) return best;
    const dx = next[0] - x0;
    const dy = next[1] - y0;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : clamp(((x - x0) * dx + (y - y0) * dy) / len2, 0, 1);
    return Math.min(best, Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy)));
  }, Number.POSITIVE_INFINITY);
}

const PUSH_STEPS = 60;
const PUSH_FRACTION = 0.1;

// Moves a block centre towards the middle of the jar until it clears the walls by `radius`.
export function pushInside(geo: JarGeometry, p: Point, radius: number): Point {
  const target: Point = [geo.width / 2, geo.floorY - radius * 1.5];
  const ok = ([x, y]: Point) => insideJar(geo, x, y) && distanceToWall(geo, x, y) >= radius;
  return Array.from({ length: PUSH_STEPS }).reduce<Point>(
    (cur) =>
      ok(cur)
        ? cur
        : [
            cur[0] + (target[0] - cur[0]) * PUSH_FRACTION,
            cur[1] + (target[1] - cur[1]) * PUSH_FRACTION,
          ],
    p,
  );
}

// Wall segments for the physics: each one as the centre, length and angle of a thick slab lying
// outside the cavity. The first and last segments continue straight up past the mouth.
export type WallSegment = {
  readonly x: number;
  readonly y: number;
  readonly length: number;
  readonly angle: number;
  // unit normal pointing out of the cavity
  readonly nx: number;
  readonly ny: number;
};

export function wallSegments(geo: JarGeometry, extendUp: number): WallSegment[] {
  const [first] = geo.inner;
  const last = geo.inner.at(-1);
  if (!first || !last) return [];
  const line: Point[] = [
    [first[0], first[1] - extendUp],
    ...geo.inner,
    [last[0], last[1] - extendUp],
  ];
  return line.flatMap((a, i): WallSegment[] => {
    const b = line[i + 1];
    if (!b) return [];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) return [];
    // travelling down the left side, round the bottom and up the right: the cavity is on the left
    // of the direction in screen coordinates, so the outward normal is (-dy, dx) / length
    return [
      {
        x: (a[0] + b[0]) / 2,
        y: (a[1] + b[1]) / 2,
        length,
        angle: Math.atan2(dy, dx),
        nx: -dy / length,
        ny: dx / length,
      },
    ];
  });
}
