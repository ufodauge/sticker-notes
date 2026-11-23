import { readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";
import { decodeRgba } from "../../test/png.ts";
import { assignMinCost } from "./assign.ts";
import { PALETTES } from "./palette.ts";
import { detectGrid, fitTo32, importPixelArt, toNative } from "./pixelart.ts";
import { quantizeDistinct, rankPalettes, type Rgba } from "./quantize.ts";
import { rng } from "./testing/fixtures.ts";

const load = (path: string): Rgba => {
  return decodeRgba(readFileSync(path));
};

function art(dots: readonly (readonly number[])[], k: number, pad = 0): Rgba {
  const h = dots.length;
  const w = dots[0]?.length ?? 0;
  const W = w * k + pad * 2;
  const H = h * k + pad * 2;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < h * k; y++)
    for (let x = 0; x < w * k; x++) {
      const c = dots[Math.floor(y / k)]?.[Math.floor(x / k)] ?? 0;
      data.set([(c >> 16) & 255, (c >> 8) & 255, c & 255, 255], ((y + pad) * W + x + pad) * 4);
    }
  return { width: W, height: H, data };
}

describe("pixel art import", () => {
  test("sample.png: 12px dots → native 18×19, centred at 1×", () => {
    const img = load("test/fixtures/sample.png");
    expect(detectGrid(img)).toEqual({ dot: 12, ox: 0, oy: 0 });
    const fit = importPixelArt(img);
    expect(fit?.native.width).toBe(18);
    expect(fit?.native.height).toBe(19);
    expect(fit?.scale).toBe(1);
  });

  test("small art is enlarged by the largest integer that fits", () => {
    const dots = Array.from({ length: 10 }, (_, y) =>
      Array.from({ length: 8 }, (_, x) => ((x + y) % 2 ? 0xff0000 : 0x0000ff)),
    );
    const fit = importPixelArt(art(dots, 7));
    expect(fit?.scale).toBe(3);
    const px = (x: number, y: number) =>
      Array.from(fit?.image.data.subarray((y * 32 + x) * 4, (y * 32 + x) * 4 + 3) ?? []);
    expect(px(4, 1)).toEqual(px(6, 3));
  });

  test("a 32-dot canvas keeps its margins (no re-centring)", () => {
    const dots = Array.from({ length: 32 }, (_, y) =>
      Array.from({ length: 32 }, (_, x) => (x < 20 && y < 10 ? 0x336699 : -1)),
    );
    const img = art(dots, 4);
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i] === 255 && img.data[i + 1] === 255 && img.data[i + 2] === 255)
        img.data[i + 3] = 0;
    }
    const fit = importPixelArt(img);
    const alpha = Array.from({ length: 1024 }, (_, i) => fit?.image.data[i * 4 + 3]);
    const expected = Array.from({ length: 1024 }, (_, i) => (i % 32 < 20 && i < 320 ? 255 : 0));
    expect(alpha).toEqual(expected);
  });

  test("grid phase offset is found", () => {
    const dots = [
      [0x111111, 0x222222, 0x333333],
      [0x444444, 0x555555, 0x666666],
      [0x777777, 0x888888, 0x999999],
    ];
    const img = art(dots, 5);
    const W = img.width - 2;
    const data = new Uint8ClampedArray(W * (img.height - 2) * 4);
    for (let y = 0; y < img.height - 2; y++)
      data.set(
        img.data.subarray(((y + 2) * img.width + 2) * 4, ((y + 2) * img.width + img.width) * 4),
        y * W * 4,
      );
    const g = detectGrid({ width: W, height: img.height - 2, data });
    expect(g).toEqual({ dot: 5, ox: 3, oy: 3 });
  });

  test("photos are not treated as pixel art; >32 dots need real downscaling", () => {
    const noise = new Uint8ClampedArray(200 * 200 * 4).map((_, i) =>
      i % 4 === 3 ? 255 : (i * 7919) % 251,
    );
    expect(detectGrid({ width: 200, height: 200, data: noise })).toBeUndefined();
    const big = Array.from({ length: 40 }, (_, y) =>
      Array.from({ length: 40 }, (_, x) => ((x + y) % 3 ? 0xffffff : 0)),
    );
    expect(fitTo32(toNative(art(big, 2), { dot: 2, ox: 0, oy: 0 }))).toBeUndefined();
  });
});

