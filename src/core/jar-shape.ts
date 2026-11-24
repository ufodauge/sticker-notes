import { layoutSticker, traceContours, type Point } from "./render.ts";
import type { Sticker } from "./payload.ts";

// The acrylic block is a cut-out of the sticker: its outline is the sticker's white base plus a
// margin, and the physics body is the same shape split into a few convex parts.
// Everything is in "unit" coordinates: the whole sticker square is [-0.5, 0.5]^2 (y down), so
// block size follows the sticker's side, not the area of each silhouette.

// Empty cells between the sticker's own outline and the cut of the slab.
const SLAB_MARGIN = 4;
// More convex parts cost more per physics step; past this the block falls back to its hull.
export const MAX_PARTS = 6;
// Cells: deviation allowed when straightening the traced pixel stairs for drawing.
const DRAW_EPSILON = 0.9;
// Looser for physics; retried with the next value while the decomposition has too many parts.
const PHYSICS_EPSILONS: readonly number[] = [1.6, 2.4, 3.4, 5];
// A hull that adds less than this share of area is simply used (cheaper and more stable).
const HULL_AREA_RATIO = 1.08;
// Smaller than this (unit^2: about 1/17 of the sticker square) is a speck: use a small square.
const MIN_AREA = 0.06;
const FALLBACK_HALF = 0.28;

export type BlockShape = {
  // outer silhouette for drawing
  readonly outline: readonly Point[];
  // convex parts of the physics body; together they cover the silhouette
  readonly parts: readonly (readonly Point[])[];
  // area centroid of the parts: where the physics body's centre of mass is
  readonly centre: Point;
  readonly kind: "silhouette" | "hull" | "square";
};

type Poly = readonly Point[];

export const signedArea = (p: Poly): number =>
  p.reduce((sum, [x0, y0], i) => {
    const [x1, y1] = p[(i + 1) % p.length] ?? [x0, y0];
    return sum + (x0 * y1 - x1 * y0);
  }, 0) / 2;

export const polygonArea = (p: Poly): number => Math.abs(signedArea(p));

export function polygonCentroid(p: Poly): Point {
  const a = signedArea(p);
  if (a === 0) return p[0] ?? [0, 0];
  const sum = p.reduce(
    (acc, [x0, y0], i) => {
      const [x1, y1] = p[(i + 1) % p.length] ?? [x0, y0];
      const cross = x0 * y1 - x1 * y0;
      return [acc[0] + (x0 + x1) * cross, acc[1] + (y0 + y1) * cross] as const;
    },
    [0, 0] as readonly [number, number],
  );
  return [sum[0] / (6 * a), sum[1] / (6 * a)];
}

const cross = (o: Point, a: Point, b: Point) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

