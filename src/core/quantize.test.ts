import { describe, expect, test } from "vite-plus/test";
import { PALETTES, type Palette } from "./palette.ts";
import { PIXEL_COUNT, type Sticker } from "./payload.ts";
import {
  exactPaletteMatch,
  hasTransparency,
  quantizeDistinct,
  quantize,
  rankPalettes,
  resizeTo32,
  type Rgba,
} from "./quantize.ts";
import { FIXTURES, rng } from "./testing/fixtures.ts";

function paint(paletteId: number, indices: Uint8Array, transparent: number | null): Rgba {
  const p = PALETTES[paletteId];
  if (!p) throw new Error("palette");
  const data = new Uint8ClampedArray(PIXEL_COUNT * 4);
  indices.forEach((k, i) => {
    const [r, g, b] = p.rgb[k] ?? [0, 0, 0];
    data.set([r, g, b, k === transparent ? 0 : 255], i * 4);
  });
  return { width: 32, height: 32, data };
}

const solid = (w: number, h: number, rgba: readonly number[]): Rgba => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  return { width: w, height: h, data };
};

describe("resizeTo32", () => {
  test("area average of a 2-colour checkerboard is the mean", () => {
    const w = 64;
    const data = new Uint8ClampedArray(w * w * 4);
    for (let i = 0; i < w * w; i++)
      data.set((i % w) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255], i * 4);
    const out = resizeTo32({ width: w, height: w, data }, { x: 0, y: 0, size: 64 }, "area");
    expect(out.data[0]).toBe(128);
    expect(out.data[3]).toBe(255);
  });

  test("fractional crops keep exact coverage", () => {
    const out = resizeTo32(
      solid(100, 100, [10, 20, 30, 255]),
      { x: 3.5, y: 7.25, size: 50.5 },
      "area",
    );
    expect(Array.from(out.data.subarray(0, 4))).toEqual([10, 20, 30, 255]);
  });

  test("alpha weighting ignores colour of transparent pixels", () => {
    const data = new Uint8ClampedArray(64 * 64 * 4);
    for (let i = 0; i < 64 * 64; i++) data.set(i % 2 ? [255, 0, 0, 255] : [0, 255, 0, 0], i * 4);
    const out = resizeTo32({ width: 64, height: 64, data }, { x: 0, y: 0, size: 64 }, "area");
    expect(Array.from(out.data.subarray(0, 4))).toEqual([255, 0, 0, 128]);
  });

  test("nearest picks cell centres (4× upscaled pixel art round-trips)", () => {
    const s = FIXTURES.slime;
    if (!s) throw new Error();
    const small = paint(s.paletteId, s.pixels, s.transparentIndex);
    const big = new Uint8ClampedArray(128 * 128 * 4);
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        const i = (Math.floor(y / 4) * 32 + Math.floor(x / 4)) * 4;
        big.set(small.data.subarray(i, i + 4), (y * 128 + x) * 4);
      }
    const out = resizeTo32(
      { width: 128, height: 128, data: big },
      { x: 0, y: 0, size: 128 },
      "nearest",
    );
    expect(out.data).toEqual(small.data);
  });
});

describe("quantize", () => {
  test("an image painted from a palette quantizes back with zero error", () => {
    for (const s of Object.values(FIXTURES)) {
      const img = paint(s.paletteId, s.pixels, s.transparentIndex);
      const palette = PALETTES[s.paletteId];
      if (!palette) throw new Error();
      const r = quantize(img, palette, s.transparentIndex);
      expect(r.error).toBeCloseTo(0, 10);
      expect(r.indices).toEqual(s.pixels);
    }
  });

  test("never uses the transparent index for opaque pixels", () => {
    const palette = PALETTES[0];
    if (!palette) throw new Error();
    const r = quantize(solid(32, 32, [0xff, 0xf1, 0xe8, 255]), palette, 7);
    expect(r.indices.includes(7)).toBe(false);
    expect(r.error).toBeGreaterThan(0);
  });
});