describe("one-to-one colour mapping", () => {
  test("assignMinCost finds the optimum", () => {
    expect(
      assignMinCost([
        [4, 1, 3],
        [2, 0, 5],
        [3, 2, 2],
      ]),
    ).toEqual([1, 0, 2]);
    expect(
      assignMinCost([
        [1, 9],
        [1, 2],
      ]),
    ).toEqual([0, 1]);
  });

  test("similar shades stay different colours", () => {
    const dots = Array.from({ length: 4 }, (_, y) =>
      Array.from({ length: 4 }, () => (y < 2 ? 0x6ac7ca : 0x81d9dd)),
    );
    const fit = importPixelArt(art(dots, 4));
    if (!fit) throw new Error("no fit");
    for (const p of PALETTES) {
      const r = quantizeDistinct(fit.image, p, null);
      const top = r?.indices[8 * 32 + 16];
      const bottom = r?.indices[24 * 32 + 16];
      expect(top).not.toBe(bottom);
    }
  });

  test("transparent slot is never a colour the art uses", () => {
    const fit = importPixelArt(load("test/fixtures/sample.png"));
    if (!fit) throw new Error("no fit");
    for (const c of rankPalettes(fit.image)) {
      const opaque = new Set<number>();
      fit.image.data.forEach((_, i) => {
        if (i % 4 === 3 && (fit.image.data[i] ?? 0) >= 128)
          opaque.add(c.result.indices[(i - 3) / 4] ?? -1);
      });
      expect(c.transparentIndex === null || !opaque.has(c.transparentIndex)).toBe(true);
    }
  });
});

function fromRows(rows: readonly (readonly (readonly [number, number, number] | null)[])[]): Rgba {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const data = new Uint8ClampedArray(w * h * 4);
  rows.forEach((row, y) =>
    row.forEach((c, x) => data.set(c ? [...c, 255] : [9, 9, 9, 0], (y * w + x) * 4)),
  );
  return { width: w, height: h, data };
}

const rgbaAt = (img: Rgba, x: number, y: number) =>
  Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

function canvas(w: number, h: number, pixels: readonly (readonly [number, number])[]): Rgba {
  const data = new Uint8ClampedArray(w * h * 4);
  pixels.forEach(([x, y], n) => data.set([10 + n, 20, 30, 255], (y * w + x) * 4));
  return { width: w, height: h, data };
}

const noiseImage = (w: number, h: number): Rgba => ({
  width: w,
  height: h,
  data: new Uint8ClampedArray(w * h * 4).map((_, i) =>
    i % 4 === 3 ? 255 : ((i >> 2) * 37 + (i % 4) * 11) % 200,
  ),
});

