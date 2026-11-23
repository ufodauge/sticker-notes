import { ALPHA_THRESHOLD, type Rgba } from "./quantize.ts";
import { STICKER_SIZE } from "./payload.ts";

const MAX_ART_COLORS = 256;
const UNIFORM_RATIO = 0.97;
const MAX_DOT = 64;

function keyAt(img: Rgba, x: number, y: number): number {
  const i = (y * img.width + x) * 4;
  const d = img.data;
  if ((d[i + 3] ?? 0) < ALPHA_THRESHOLD) return -1;
  return ((d[i] ?? 0) << 16) | ((d[i + 1] ?? 0) << 8) | (d[i + 2] ?? 0);
}

function distinctColors(img: Rgba, limit: number): number {
  const seen = new Set<number>();
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      seen.add(keyAt(img, x, y));
      if (seen.size > limit) return seen.size;
    }
  }
  return seen.size;
}

export type Grid = { readonly dot: number; readonly ox: number; readonly oy: number };

function phase(starts: readonly number[], k: number): number {
  const counts = Array.from({ length: k }, () => 0);
  starts.forEach((s) => {
    counts[s % k] = (counts[s % k] ?? 0) + 1;
  });
  return counts.reduce((best, c, i) => (c > (counts[best] ?? 0) ? i : best), 0);
}

function uniformity(img: Rgba, k: number, ox: number, oy: number): number {
  const x0 = ox > 0 ? ox - k : 0;
  const y0 = oy > 0 ? oy - k : 0;
  const acc = { total: 0, uniform: 0 };
  for (let by = y0; by < img.height; by += k) {
    for (let bx = x0; bx < img.width; bx += k) {
      const sx = Math.max(0, bx);
      const sy = Math.max(0, by);
      const ex = Math.min(img.width, bx + k);
      const ey = Math.min(img.height, by + k);
      const ref = keyAt(img, sx, sy);
      const same = (() => {
        for (let y = sy; y < ey; y++)
          for (let x = sx; x < ex; x++) if (keyAt(img, x, y) !== ref) return false;
        return true;
      })();
      acc.total++;
      if (same) acc.uniform++;
    }
  }
  return acc.total === 0 ? 0 : acc.uniform / acc.total;
}

export function detectGrid(img: Rgba): Grid | undefined {
  if (distinctColors(img, MAX_ART_COLORS) > MAX_ART_COLORS) return undefined;
  const hStarts: number[] = [];
  const vStarts: number[] = [];
  // every run of equal pixels, edges included: their gcd is the exact dot size of a clean upscale
  const runs = { gcd: 0 };
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  for (let y = 0; y < img.height; y++) {
    let start = 0;
    for (let x = 1; x <= img.width; x++) {
      if (x < img.width && keyAt(img, x, y) === keyAt(img, x - 1, y)) continue;
      runs.gcd = gcd(runs.gcd, x - start);
      if (x < img.width) hStarts.push(x);
      start = x;
    }
  }
  for (let x = 0; x < img.width; x++) {
    let start = 0;
    for (let y = 1; y <= img.height; y++) {
      if (y < img.height && keyAt(img, x, y) === keyAt(img, x, y - 1)) continue;
      runs.gcd = gcd(runs.gcd, y - start);
      if (y < img.height) vStarts.push(y);
      start = y;
    }
  }
  if (runs.gcd >= 2 && img.width % runs.gcd === 0 && img.height % runs.gcd === 0) {
    return { dot: runs.gcd, ox: 0, oy: 0 };
  }
  // otherwise (cropped off-grid, a few stray pixels): search for the largest consistent grid
  const maxK = Math.min(MAX_DOT, Math.floor(Math.min(img.width, img.height) / 2));
  for (let k = maxK; k >= 2; k--) {
    // cheap pre-filter: almost every colour change must sit on the grid
    const ox = phase(hStarts, k);
    const oy = phase(vStarts, k);
    const onGrid =
      hStarts.filter((s) => s % k === ox).length + vStarts.filter((s) => s % k === oy).length;
    if (onGrid < (hStarts.length + vStarts.length) * UNIFORM_RATIO) continue;
    if (uniformity(img, k, ox, oy) >= UNIFORM_RATIO) return { dot: k, ox, oy };
  }
  return img.width <= STICKER_SIZE * 2 && img.height <= STICKER_SIZE * 2
    ? { dot: 1, ox: 0, oy: 0 }
    : undefined;
}