describe("palette selection", () => {
  test("rankPalettes picks the palette an image was painted with", () => {
    const r = rng(9);
    for (const id of [0, 2, 9, 20, 31]) {
      const indices = Uint8Array.from({ length: PIXEL_COUNT }, () => Math.floor(r() * 16));
      const ranked = rankPalettes(paint(id, indices, null));
      expect(ranked[0]?.paletteId).toBe(id);
      expect(ranked[0]?.result.error).toBeCloseTo(0, 10);
      expect(ranked).toHaveLength(32);
    }
  });

  test("exactPaletteMatch converts without approximation", () => {
    const s = FIXTURES.slime;
    if (!s) throw new Error();
    const m = exactPaletteMatch(paint(s.paletteId, s.pixels, s.transparentIndex));
    expect(m?.paletteId).toBe(s.paletteId);
    expect(m?.transparentIndex).toBe(s.transparentIndex);
    expect(m?.result.indices).toEqual(s.pixels);
  });

  test("exactPaletteMatch rejects off-palette colours and other sizes", () => {
    expect(exactPaletteMatch(solid(32, 32, [1, 2, 3, 255]))).toBeUndefined();
    expect(exactPaletteMatch(solid(33, 33, [0, 0, 0, 255]))).toBeUndefined();
  });

  test("hasTransparency", () => {
    expect(hasTransparency(solid(32, 32, [0, 0, 0, 255]))).toBe(false);
    expect(hasTransparency(solid(32, 32, [0, 0, 0, 10]))).toBe(true);
  });
});

const pico = PALETTES[0] as Palette;
const rgba = (rgb: readonly number[], a = 255) => [rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0, a];

function image32(pick: (p: number) => readonly number[]): Rgba {
  const data = new Uint8ClampedArray(PIXEL_COUNT * 4);
  for (let p = 0; p < PIXEL_COUNT; p++) data.set(pick(p), p * 4);
  return { width: 32, height: 32, data };
}

function stripes(palette: Palette, n: number, transparentEvery = 0): Rgba {
  return image32((p) =>
    transparentEvery > 0 && p % transparentEvery === 0
      ? [7, 7, 7, 0]
      : rgba(palette.rgb[Math.floor(p / 8) % n] ?? [0, 0, 0]),
  );
}