describe("detectGrid details", () => {
  test("a transparent pixel never merges with a real colour", () => {
    const A: readonly [number, number, number] = [0, 0, 1];
    const img = fromRows([
      [A, null],
      [A, null],
    ]);
    expect(detectGrid(img)).toEqual({ dot: 1, ox: 0, oy: 0 });
  });

  test.each([
    ["red", [1, 0, 0], [2, 0, 0]],
    ["green", [0, 1, 0], [0, 2, 0]],
    ["blue", [0, 0, 1], [0, 0, 2]],
  ] as const)("colours differing only in %s are different", (_c, a, b) => {
    const img = fromRows([
      [a, b],
      [a, b],
    ]);
    expect(detectGrid(img)).toEqual({ dot: 1, ox: 0, oy: 0 });
  });

  test("the colour limit: 256 colours are art, 257 are a photo", () => {
    const dots = (n: number) =>
      Array.from({ length: 17 }, (_, y) =>
        Array.from({ length: 16 }, (_, x) => (Math.min(n - 1, y * 16 + x) << 8) | 0x40),
      );
    expect(detectGrid(art(dots(256), 3))).toEqual({ dot: 3, ox: 0, oy: 0 });
    expect(detectGrid(art(dots(257), 3))).toBeUndefined();
  });

  test("a dot size of 2 is a grid, a 1:1 image is native", () => {
    const dots = [
      [0x111111, 0x222222],
      [0x333333, 0x444444],
    ];
    expect(detectGrid(art(dots, 2))).toEqual({ dot: 2, ox: 0, oy: 0 });
    expect(detectGrid(art(dots, 1))).toEqual({ dot: 1, ox: 0, oy: 0 });
  });

  test.each([
    [1, 3],
    [4, 2],
    [2, 0],
    [0, 4],
  ])("grid phase after cropping %i columns and %i rows", (cx, cy) => {
    const dots = Array.from({ length: 6 }, (_, y) =>
      Array.from({ length: 6 }, (_, x) => ((x * 6 + y + 1) * 0x0a0b0c) & 0xffffff),
    );
    const k = 5;
    const img = art(dots, k);
    const W = img.width - cx;
    const H = img.height - cy;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++)
      data.set(
        img.data.subarray(((y + cy) * img.width + cx) * 4, ((y + cy) * img.width + img.width) * 4),
        y * W * 4,
      );
    expect(detectGrid({ width: W, height: H, data })).toEqual({
      dot: k,
      ox: (k - cx) % k,
      oy: (k - cy) % k,
    });
  });

  test("a few stray pixels do not break the grid", () => {
    const dots = Array.from({ length: 10 }, (_, y) =>
      Array.from({ length: 10 }, (_, x) => ((x + 2 * y) % 5) * 0x202020 + 0x101010),
    );
    const img = art(dots, 6);
    img.data.set([255, 255, 255, 255], (7 * img.width + 7) * 4);
    img.data.set([0, 0, 0, 255], (31 * img.width + 40) * 4);
    expect(detectGrid(img)).toEqual({ dot: 6, ox: 0, oy: 0 });
  });

  test("a small image without any grid is native, a large one is not art", () => {
    expect(detectGrid(noiseImage(64, 64))).toEqual({ dot: 1, ox: 0, oy: 0 });
    expect(detectGrid(noiseImage(65, 65))).toBeUndefined();
    expect(detectGrid(noiseImage(20, 70))).toBeUndefined();
    expect(detectGrid(noiseImage(70, 20))).toBeUndefined();
  });
});

describe("toNative details", () => {
  test("samples block centres and honours the grid offset", () => {
    const rows = Array.from({ length: 5 }, (_, y) =>
      Array.from({ length: 9 }, (_, x) => {
        const bx = x < 3 ? 0 : x < 7 ? 1 : 2;
        const by = y < 3 ? 0 : 1;
        return [bx * 50 + 10, by * 100 + 20, 5] as const;
      }),
    );
    const n = toNative(fromRows(rows), { dot: 4, ox: 3, oy: 3 });
    expect([n.width, n.height]).toEqual([3, 2]);
    expect(rgbaAt(n, 0, 0)).toEqual([10, 20, 5, 255]);
    expect(rgbaAt(n, 1, 0)).toEqual([60, 20, 5, 255]);
    expect(rgbaAt(n, 2, 0)).toEqual([110, 20, 5, 255]);
    expect(rgbaAt(n, 2, 1)).toEqual([110, 120, 5, 255]);
  });

  test("without an offset the image starts at the first block", () => {
    const rows = Array.from({ length: 4 }, (_, y) =>
      Array.from(
        { length: 6 },
        (_, x) => [Math.floor(x / 2) * 40, Math.floor(y / 2) * 80, 1] as const,
      ),
    );
    const n = toNative(fromRows(rows), { dot: 2, ox: 0, oy: 0 });
    expect([n.width, n.height]).toEqual([3, 2]);
    expect(rgbaAt(n, 2, 1)).toEqual([80, 80, 1, 255]);
  });

  test("a partial last block is sampled inside the image", () => {
    const row = [
      [0, 0, 0],
      [0, 0, 0],
      [1, 1, 1],
      [1, 1, 1],
      [2, 2, 2],
    ] as const;
    const n = toNative(fromRows([row, row]), { dot: 2, ox: 0, oy: 0 });
    expect(n.width).toBe(3);
    expect(rgbaAt(n, 2, 0)).toEqual([2, 2, 2, 255]);
  });
});

