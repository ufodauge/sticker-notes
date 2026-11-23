import { assignMinCost } from "./assign.ts";
import { PALETTES, oklabDistanceSq, rgbToOklab, type Oklab, type Palette } from "./palette.ts";
import { PIXEL_COUNT, STICKER_SIZE } from "./payload.ts";

export type Rgba = {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
};
export type CropRect = { readonly x: number; readonly y: number; readonly size: number };
export type ResizeMode = "area" | "nearest";

export const ALPHA_THRESHOLD = 128;

export function resizeTo32(src: Rgba, crop: CropRect, mode: ResizeMode): Rgba {
  const N = STICKER_SIZE;
  const out = new Uint8ClampedArray(N * N * 4);
  const cell = crop.size / N;
  const px = (x: number, y: number) =>
    (Math.min(src.height - 1, Math.max(0, y)) * src.width +
      Math.min(src.width - 1, Math.max(0, x))) *
    4;

  for (let oy = 0; oy < N; oy++) {
    for (let ox = 0; ox < N; ox++) {
      const o = (oy * N + ox) * 4;
      if (mode === "nearest") {
        const i = px(
          Math.floor(crop.x + (ox + 0.5) * cell),
          Math.floor(crop.y + (oy + 0.5) * cell),
        );
        out.set(src.data.subarray(i, i + 4), o);
        continue;
      }
      const x0 = crop.x + ox * cell;
      const y0 = crop.y + oy * cell;
      const x1 = x0 + cell;
      const y1 = y0 + cell;
      const acc = [0, 0, 0, 0, 0]; // r·a, g·a, b·a, a, area
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const w = wy * (Math.min(x1, sx + 1) - Math.max(x0, sx));
          if (w <= 0) continue;
          const i = px(sx, sy);
          const a = (src.data[i + 3] ?? 0) * w;
          acc[0] = (acc[0] ?? 0) + (src.data[i] ?? 0) * a;
          acc[1] = (acc[1] ?? 0) + (src.data[i + 1] ?? 0) * a;
          acc[2] = (acc[2] ?? 0) + (src.data[i + 2] ?? 0) * a;
          acc[3] = (acc[3] ?? 0) + a;
          acc[4] = (acc[4] ?? 0) + w;
        }
      }
      const [ra = 0, ga = 0, ba = 0, a = 0, area = 1] = acc;
      out[o] = a > 0 ? ra / a : 0;
      out[o + 1] = a > 0 ? ga / a : 0;
      out[o + 2] = a > 0 ? ba / a : 0;
      out[o + 3] = a / area;
    }
  }
  return { width: N, height: N, data: out };
}

export function hasTransparency(img: Rgba): boolean {
  for (let i = 3; i < img.data.length; i += 4)
    if ((img.data[i] ?? 255) < ALPHA_THRESHOLD) return true;
  return false;
}

export type QuantizeResult = {
  readonly indices: Uint8Array;
  readonly error: number;
};

function toOklab(img: Rgba): readonly Oklab[] {
  return Array.from({ length: PIXEL_COUNT }, (_, p) => {
    const i = p * 4;
    return rgbToOklab([img.data[i] ?? 0, img.data[i + 1] ?? 0, img.data[i + 2] ?? 0]);
  });
}

export function quantize(
  img: Rgba,
  palette: Palette,
  transparentIndex: number | null,
  lab: readonly Oklab[] = toOklab(img),
): QuantizeResult {
  const indices = new Uint8Array(PIXEL_COUNT);
  const white = rgbToOklab([255, 255, 255]);
  const acc = { error: 0 };
  for (let p = 0; p < PIXEL_COUNT; p++) {
    const transparent = (img.data[p * 4 + 3] ?? 255) < ALPHA_THRESHOLD;
    if (transparent && transparentIndex !== null) {
      indices[p] = transparentIndex;
      continue;
    }
    const target = transparent ? white : (lab[p] ?? white);
    const best = { index: 0, d: Number.POSITIVE_INFINITY };
    palette.oklab.forEach((c, k) => {
      if (k === transparentIndex) return;
      const d = oklabDistanceSq(target, c);
      if (d < best.d) {
        best.d = d;
        best.index = k;
      }
    });
    indices[p] = best.index;
    if (!transparent) acc.error += best.d;
  }
  return { indices, error: acc.error };
}

export type PaletteCandidate = {
  readonly paletteId: number;
  readonly transparentIndex: number | null;
  readonly result: QuantizeResult;
};

function opaqueColors(img: Rgba, limit: number): ReadonlyMap<number, number> | undefined {
  const counts = new Map<number, number>();
  for (let p = 0; p < PIXEL_COUNT; p++) {
    const i = p * 4;
    if ((img.data[i + 3] ?? 255) < ALPHA_THRESHOLD) continue;
    const key = ((img.data[i] ?? 0) << 16) | ((img.data[i + 1] ?? 0) << 8) | (img.data[i + 2] ?? 0);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (counts.size > limit) return undefined;
  }
  return counts;
}