describe("resizeTo32 details", () => {
  const gradient = (w: number, h: number): Rgba => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        data.set([x % 256, (y * 2) % 256, (x + y) % 256, 255], (y * w + x) * 4);
    return { width: w, height: h, data };
  };
  const at = (img: Rgba, x: number, y: number) =>
    Array.from(img.data.subarray((y * 32 + x) * 4, (y * 32 + x) * 4 + 4));

  test.each(["area", "nearest"] as const)("%s: the crop origin moves both axes", (mode) => {
    const src = gradient(96, 96);
    const out = resizeTo32(src, { x: 20, y: 40, size: 32 }, mode);
    expect(at(out, 0, 0)).toEqual([20, 80, 60, 255]);
    expect(at(out, 5, 0)).toEqual([25, 80, 65, 255]);
    expect(at(out, 0, 7)).toEqual([20, 94, 67, 255]);
    expect(at(out, 31, 31)).toEqual([51, 142, 122, 255]);
  });

  test("area: cells that straddle source pixels are weighted by coverage on every channel", () => {
    const src = gradient(48, 48);
    const out = resizeTo32(src, { x: 0, y: 0, size: 48 }, "area");
    const cell = (x: number, y: number) => at(out, x, y);
    const mean = (vals: readonly number[], w: readonly number[]) =>
      vals.reduce((s, v, i) => s + v * (w[i] ?? 0), 0) / w.reduce((s, x) => s + x, 0);
    const r = mean([0, 1], [1, 0.5]);
    const g = mean([0, 2], [1, 0.5]);
    const b = mean([0, 1, 1, 2], [1, 0.5, 0.5, 0.25]);
    expect(cell(0, 0)).toEqual([Math.round(r), Math.round(g), Math.round(b), 255]);
    expect(cell(1, 0)[0]).toBe(Math.round(mean([1, 2], [0.5, 1])));
  });

  test("area: a cell that is half transparent keeps the colour of its opaque half", () => {
    const data = new Uint8ClampedArray(64 * 64 * 4);
    for (let i = 0; i < 64 * 64; i++)
      data.set(i % 64 < 1 ? [200, 100, 50, 255] : [0, 0, 0, 0], i * 4);
    const out = resizeTo32({ width: 64, height: 64, data }, { x: 0, y: 0, size: 64 }, "area");
    expect(at(out, 0, 0)).toEqual([200, 100, 50, 128]);
  });

  test("area: a fully transparent cell is transparent black", () => {
    const out = resizeTo32(solid(64, 64, [200, 100, 50, 0]), { x: 0, y: 0, size: 64 }, "area");
    expect(at(out, 3, 3)).toEqual([0, 0, 0, 0]);
  });

  test.each(["area", "nearest"] as const)(
    "%s: a crop that sticks out of the image is clamped to its edge",
    (mode) => {
      const src = gradient(4, 4);
      const out = resizeTo32(src, { x: 0, y: 0, size: 8 }, mode);
      if (mode === "nearest") {
        expect(at(out, 31, 0)).toEqual(Array.from(src.data.subarray(3 * 4, 3 * 4 + 4)));
        expect(at(out, 0, 31)).toEqual(Array.from(src.data.subarray(12 * 4, 12 * 4 + 4)));
        expect(at(out, 31, 31)).toEqual(Array.from(src.data.subarray(15 * 4, 15 * 4 + 4)));
      } else {
        expect(at(out, 31, 31)).toEqual(Array.from(src.data.subarray(15 * 4, 15 * 4 + 4)));
      }
    },
  );
});

describe("quantize details", () => {
  test("transparent pixels without a transparent index are white paper and cost nothing", () => {
    const img = image32(() => [0, 0, 0, 0]);
    const r = quantize(img, pico, null);
    expect(Array.from(new Set(r.indices))).toEqual([7]);
    expect(r.error).toBe(0);
  });

  test("with a transparent index, transparent pixels take it and opaque ones avoid it", () => {
    const img = image32((p) => (p % 2 ? [0, 0, 0, 0] : [255, 255, 255, 255]));
    const r = quantize(img, pico, 7);
    expect(r.indices[1]).toBe(7);
    expect(r.indices[0]).not.toBe(7);
  });

  test("alpha 128 is opaque, 127 is transparent", () => {
    const img = image32((p) => [255, 0, 77, p % 2 ? 127 : 128]);
    const r = quantize(img, pico, 7);
    expect(r.indices[0]).not.toBe(7);
    expect(r.indices[1]).toBe(7);
  });

  test("error is the sum of squared OKLab distances of opaque pixels only", () => {
    const opaque = quantize(solid(32, 32, [10, 200, 90, 255]), pico, null);
    const half = quantize(
      image32((p) => (p < 512 ? [10, 200, 90, 255] : [10, 200, 90, 0])),
      pico,
      null,
    );
    expect(half.error).toBeCloseTo(opaque.error / 2, 9);
  });
});

describe("hasTransparency boundary", () => {
  test("alpha 127 is transparent, 128 is not", () => {
    expect(hasTransparency(solid(4, 4, [0, 0, 0, 127]))).toBe(true);
    expect(hasTransparency(solid(4, 4, [0, 0, 0, 128]))).toBe(false);
  });
});