describe("fitTo32 details", () => {
  test("an empty drawing has no fit", () => {
    expect(fitTo32(canvas(8, 8, []))).toBeUndefined();
  });

  test("a single opaque pixel at (0,0) is still found", () => {
    const fit = fitTo32(canvas(40, 40, [[0, 0]]));
    expect(fit?.scale).toBe(32);
    expect(rgbaAt(fit?.image as Rgba, 0, 0)[3]).toBe(255);
  });

  test("a canvas that fits is kept whole: margins stay", () => {
    const fit = fitTo32(canvas(10, 10, [[2, 3]]));
    expect(fit?.scale).toBe(3);
    const img = fit?.image as Rgba;
    const opaque = Array.from({ length: 1024 }, (_, i) => img.data[i * 4 + 3] === 255);
    const expected = Array.from({ length: 1024 }, (_, i) => {
      const x = i % 32;
      const y = Math.floor(i / 32);
      return x >= 8 && x < 11 && y >= 11 && y < 14;
    });
    expect(opaque).toEqual(expected);
  });

  test("the margin is balanced around the centre of mass, not the bounding box", () => {
    const fit = fitTo32(canvas(11, 11, [[0, 5]]));
    expect(fit?.scale).toBe(2);
    const img = fit?.image as Rgba;
    expect(rgbaAt(img, 10, 15)[3]).toBe(255);
    expect(rgbaAt(img, 11, 16)[3]).toBe(255);
    expect(rgbaAt(img, 9, 15)[3]).toBe(0);
    expect(rgbaAt(img, 10, 14)[3]).toBe(0);
  });

  test("a non-square canvas is centred on both axes", () => {
    const fit = fitTo32(
      canvas(20, 10, [
        [0, 0],
        [19, 9],
      ]),
    );
    expect(fit?.scale).toBe(1);
    const img = fit?.image as Rgba;
    expect(rgbaAt(img, 6, 11)[3]).toBe(255);
    expect(rgbaAt(img, 25, 20)[3]).toBe(255);
    expect(rgbaAt(img, 5, 11)[3]).toBe(0);
    expect(rgbaAt(img, 6, 10)[3]).toBe(0);
    expect(rgbaAt(img, 26, 20)[3]).toBe(0);
    expect(rgbaAt(img, 25, 21)[3]).toBe(0);
  });

  test("pixel colours are copied to the right place", () => {
    const fit = fitTo32(
      canvas(4, 4, [
        [1, 0],
        [3, 2],
        [0, 3],
      ]),
    );
    const img = fit?.image as Rgba;
    expect(fit?.scale).toBe(8);
    expect(rgbaAt(img, 8, 0)).toEqual([10, 20, 30, 255]);
    expect(rgbaAt(img, 24, 16)).toEqual([11, 20, 30, 255]);
    expect(rgbaAt(img, 0, 24)).toEqual([12, 20, 30, 255]);
    expect(rgbaAt(img, 31, 31)[3]).toBe(0);
    expect(rgbaAt(img, 0, 0)[3]).toBe(0);
  });

  test("an oversized canvas is trimmed to the drawing", () => {
    const fit = fitTo32(
      canvas(50, 50, [
        [10, 20],
        [14, 22],
      ]),
    );
    expect(fit?.scale).toBe(6);
    const img = fit?.image as Rgba;
    expect(rgbaAt(img, 1, 7)).toEqual([10, 20, 30, 255]);
    expect(rgbaAt(img, 0, 7)[3]).toBe(0);
    expect(rgbaAt(img, 1, 6)[3]).toBe(0);
    expect(rgbaAt(img, 25, 19)).toEqual([11, 20, 30, 255]);
  });

  test("alpha threshold: half-opaque pixels count, fainter ones do not", () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    data.set([1, 2, 3, 127], 0);
    expect(fitTo32({ width: 4, height: 4, data })).toBeUndefined();
    data.set([1, 2, 3, 128], 0);
    expect(fitTo32({ width: 4, height: 4, data })?.scale).toBe(8);
  });

  test("the drawing may be exactly 32 dots, never 33, on either axis", () => {
    const two = (a: readonly [number, number], b: readonly [number, number]) =>
      fitTo32(canvas(40, 40, [a, b]));
    expect(two([0, 0], [31, 0])?.scale).toBe(1);
    expect(two([0, 0], [32, 0])).toBeUndefined();
    expect(two([0, 0], [0, 32])).toBeUndefined();
    expect(two([0, 0], [0, 31])?.scale).toBe(1);
    expect(fitTo32(canvas(32, 32, [[0, 0]]))?.scale).toBe(1);
    expect(fitTo32(canvas(33, 5, [[16, 2]]))?.scale).toBe(32);
    expect(fitTo32(canvas(5, 33, [[2, 16]]))?.scale).toBe(32);
  });
});