export function quantizeDistinct(
  img: Rgba,
  palette: Palette,
  transparent: number | null | "auto",
): (QuantizeResult & { readonly transparentIndex: number | null }) | undefined {
  const alpha = hasTransparency(img);
  const fixed = transparent === "auto" ? null : transparent;
  const columns = palette.oklab.map((_, k) => k).filter((k) => k !== fixed);
  const limit = columns.length - (alpha && transparent === "auto" ? 1 : 0);
  const colors = opaqueColors(img, limit);
  if (!colors) return undefined;
  const keys = [...colors.keys()];
  const labs = keys.map((k) => rgbToOklab([(k >> 16) & 255, (k >> 8) & 255, k & 255]));
  const cost = keys.map((k, i) =>
    columns.map(
      (col) =>
        (colors.get(k) ?? 0) *
        oklabDistanceSq(labs[i] ?? [0, 0, 0], palette.oklab[col] ?? [0, 0, 0]),
    ),
  );
  const match = assignMinCost(cost);
  const slotOf = new Map(keys.map((k, i) => [k, columns[match[i] ?? 0] ?? 0]));
  const used = new Set(slotOf.values());
  const transparentIndex =
    transparent !== "auto"
      ? transparent
      : !alpha
        ? null
        : used.has(palette.transparentDefault)
          ? (palette.oklab
              .map((c, k) => ({ k, L: c[0] }))
              .filter(({ k }) => !used.has(k))
              .toSorted((a, b) => b.L - a.L)[0]?.k ?? null)
          : palette.transparentDefault;
  const indices = new Uint8Array(PIXEL_COUNT);
  const white = keyWhite();
  for (let p = 0; p < PIXEL_COUNT; p++) {
    const i = p * 4;
    const isTransparent = (img.data[i + 3] ?? 255) < ALPHA_THRESHOLD;
    if (isTransparent) {
      indices[p] = transparentIndex ?? nearestSlot(palette, white, fixed);
      continue;
    }
    const key = ((img.data[i] ?? 0) << 16) | ((img.data[i + 1] ?? 0) << 8) | (img.data[i + 2] ?? 0);
    indices[p] = slotOf.get(key) ?? 0;
  }
  const error = match.reduce((sum, col, i) => sum + (cost[i]?.[col] ?? 0), 0);
  return { indices, error, transparentIndex };
}

const keyWhite = (): Oklab => rgbToOklab([255, 255, 255]);

function nearestSlot(palette: Palette, target: Oklab, exclude: number | null): number {
  return palette.oklab.reduce(
    (best, c, k) =>
      k !== exclude &&
      oklabDistanceSq(target, c) < oklabDistanceSq(target, palette.oklab[best] ?? c)
        ? k
        : best,
    exclude === 0 ? 1 : 0,
  );
}

export function rankPalettes(img: Rgba): readonly PaletteCandidate[] {
  const lab = toOklab(img);
  const alpha = hasTransparency(img);
  return PALETTES.map((p): PaletteCandidate => {
    const distinct = quantizeDistinct(img, p, "auto");
    if (distinct) {
      const { transparentIndex, ...result } = distinct;
      return { paletteId: p.id, transparentIndex, result };
    }
    const transparentIndex = alpha ? p.transparentDefault : null;
    return { paletteId: p.id, transparentIndex, result: quantize(img, p, transparentIndex, lab) };
  }).toSorted((a, b) => a.result.error - b.result.error || a.paletteId - b.paletteId);
}

export function exactPaletteMatch(img: Rgba): PaletteCandidate | undefined {
  if (img.width !== STICKER_SIZE || img.height !== STICKER_SIZE) return undefined;
  const alpha = hasTransparency(img);
  for (const p of PALETTES) {
    const lookup = new Map(p.rgb.map(([r, g, b], k) => [(r << 16) | (g << 8) | b, k]));
    const used = new Set<number>();
    const indices = new Uint8Array(PIXEL_COUNT);
    const ok = Array.from({ length: PIXEL_COUNT }).every((_, i) => {
      if ((img.data[i * 4 + 3] ?? 255) < ALPHA_THRESHOLD) return true;
      const key =
        ((img.data[i * 4] ?? 0) << 16) |
        ((img.data[i * 4 + 1] ?? 0) << 8) |
        (img.data[i * 4 + 2] ?? 0);
      const k = lookup.get(key);
      if (k === undefined) return false;
      indices[i] = k;
      used.add(k);
      return true;
    });
    if (!ok) continue;
    const free = [p.transparentDefault, ...Array.from({ length: 16 }, (_, k) => k)].find(
      (k) => !used.has(k),
    );
    if (alpha && free === undefined) continue;
    const transparentIndex = alpha ? (free ?? null) : null;
    if (transparentIndex !== null) {
      for (let i = 0; i < PIXEL_COUNT; i++) {
        if ((img.data[i * 4 + 3] ?? 255) < ALPHA_THRESHOLD) indices[i] = transparentIndex;
      }
    }
    return { paletteId: p.id, transparentIndex, result: { indices, error: 0 } };
  }
  return undefined;
}