describe("quantizeDistinct details", () => {
  test("every source colour gets its own palette colour; the limit is the number of free slots", () => {
    expect(quantizeDistinct(stripes(pico, 16), pico, null)).toBeDefined();
    const seventeen = image32((p) => [p % 17 === 16 ? 1 : 0, 0, (p % 17) * 5, 255]);
    expect(quantizeDistinct(seventeen, pico, null)).toBeUndefined();
    expect(quantizeDistinct(stripes(pico, 16), pico, 7)).toBeUndefined();
    expect(quantizeDistinct(stripes(pico, 15), pico, 7)).toBeDefined();
  });

  test("auto transparency reserves a slot only when the image has transparency", () => {
    expect(quantizeDistinct(stripes(pico, 16), pico, "auto")).toBeDefined();
    expect(quantizeDistinct(stripes(pico, 16, 5), pico, "auto")).toBeUndefined();
    expect(quantizeDistinct(stripes(pico, 15, 5), pico, "auto")).toBeDefined();
  });

  test("transparent pixels do not count as a colour", () => {
    const r = quantizeDistinct(stripes(pico, 15, 5), pico, "auto");
    expect(new Set(r?.indices).size).toBeLessThanOrEqual(16);
    expect(r?.transparentIndex).not.toBeNull();
  });

  test("no transparency → no transparent index (auto)", () => {
    expect(quantizeDistinct(stripes(pico, 4), pico, "auto")?.transparentIndex).toBeNull();
  });

  test("auto uses the palette default slot when the art does not use it", () => {
    const r = quantizeDistinct(stripes(pico, 4, 5), pico, "auto");
    expect(r?.transparentIndex).toBe(pico.transparentDefault);
    expect(r?.indices[0]).toBe(pico.transparentDefault);
  });

  test("auto moves to the brightest free slot when the art uses the default one", () => {
    const d = pico.transparentDefault;
    const src = image32((p) => (p % 5 === 0 ? [7, 7, 7, 0] : rgba(pico.rgb[d] ?? [0, 0, 0])));
    const r = quantizeDistinct(src, pico, "auto");
    const used = new Set(r?.indices.filter((_, p) => p % 5 !== 0));
    expect(used.has(d)).toBe(true);
    const free = pico.oklab.map((c, k) => ({ k, L: c[0] })).filter(({ k }) => !used.has(k));
    const brightest = free.reduce((a, b) => (b.L > a.L ? b : a));
    expect(r?.transparentIndex).toBe(brightest.k);
    expect(r?.transparentIndex).not.toBe(d);
    expect(r?.indices[0]).toBe(brightest.k);
  });

  test("a fixed transparent slot is honoured and never given to a colour", () => {
    const src = image32((p) => (p % 4 === 0 ? [7, 7, 7, 0] : rgba(pico.rgb[7] ?? [0, 0, 0])));
    const r = quantizeDistinct(src, pico, 7);
    expect(r?.transparentIndex).toBe(7);
    expect(r?.indices[0]).toBe(7);
    expect(r?.indices[1]).not.toBe(7);
  });

  test("with transparency disabled, transparent pixels fall back to the colour nearest white", () => {
    const src = image32((p) => (p % 4 === 0 ? [7, 7, 7, 0] : rgba(pico.rgb[0] ?? [0, 0, 0])));
    const r = quantizeDistinct(src, pico, null);
    expect(r?.transparentIndex).toBeNull();
    expect(r?.indices[0]).toBe(7);
    expect(r?.indices[1]).toBe(0);
  });

  test("error is the weighted colour distance of the chosen mapping; exact colours cost 0", () => {
    expect(quantizeDistinct(stripes(pico, 5), pico, null)?.error).toBeCloseTo(0, 9);
    const off = quantizeDistinct(solid(32, 32, [250, 20, 20, 255]), pico, null);
    expect(off?.error).toBeGreaterThan(0);
  });

  test("channels are read in the right order", () => {
    const src = image32(
      (p) =>
        [
          [255, 0, 0, 255],
          [0, 255, 0, 255],
          [0, 0, 255, 255],
        ][p % 3] ?? [],
    );
    const r = quantizeDistinct(src, pico, null);
    const [a, b, c] = [r?.indices[0], r?.indices[1], r?.indices[2]];
    expect(new Set([a, b, c]).size).toBe(3);
    expect(a).toBe(8);
  });
});