test("importPixelArt returns undefined for a photo", () => {
  expect(importPixelArt(noiseImage(200, 200))).toBeUndefined();
});

describe("fitTo32 against a reference", () => {
  function expectedAlpha(native: Rgba): number[] | undefined {
    const opaque = (x: number, y: number) =>
      (native.data[(y * native.width + x) * 4 + 3] ?? 0) >= 128;
    const pts: [number, number][] = [];
    for (let y = 0; y < native.height; y++)
      for (let x = 0; x < native.width; x++) if (opaque(x, y)) pts.push([x, y]);
    if (pts.length === 0) return undefined;
    const fits = native.width <= 32 && native.height <= 32;
    const x0 = fits ? 0 : Math.min(...pts.map((p) => p[0]));
    const y0 = fits ? 0 : Math.min(...pts.map((p) => p[1]));
    const x1 = fits ? native.width - 1 : Math.max(...pts.map((p) => p[0]));
    const y1 = fits ? native.height - 1 : Math.max(...pts.map((p) => p[1]));
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    if (bw > 32 || bh > 32) return undefined;
    const s = Math.floor(32 / Math.max(bw, bh));
    const cx = pts.reduce((a, p) => a + p[0] + 0.5 - x0, 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p[1] + 0.5 - y0, 0) / pts.length;
    const put = (c: number, len: number) =>
      Math.max(0, Math.min(32 - len * s, Math.ceil(16 - c * s - 0.5)));
    const ox = put(cx, bw);
    const oy = put(cy, bh);
    return Array.from({ length: 1024 }, (_, i) => {
      const x = (i % 32) - ox;
      const y = Math.floor(i / 32) - oy;
      if (x < 0 || y < 0 || x >= bw * s || y >= bh * s) return 0;
      return opaque(x0 + Math.floor(x / s), y0 + Math.floor(y / s)) ? 255 : 0;
    });
  }

  test("random canvases, including opaque pixels on every edge", () => {
    const r = rng(77);
    for (let t = 0; t < 150; t++) {
      const w = 1 + Math.floor(r() * 45);
      const h = 1 + Math.floor(r() * 45);
      const data = new Uint8ClampedArray(w * h * 4);
      const density = r() < 0.5 ? 0.05 : 0.5;
      for (let i = 0; i < w * h; i++) if (r() < density) data.set([i % 256, 9, 9, 255], i * 4);
      data.set([1, 2, 3, 255], (w * h - 1) * 4);
      data.set([1, 2, 3, 255], w * (h - 1) * 4);
      const native = { width: w, height: h, data };
      const fit = fitTo32(native);
      const want = expectedAlpha(native);
      if (!want) {
        expect(fit).toBeUndefined();
        continue;
      }
      expect(fit).toBeDefined();
      expect(Array.from({ length: 1024 }, (_, i) => fit?.image.data[i * 4 + 3])).toEqual(want);
    }
  });
});
