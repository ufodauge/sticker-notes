import type { Pt } from "./page-curl.ts";

// Where a sticker not quite pressed down lifts (the tutorial's first cue): the edge of its shape
// toward the lower right, where a thumb takes it. From the art's alpha (size×size, row by row):
// the opaque pixel nearest the lower-right corner, one pixel in from the outline along the way to
// the middle. The middle when the art is empty.
export function teaseGrip(alpha: ArrayLike<number>, size: number): Pt {
  const corner = size - 1;
  const best = Array.from({ length: size * size }, (_, i) => i).reduce<{ i: number; d: number }>(
    (b, i) => {
      if ((alpha[i] ?? 0) === 0) return b;
      const d = Math.hypot(corner - (i % size), corner - Math.floor(i / size));
      return d < b.d ? { i, d } : b;
    },
    { i: -1, d: Infinity },
  );
  const mid = (size - 1) / 2;
  if (best.i < 0) return { x: mid, y: mid };
  const x = best.i % size;
  const y = Math.floor(best.i / size);
  const len = Math.hypot(mid - x, mid - y) || 1;
  return { x: x + (mid - x) / len, y: y + (mid - y) / len };
}
