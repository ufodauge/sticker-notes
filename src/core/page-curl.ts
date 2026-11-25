// A page turned where it is gripped, as paper does it: the gripped point is drawn toward the finger
// and the page folds along the line halfway between them (grip the edge and it folds straight; grip
// near a corner and the corner curls). Coordinates are the page's own, measured outward from
// the spine: u from 0 (the spine) to w (the free edge), v from 0 (top) to h (bottom).

export type Pt = { readonly x: number; readonly y: number };
type Polygon = readonly Pt[];
// a canvas transform [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f
export type Matrix = readonly [number, number, number, number, number, number];

export type Fold = {
  // a point on the fold and the unit normal pointing toward the lifted corner
  readonly at: Pt;
  readonly normal: Pt;
  // the part of the page still lying flat, and the lifted flap where it now lies (turned over)
  readonly flat: Polygon;
  readonly flap: Polygon;
  // takes a point of the page to where it lies once folded over
  readonly mirror: Matrix;
};

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const len = (a: Pt) => Math.hypot(a.x, a.y);

// The paper is held at the spine, so the gripped point can only go where the page reaches: no
// farther from either end of the spine than it lies now.
export function reach(grip: Pt, finger: Pt, _w: number, h: number): Pt {
  const within = (p: Pt, centre: Pt, r: number): Pt => {
    const d = sub(p, centre);
    const l = len(d);
    return l <= r ? p : { x: centre.x + (d.x / l) * r, y: centre.y + (d.y / l) * r };
  };
  const top = { x: 0, y: 0 };
  const bottom = { x: 0, y: h };
  return within(within(finger, top, len(sub(grip, top))), bottom, len(sub(grip, bottom)));
}