// Andrew's monotone chain; counter-clockwise in y-up terms (positive signed area).
export function convexHull(points: Poly): Point[] {
  const pts = points.toSorted((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (input: readonly Point[]) =>
    input.reduce<Point[]>((acc, p) => {
      while (acc.length >= 2) {
        const a = acc[acc.length - 2];
        const b = acc[acc.length - 1];
        if (!a || !b || cross(a, b, p) > 0) break;
        acc.pop();
      }
      acc.push(p);
      return acc;
    }, []);
  const lower = half(pts);
  const upper = half(pts.toReversed());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// Douglas-Peucker on an open chain, endpoints kept.
function chain(points: Poly, epsilon: number): Point[] {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || points.length < 3) return [...points];
  const far = points.reduce(
    (best, p, i) => {
      const d = distanceToSegment(p, first, last);
      return d > best.d ? { d, i } : best;
    },
    { d: -1, i: 0 },
  );
  if (far.d <= epsilon) return [first, last];
  return [
    ...chain(points.slice(0, far.i + 1), epsilon).slice(0, -1),
    ...chain(points.slice(far.i), epsilon),
  ];
}

// Closed-polygon Douglas-Peucker: split at the vertex farthest from the first one.
export function simplifyClosed(loop: Poly, epsilon: number): Point[] {
  const first = loop[0];
  if (!first || loop.length < 4) return [...loop];
  const split = loop.reduce(
    (best, p, i) => {
      const d = Math.hypot(p[0] - first[0], p[1] - first[1]);
      return d > best.d ? { d, i } : best;
    },
    { d: -1, i: 0 },
  ).i;
  const a = chain(loop.slice(0, split + 1), epsilon);
  const b = chain([...loop.slice(split), first], epsilon);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

const insideTriangle = (p: Point, a: Point, b: Point, c: Point) =>
  cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;

const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];

// Ear clipping of a simple polygon given by vertex indices (positive signed area).
function triangulate(pts: Poly): number[][] | null {
  const rest = pts.map((_, i) => i);
  const tris: number[][] = [];
  while (rest.length > 3) {
    const n = rest.length;
    const ear = rest.findIndex((_, k) => {
      const ia = rest[(k + n - 1) % n];
      const ib = rest[k];
      const ic = rest[(k + 1) % n];
      const a = ia === undefined ? undefined : pts[ia];
      const b = ib === undefined ? undefined : pts[ib];
      const c = ic === undefined ? undefined : pts[ic];
      if (!a || !b || !c || cross(a, b, c) <= 0) return false;
      return !rest.some((j) => {
        const p = pts[j];
        return (
          p !== undefined &&
          j !== ia &&
          j !== ib &&
          j !== ic &&
          !same(p, a) &&
          !same(p, b) &&
          !same(p, c) &&
          insideTriangle(p, a, b, c)
        );
      });
    });
    if (ear < 0) return null;
    tris.push([rest[(ear + n - 1) % n] ?? 0, rest[ear] ?? 0, rest[(ear + 1) % n] ?? 0]);
    rest.splice(ear, 1);
  }
  tris.push(rest);
  return tris;
}

const isConvexAt = (pts: Poly, loop: readonly number[], k: number) => {
  const n = loop.length;
  const a = pts[loop[(k + n - 1) % n] ?? 0];
  const b = pts[loop[k] ?? 0];
  const c = pts[loop[(k + 1) % n] ?? 0];
  return a !== undefined && b !== undefined && c !== undefined && cross(a, b, c) >= 0;
};

// Merges two index loops across their shared edge (a->b in p, b->a in q), if the result stays
// convex at both ends of that edge.
function tryMerge(pts: Poly, p: readonly number[], q: readonly number[]): number[] | null {
  const rotate = (l: readonly number[], from: number) =>
    l.map((_, k) => l[(from + k) % l.length] ?? 0);
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const j = q.findIndex((v, k) => v === b && q[(k + 1) % q.length] === a);
    if (a === undefined || b === undefined || j < 0) continue;
    const fromB = rotate(p, i + 1);
    const fromA = rotate(q, j + 1);
    const merged = [...fromB, ...fromA.slice(1, -1)];
    const ok = [0, fromB.length - 1].every((k) => isConvexAt(pts, merged, k));
    return ok ? merged : null;
  }
  return null;
}

// Hertel-Mehlhorn: triangulate, then merge neighbours while the union stays convex.
export function decompose(poly: Poly): Point[][] | null {
  const pts = signedArea(poly) < 0 ? poly.toReversed() : poly;
  const tris = triangulate(pts);
  if (!tris) return null;
  const loops = tris.slice();
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < loops.length && !merged; i++) {
      for (let j = i + 1; j < loops.length && !merged; j++) {
        const p = loops[i];
        const q = loops[j];
        const m = p && q ? tryMerge(pts, p, q) : null;
        if (!m) continue;
        loops[i] = m;
        loops.splice(j, 1);
        merged = true;
      }
    }
  }
  return loops.map((l) => l.flatMap((v) => (pts[v] ? [pts[v]] : [])));
}

const toUnit =
  (size: number) =>
  (p: Point): Point => [p[0] / size - 0.5, p[1] / size - 0.5];

function withCentre(
  outline: Poly,
  parts: readonly (readonly Point[])[],
  kind: BlockShape["kind"],
): BlockShape {
  const weights = parts.map((p) => ({ a: polygonArea(p), c: polygonCentroid(p) }));
  const total = weights.reduce((s, w) => s + w.a, 0);
  const centre: Point = [
    weights.reduce((s, w) => s + w.a * w.c[0], 0) / total,
    weights.reduce((s, w) => s + w.a * w.c[1], 0) / total,
  ];
  return { outline, parts, centre, kind };
}

function fallbackShape(): BlockShape {
  const h = FALLBACK_HALF;
  const square: Point[] = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ];
  return withCentre(square, [square], "square");
}

// Physics parts (in cells): the silhouette split into convex parts, or its hull when it is nearly convex
// or would need more than MAX_PARTS.
function physicsParts(loop: Poly): { parts: Point[][]; kind: "silhouette" | "hull" } {
  const hull = convexHull(loop);
  const hullOnly = { parts: [hull], kind: "hull" as const };
  if (polygonArea(hull) <= polygonArea(loop) * HULL_AREA_RATIO) return hullOnly;
  for (const epsilon of PHYSICS_EPSILONS) {
    const parts = decompose(simplifyClosed(loop, epsilon));
    if (parts && parts.length <= MAX_PARTS && parts.every((p) => p.length >= 3)) {
      return { parts, kind: "silhouette" };
    }
  }
  return hullOnly;
}

export function blockShape(sticker: Sticker): BlockShape {
  const layout = layoutSticker(sticker, SLAB_MARGIN);
  const contours = traceContours(layout).filter((c) => c.length >= 3);
  if (contours.length === 0) return fallbackShape();
  // the base has no holes (they are filled); separate blobs join into one slab through their hull
  const loop = contours.length === 1 ? (contours[0] ?? []) : convexHull(contours.flat());
  const unit = toUnit(layout.size);
  const drawn = simplifyClosed(loop, DRAW_EPSILON).map(unit);
  if (polygonArea(drawn) < MIN_AREA) return fallbackShape();
  const { parts, kind } = physicsParts(loop);
  return withCentre(
    drawn,
    parts.map((part) => part.map(unit)),
    kind,
  );
}
