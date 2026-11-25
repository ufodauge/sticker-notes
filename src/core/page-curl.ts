// A page turned by its corner, as paper does it: the corner is drawn toward the finger and the page
// folds along the line halfway between them. Coordinates are the page's own, measured outward from
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

// The paper is held at the spine, so the corner can only go where the page reaches: within a
// page width of the spine end on its own edge, and within the diagonal of the other end.
export function reach(corner: Pt, finger: Pt, w: number, h: number): Pt {
  const near = { x: 0, y: corner.y };
  const far = { x: 0, y: corner.y === 0 ? h : 0 };
  const within = (p: Pt, centre: Pt, r: number): Pt => {
    const d = sub(p, centre);
    const l = len(d);
    return l <= r ? p : { x: centre.x + (d.x / l) * r, y: centre.y + (d.y / l) * r };
  };
  return within(within(finger, near, w), far, Math.hypot(w, h));
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
