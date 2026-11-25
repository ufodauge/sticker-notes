import { getPalette, type Rgb } from "./palette.ts";
import { STICKER_SIZE, type Sticker } from "./payload.ts";

export const DEFAULT_OUTLINE = 2;
export const BASE_COLOR: Rgb = [255, 255, 255];

export const CELL_EMPTY = -1;
export const CELL_BASE = 16;
// a clear sticker has no white film behind the art: the paper shows through the base
const CLEAR_BASE_ALPHA = 70;

export type StickerLayout = {
  readonly size: number;
  readonly outline: number;
  readonly cells: Int8Array;
};

function opaqueMask(s: Sticker): Uint8Array {
  return Uint8Array.from(s.pixels, (p) => (p === s.transparentIndex ? 0 : 1));
}

export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(w * h);
  const lim = r * r + r;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (dx * dx + dy * dy <= lim && nx >= 0 && ny >= 0 && nx < w && ny < h)
            out[ny * w + nx] = 1;
        }
      }
    }
  }
  return out;
}

export function fillHoles(mask: Uint8Array, w: number, h: number): Uint8Array {
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (i: number) => {
    if (!mask[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  for (let i = stack.pop(); i !== undefined; i = stack.pop()) {
    const x = i % w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (i >= w) seed(i - w);
    if (i < w * (h - 1)) seed(i + w);
  }
  return Uint8Array.from(outside, (o) => (o ? 0 : 1));
}

export function layoutSticker(s: Sticker, outline = DEFAULT_OUTLINE): StickerLayout {
  const size = STICKER_SIZE + outline * 2;
  const padded = new Uint8Array(size * size);
  const opaque = opaqueMask(s);
  for (let y = 0; y < STICKER_SIZE; y++) {
    padded.set(
      opaque.subarray(y * STICKER_SIZE, (y + 1) * STICKER_SIZE),
      (y + outline) * size + outline,
    );
  }
  const base = fillHoles(dilate(padded, size, size, outline), size, size);
  const cells = Int8Array.from(base, (b) => (b ? CELL_BASE : CELL_EMPTY));
  for (let y = 0; y < STICKER_SIZE; y++) {
    for (let x = 0; x < STICKER_SIZE; x++) {
      const i = y * STICKER_SIZE + x;
      if (opaque[i]) cells[(y + outline) * size + x + outline] = s.pixels[i] ?? 0;
    }
  }
  return { size, outline, cells };
}

export function renderRgba(
  s: Sticker,
  outline = DEFAULT_OUTLINE,
): { size: number; rgba: Uint8ClampedArray<ArrayBuffer> } {
  const palette = getPalette(s.paletteId);
  if (!palette) throw new Error("unknown palette");
  const { size, cells } = layoutSticker(s, outline);
  const baseAlpha = s.material?.kind === "clear" ? CLEAR_BASE_ALPHA : 255;
  const rgba = new Uint8ClampedArray(size * size * 4);
  cells.forEach((c, i) => {
    if (c === CELL_EMPTY) return;
    const [r, g, b] = c === CELL_BASE ? BASE_COLOR : (palette.rgb[c] ?? BASE_COLOR);
    rgba.set([r, g, b, c === CELL_BASE ? baseAlpha : 255], i * 4);
  });
  return { size, rgba };
}

// Where the material shows, as an alpha mask the size of the rendered sticker: the whole sticker,
// or for foil only the dots of the foil colour.
export function materialMask(
  s: Sticker,
  outline = DEFAULT_OUTLINE,
): { size: number; rgba: Uint8ClampedArray<ArrayBuffer> } {
  const { size, cells } = layoutSticker(s, outline);
  const foil = s.material?.kind === "foil" ? s.material.tone : undefined;
  const rgba = new Uint8ClampedArray(size * size * 4);
  cells.forEach((c, i) => {
    const on = foil === undefined ? c !== CELL_EMPTY : c === foil;
    if (on) rgba.set([0, 0, 0, 255], i * 4);
  });
  return { size, rgba };
}

export type Point = readonly [x: number, y: number];

export function traceContours(layout: StickerLayout): readonly (readonly Point[])[] {
  const { size, cells } = layout;
  const filled = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < size && y < size && cells[y * size + x] !== CELL_EMPTY;
  // directed boundary edges keyed by start vertex; filled cell kept on the right side
  const next = new Map<number, number[]>();
  const key = (x: number, y: number) => y * (size + 1) + x;
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = key(x0, y0);
    next.set(k, [...(next.get(k) ?? []), key(x1, y1)]);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!filled(x, y)) continue;
      if (!filled(x, y - 1)) add(x, y, x + 1, y);
      if (!filled(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!filled(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!filled(x - 1, y)) add(x, y + 1, x, y);
    }
  }
  const contours: Point[][] = [];
  const pt = (k: number): Point => [k % (size + 1), Math.floor(k / (size + 1))];
  for (const start of [...next.keys()].sort((a, b) => a - b)) {
    while ((next.get(start)?.length ?? 0) > 0) {
      const loop: Point[] = [];
      let cur = start;
      let prevDir: Point = [0, 0];
      do {
        const outs = next.get(cur) ?? [];
        // at pinch vertices prefer the right-most turn so diagonal-touching blobs stay separate
        const [cx, cy] = pt(cur);
        const pick = outs.length > 1 ? pickTurn(outs.map(pt), [cx, cy], prevDir) : 0;
        const nk = outs[pick];
        if (nk === undefined) break;
        next.set(
          cur,
          outs.filter((_, i) => i !== pick),
        );
        loop.push([cx, cy]);
        const [nx, ny] = pt(nk);
        prevDir = [nx - cx, ny - cy];
        cur = nk;
      } while (cur !== start);
      contours.push(simplify(loop));
    }
  }
  return contours;
}

function pickTurn(cands: readonly Point[], [cx, cy]: Point, [dx, dy]: Point): number {
  // right turn in screen coords (y down): cross(prev, cand) > 0
  const idx = cands.findIndex(([x, y]) => dx * (y - cy) - dy * (x - cx) > 0);
  return idx >= 0 ? idx : 0;
}

function simplify(loop: readonly Point[]): Point[] {
  return loop.filter((p, i) => {
    const a = loop[(i - 1 + loop.length) % loop.length] ?? p;
    const b = loop[(i + 1) % loop.length] ?? p;
    return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
  });
}

// The sticker's outline as an SVG path in 0..1 units of its rendered square (for a clip path in
// objectBoundingBox units): the shape a finger can actually touch.
export function outlinePath(s: Sticker, outline = DEFAULT_OUTLINE): string {
  const layout = layoutSticker(s, outline);
  const k = 1 / layout.size;
  const f = (n: number) => String(Math.round(n * k * 10000) / 10000);
  return traceContours(layout)
    .map((loop) => `M${loop.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}Z`)
    .join("");
}