export function toNative(img: Rgba, g: Grid): Rgba {
  const x0 = g.ox > 0 ? g.ox - g.dot : 0;
  const y0 = g.oy > 0 ? g.oy - g.dot : 0;
  const width = Math.ceil((img.width - x0) / g.dot);
  const height = Math.ceil((img.height - y0) / g.dot);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = Math.min(img.width - 1, Math.max(0, x0 + x * g.dot + Math.floor(g.dot / 2)));
      const sy = Math.min(img.height - 1, Math.max(0, y0 + y * g.dot + Math.floor(g.dot / 2)));
      const i = (sy * img.width + sx) * 4;
      data.set(img.data.subarray(i, i + 4), (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

export type Fit = { readonly image: Rgba; readonly scale: number; readonly native: Rgba };

function centroid(
  img: Rgba,
  box: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number },
): { readonly x: number; readonly y: number } {
  const sum = { x: 0, y: 0, n: 0 };
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      if ((img.data[(y * img.width + x) * 4 + 3] ?? 0) < ALPHA_THRESHOLD) continue;
      sum.x += x + 0.5 - box.x0;
      sum.y += y + 0.5 - box.y0;
      sum.n++;
    }
  }
  return { x: sum.x / sum.n, y: sum.y / sum.n };
}

export function fitTo32(native: Rgba): Fit | undefined {
  const box = { x0: native.width, y0: native.height, x1: -1, y1: -1 };
  for (let y = 0; y < native.height; y++) {
    for (let x = 0; x < native.width; x++) {
      if ((native.data[(y * native.width + x) * 4 + 3] ?? 0) < ALPHA_THRESHOLD) continue;
      box.x0 = Math.min(box.x0, x);
      box.y0 = Math.min(box.y0, y);
      box.x1 = Math.max(box.x1, x);
      box.y1 = Math.max(box.y1, y);
    }
  }
  if (box.x1 < 0) return undefined;
  // keep the author's canvas (margins are part of the composition) when it fits;
  // trim to the drawing only when the canvas itself is too large
  const canvasFits = native.width <= STICKER_SIZE && native.height <= STICKER_SIZE;
  if (canvasFits) Object.assign(box, { x0: 0, y0: 0, x1: native.width - 1, y1: native.height - 1 });
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  if (bw > STICKER_SIZE || bh > STICKER_SIZE) return undefined;
  const scale = Math.floor(STICKER_SIZE / Math.max(bw, bh));
  const mass = centroid(native, box);
  const place = (c: number, len: number) =>
    Math.max(
      0,
      Math.min(STICKER_SIZE - len * scale, Math.ceil(STICKER_SIZE / 2 - c * scale - 0.5)),
    );
  const offX = place(mass.x, bw);
  const offY = place(mass.y, bh);
  const N = STICKER_SIZE;
  const data = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const sx = Math.floor((x - offX) / scale);
      const sy = Math.floor((y - offY) / scale);
      if (x < offX || y < offY || sx >= bw || sy >= bh) continue;
      const i = ((sy + box.y0) * native.width + sx + box.x0) * 4;
      data.set(native.data.subarray(i, i + 4), (y * N + x) * 4);
    }
  }
  return { image: { width: N, height: N, data }, scale, native };
}

export function importPixelArt(img: Rgba): Fit | undefined {
  const grid = detectGrid(img);
  return grid ? fitTo32(toNative(img, grid)) : undefined;
}