describe("rankPalettes details", () => {
  const photo = (alpha: (p: number) => number) =>
    image32((p) => [(p * 37) % 256, (p * 91) % 256, (p * 53) % 256, alpha(p)]);

  test("a photo (too many colours) is quantized per palette by nearest colour", () => {
    const ranked = rankPalettes(photo(() => 255));
    expect(ranked).toHaveLength(32);
    expect(ranked.every((c) => c.transparentIndex === null)).toBe(true);
    expect(ranked.every((c) => c.result.error > 0)).toBe(true);
    const errors = ranked.map((c) => c.result.error);
    expect(errors).toEqual(errors.toSorted((a, b) => a - b));
  });

  test("a photo with transparency uses each palette's default transparent slot", () => {
    const ranked = rankPalettes(photo((p) => (p % 4 === 0 ? 0 : 255)));
    for (const c of ranked) {
      const palette = PALETTES[c.paletteId] as Palette;
      expect(c.transparentIndex).toBe(palette.transparentDefault);
      expect(c.result.indices[0]).toBe(palette.transparentDefault);
      expect(c.result.indices[1]).not.toBe(palette.transparentDefault);
    }
  });

  test("equal errors are ordered by palette id", () => {
    const ranked = rankPalettes(image32(() => [0, 0, 0, 0]));
    expect(ranked.map((c) => c.paletteId)).toEqual(Array.from({ length: 32 }, (_, i) => i));
  });
});

describe("exactPaletteMatch details", () => {
  const base = () => {
    const s = FIXTURES.slime as Sticker;
    return paint(s.paletteId, s.pixels, s.transparentIndex);
  };

  test("both sides must be exactly 32", () => {
    const img = base();
    expect(exactPaletteMatch({ ...img, width: 33 })).toBeUndefined();
    expect(exactPaletteMatch({ ...img, height: 31 })).toBeUndefined();
    expect(exactPaletteMatch({ ...img, height: 33 })).toBeUndefined();
    expect(exactPaletteMatch(img)).toBeDefined();
  });

  test("each colour channel is compared", () => {
    for (const ch of [0, 1, 2]) {
      const img = base();
      const i = 16 * 32 * 4 + 16 * 4;
      img.data[i + 3] = 255;
      img.data[i + ch] = (img.data[i + ch] ?? 0) ^ 1;
      expect(exactPaletteMatch(img)?.paletteId).not.toBe((FIXTURES.slime as Sticker).paletteId);
    }
  });

  test("alpha 127 pixels are transparent (any colour), alpha 128 pixels must match", () => {
    const img = base();
    img.data.set([1, 2, 3, 127], 0);
    expect(exactPaletteMatch(img)).toBeDefined();
    img.data.set([1, 2, 3, 128], 0);
    expect(exactPaletteMatch(img)).toBeUndefined();
  });

  test("without transparency the result has no transparent index", () => {
    const img = image32((p) => rgba(pico.rgb[p % 16] ?? [0, 0, 0]));
    const m = exactPaletteMatch(img);
    expect(m?.transparentIndex).toBeNull();
    expect(m?.result.error).toBe(0);
  });

  test("a transparent slot is picked when one is free", () => {
    const img = image32((p) => (p % 4 === 0 ? [0, 0, 0, 0] : rgba(pico.rgb[p % 15] ?? [0, 0, 0])));
    const m = exactPaletteMatch(img);
    expect(m?.transparentIndex).not.toBeNull();
    const used = new Set(m?.result.indices.filter((_, p) => p % 4 !== 0));
    expect(used.has(m?.transparentIndex ?? -1)).toBe(false);
    expect(m?.result.indices[0]).toBe(m?.transparentIndex);
  });

  test("an image using all 16 colours plus transparency cannot be converted exactly", () => {
    const img = image32((p) => (p === 0 ? [0, 0, 0, 0] : rgba(pico.rgb[p % 16] ?? [0, 0, 0])));
    expect(exactPaletteMatch(img)?.paletteId).not.toBe(0);
  });
});