export function apply(m: Matrix, p: Pt): Pt {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

// Cuts a convex polygon by a half-plane, keeping the side where (p − at)·normal has `sign`.
function cut(poly: Polygon, at: Pt, normal: Pt, sign: 1 | -1): Pt[] {
  const side = (p: Pt) => dot(sub(p, at), normal) * sign;
  return poly.flatMap((p, i) => {
    const q = poly[(i + 1) % poly.length] ?? p;
    const sp = side(p);
    const sq = side(q);
    const out: Pt[] = sp >= 0 ? [p] : [];
    if (sp >= 0 !== sq >= 0) {
      const t = sp / (sp - sq);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
    return out;
  });
}

const area = (poly: Polygon) =>
  Math.abs(
    poly.reduce((sum, p, i) => {
      const q = poly[(i + 1) % poly.length] ?? p;
      return sum + p.x * q.y - q.x * p.y;
    }, 0),
  ) / 2;

// a sliver with no area (the page edge lying on the fold) is no polygon at all
const solid = (poly: Pt[]): Polygon => (area(poly) < 1e-6 ? [] : poly);

// The fold for the corner drawn to the finger; undefined while the page still lies flat.
export function fold(corner: Pt, finger: Pt, w: number, h: number): Fold | undefined {
  const d = sub(corner, finger);
  const l = len(d);
  if (l < 0.5) return undefined;
  const normal = { x: d.x / l, y: d.y / l };
  const at = { x: (corner.x + finger.x) / 2, y: (corner.y + finger.y) / 2 };
  // reflection across the fold: p ↦ p − 2((p − at)·n)n
  const [nx, ny] = [normal.x, normal.y];
  const a = 1 - 2 * nx * nx;
  const b = -2 * nx * ny;
  const dd = 1 - 2 * ny * ny;
  const k = 2 * (at.x * nx + at.y * ny);
  const mirror: Matrix = [a, b, b, dd, k * nx, k * ny];
  const page: Polygon = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  return {
    at,
    normal,
    flat: solid(cut(page, at, normal, -1)),
    flap: solid(cut(page, at, normal, 1).map((p) => apply(mirror, p))),
    mirror,
  };
}

// Where the corner goes while the page is let go: along a low arc to the target.
export function settle(from: Pt, to: Pt, t: number, h: number): Pt {
  const e = 1 - (1 - t) ** 3;
  const lift = Math.sin(e * Math.PI) * h * 0.06 * (to.y > h / 2 ? -1 : 1);
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e + lift };
}

// The lifted part rolled over a cylinder rather than creased: from the axis it rises around the
// cylinder (its front seen, foreshortened), comes over the top (its back seen) and lies back flat.
// Each strip is a band of the paper at distances [d0, d1] from the axis (toward the grip) and
// where it shows, x0..x1 along the same direction; `back` strips show the paper's other side.
export type Strip = {
  readonly d0: number;
  readonly d1: number;
  readonly x0: number;
  readonly x1: number;
  // 0 on the paper lying flat, rising to 1 at the top of the roll
  readonly height: number;
  readonly back: boolean;
};

export type Roll = {
  readonly at: Pt;
  readonly normal: Pt;
  readonly radius: number;
  readonly strips: readonly Strip[];
  // the part still lying flat (spine side of the axis)
  readonly flat: Polygon;
  // the whole lifted part, before rolling (to clip strips to)
  readonly lifted: Polygon;
};

const STRIPS_ON_ROLL = 18;

// Where a point of the lifted paper at distance d from the axis shows, for a roll of radius r.
function rolled(d: number, r: number): number {
  return d <= Math.PI * r ? r * Math.sin(d / r) : -(d - Math.PI * r);
}

// `tightness` scales the roll: 1 while held, easing to 0 as the paper settles flat.
export function roll(grip: Pt, finger: Pt, w: number, h: number, tightness = 1): Roll | undefined {
  const g = sub(grip, finger);
  const l = len(g);
  if (l < 0.5) return undefined;
  const normal = { x: g.x / l, y: g.y / l };
  const radius = Math.max(0.01, Math.min(l * 0.12, Math.max(w, h) * 0.08) * tightness);
  // the grip lands under the finger: the paper used up by the roll is π·r
  const depth = (l + Math.PI * radius) / 2;
  const at = { x: grip.x - normal.x * depth, y: grip.y - normal.y * depth };
  const rect: Polygon = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const far = Math.max(...rect.map((p) => dot(sub(p, at), normal)), 0);
  const onRoll = Math.min(far, Math.PI * radius);
  const step = onRoll / STRIPS_ON_ROLL;
  const strips: Strip[] = Array.from({ length: STRIPS_ON_ROLL }, (_, i) => {
    const d0 = i * step;
    const d1 = (i + 1) * step;
    const mid = (d0 + d1) / 2 / radius;
    return {
      d0,
      d1,
      x0: rolled(d0, radius),
      x1: rolled(d1, radius),
      height: (1 - Math.cos(Math.min(mid, Math.PI))) / 2,
      back: mid > Math.PI / 2,
    };
  }).filter((s) => s.d1 > s.d0);
  if (far > Math.PI * radius) {
    strips.push({
      d0: Math.PI * radius,
      d1: far,
      x0: rolled(Math.PI * radius, radius),
      x1: rolled(far, radius),
      height: 1,
      back: true,
    });
  }
  return {
    at,
    normal,
    radius,
    strips,
    flat: solid(cut(rect, at, normal, -1)),
    lifted: solid(cut(rect, at, normal, 1)),
  };
}

// The transform that takes the paper at distances d0..d1 from the axis to x0..x1: a stretch
// (negative: turned over) along the normal, about the axis.
export function stripMatrix(r: Roll, s: Strip): Matrix {
  const k = s.d1 === s.d0 ? 1 : (s.x1 - s.x0) / (s.d1 - s.d0);
  const shift = s.x0 - k * s.d0;
  const { x: nx, y: ny } = r.normal;
  // p ↦ p + n·((k − 1)·((p − at)·n) + shift)
  const a = 1 + (k - 1) * nx * nx;
  const b = (k - 1) * nx * ny;
  const d = 1 + (k - 1) * ny * ny;
  const base = -(k - 1) * (r.at.x * nx + r.at.y * ny) + shift;
  return [a, b, b, d, nx * base, ny * base];
}

// The band of paper at distances d0..d1 from the axis, within the page.
export function stripPolygon(r: Roll, s: Strip): Polygon {
  const { at, normal } = r;
  const near = { x: at.x + normal.x * s.d0, y: at.y + normal.y * s.d0 };
  const far = { x: at.x + normal.x * s.d1, y: at.y + normal.y * s.d1 };
  return solid(cut(cut([...r.lifted], near, normal, 1), far, normal, -1));
}
