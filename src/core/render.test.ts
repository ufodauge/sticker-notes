import { describe, expect, test } from "vite-plus/test";
import { PIXEL_COUNT, type Sticker } from "./payload.ts";
import {
  CELL_BASE,
  CELL_EMPTY,
  dilate,
  edgeDepth,
  fillHoles,
  layoutSticker,
  materialMask,
  outlinePath,
  renderRgba,
  traceContours,
} from "./render.ts";
import { PALETTES } from "./palette.ts";
import { FIXTURES, rng } from "./testing/fixtures.ts";

const blank = (t = 0): Sticker => ({
  paletteId: 0,
  transparentIndex: t,
  snsKind: 1,
  snsId: "a",
  pixels: new Uint8Array(PIXEL_COUNT).fill(t),
});

const withPixels = (coords: readonly (readonly [number, number])[], color = 8): Sticker => {
  const s = blank();
  const pixels = s.pixels.slice();
  for (const [x, y] of coords) pixels[y * 32 + x] = color;
  return { ...s, pixels };
};

describe("dilate", () => {
  test("r=1 is the 8-neighbourhood", () => {
    const m = new Uint8Array(25);
    m[12] = 1;
    expect(Array.from(dilate(m, 5, 5, 1))).toEqual([
      0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0,
    ]);
  });
  test("r=2 drops the corners", () => {
    const m = new Uint8Array(25);
    m[12] = 1;
    const d = dilate(m, 5, 5, 2);
    expect(d[0]).toBe(0);
    expect(d[1]).toBe(1);
    expect(d.reduce((a, b) => a + b, 0)).toBe(21);
  });
});

test("fillHoles fills enclosed gaps only", () => {
  const w = 5;
  const m = Uint8Array.from("11111" + "10001" + "10101" + "10001" + "11011", Number);
  const f = fillHoles(m, w, 5);
  expect(f[6]).toBe(0);
  const closed = Uint8Array.from("11111" + "10001" + "10101" + "10001" + "11111", Number);
  expect(Array.from(fillHoles(closed, w, 5)).every((v) => v === 1)).toBe(true);
});

describe("layoutSticker", () => {
  test("all transparent → nothing drawn", () => {
    const l = layoutSticker(blank(7));
    expect(l.size).toBe(36);
    expect(l.cells.every((c) => c === CELL_EMPTY)).toBe(true);
  });

  test("single pixel gets a white base of radius 2", () => {
    const l = layoutSticker(withPixels([[10, 10]]));
    const at = (x: number, y: number) => l.cells[(y + 2) * l.size + x + 2];
    expect(at(10, 10)).toBe(8);
    expect(at(12, 10)).toBe(CELL_BASE);
    expect(at(12, 12)).toBe(CELL_EMPTY);
    expect(at(13, 10)).toBe(CELL_EMPTY);
  });

  test("transparent pixels inside a closed shape become white base", () => {
    const ring: [number, number][] = [];
    for (let i = 5; i <= 20; i++) ring.push([i, 5], [i, 20], [5, i], [20, i]);
    const l = layoutSticker(withPixels(ring));
    expect(l.cells[(12 + 2) * l.size + 12 + 2]).toBe(CELL_BASE);
  });

  test("no transparency → everything opaque", () => {
    const l = layoutSticker(FIXTURES.longestId as Sticker);
    expect(l.cells.filter((c) => c === CELL_BASE).length).toBeGreaterThan(0);
    expect(l.cells.filter((c) => c >= 0 && c < 16).length).toBe(1024);
  });
});

test("renderRgba uses palette colours and leaves outside transparent", () => {
  const { size, rgba } = renderRgba(withPixels([[0, 0]], 8));
  expect(size).toBe(36);
  const px = (x: number, y: number) =>
    Array.from(rgba.subarray((y * size + x) * 4, (y * size + x) * 4 + 4));
  expect(px(2, 2)).toEqual([0xff, 0x00, 0x4d, 255]);
  expect(px(0, 2)).toEqual([255, 255, 255, 255]);
  expect(px(35, 35)).toEqual([0, 0, 0, 0]);
});

describe("traceContours", () => {
  test("square blob → one rectangle", () => {
    const l = layoutSticker({ ...blank(), transparentIndex: null }, 0);
    expect(traceContours(l)).toEqual([
      [
        [0, 0],
        [32, 0],
        [32, 32],
        [0, 32],
      ],
    ]);
  });

  test("two separate blobs → two contours", () => {
    const l = layoutSticker(
      withPixels([
        [2, 2],
        [20, 20],
      ]),
      1,
    );
    const cs = traceContours(l);
    expect(cs).toHaveLength(2);
    cs.forEach((c) => expect(c).toHaveLength(4));
  });

  test("diagonal-touching pixels stay as separate loops", () => {
    const l = layoutSticker(
      withPixels([
        [2, 2],
        [3, 3],
      ]),
      0,
    );
    expect(traceContours(l)).toHaveLength(2);
  });

  test("every contour is closed and axis aligned", () => {
    for (const s of Object.values(FIXTURES)) {
      for (const c of traceContours(layoutSticker(s))) {
        c.forEach((p, i) => {
          const q = c[(i + 1) % c.length] ?? p;
          expect(p[0] === q[0] || p[1] === q[1]).toBe(true);
        });
      }
    }
  });
});

function refDilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let yy = 0; yy < h; yy++)
        for (let xx = 0; xx < w; xx++)
          if (mask[yy * w + xx] && (x - xx) ** 2 + (y - yy) ** 2 <= r * r + r) out[y * w + x] = 1;
  return out;
}

function refFill(mask: Uint8Array, w: number, h: number): Uint8Array {
  const outside = new Set<number>();
  const queue: [number, number][] = [];
  const visit = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h || mask[y * w + x] || outside.has(y * w + x)) return;
    outside.add(y * w + x);
    queue.push([x, y]);
  };
  for (let x = 0; x < w; x++) {
    visit(x, 0);
    visit(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    visit(0, y);
    visit(w - 1, y);
  }
  for (let q = queue.shift(); q; q = queue.shift()) {
    visit(q[0] + 1, q[1]);
    visit(q[0] - 1, q[1]);
    visit(q[0], q[1] + 1);
    visit(q[0], q[1] - 1);
  }
  return Uint8Array.from({ length: w * h }, (_, i) => (outside.has(i) ? 0 : 1));
}

const randomMask = (r: () => number, w: number, h: number, density: number) =>
  Uint8Array.from({ length: w * h }, () => (r() < density ? 1 : 0));

describe("grid operations against reference implementations", () => {
  test("dilate on non-square grids, with pixels on every edge", () => {
    const r = rng(21);
    for (let t = 0; t < 60; t++) {
      const w = 3 + Math.floor(r() * 6);
      const h = 3 + Math.floor(r() * 6);
      const m = randomMask(r, w, h, 0.15);
      for (const rad of [0, 1, 2, 3]) {
        expect(Array.from(dilate(m, w, h, rad))).toEqual(Array.from(refDilate(m, w, h, rad)));
      }
    }
  });

  test("a pixel on an edge does not wrap into the next or previous row", () => {
    const left = new Uint8Array(4 * 3);
    left[1 * 4 + 0] = 1;
    expect(Array.from(dilate(left, 4, 3, 1))).toEqual([1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0]);
    const right = new Uint8Array(4 * 3);
    right[1 * 4 + 3] = 1;
    expect(Array.from(dilate(right, 4, 3, 1))).toEqual([0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1]);
    const bottom = new Uint8Array(4 * 3);
    bottom[2 * 4 + 1] = 1;
    expect(Array.from(dilate(bottom, 4, 3, 1))).toEqual([0, 0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0]);
  });

  test("fillHoles matches a flood-fill reference on random non-square masks", () => {
    const r = rng(22);
    for (let t = 0; t < 200; t++) {
      const w = 2 + Math.floor(r() * 8);
      const h = 2 + Math.floor(r() * 8);
      const m = randomMask(r, w, h, 0.55);
      expect(Array.from(fillHoles(m, w, h))).toEqual(Array.from(refFill(m, w, h)));
    }
  });

  test.each([
    ["top", 2, 0],
    ["bottom", 2, 4],
    ["left", 0, 2],
    ["right", 4, 2],
  ])("an interior gap opened through the %s edge is not a hole", (_side, ox, oy) => {
    const m = Uint8Array.from({ length: 25 }, (_, i) => {
      const x = i % 5;
      const y = Math.floor(i / 5);
      const ring = x === 0 || y === 0 || x === 4 || y === 4;
      return ring && !(x === ox && y === oy) ? 1 : 0;
    });
    const f = fillHoles(m, 5, 5);
    expect(f[2 * 5 + 2]).toBe(0);
    expect(f[ox + oy * 5]).toBe(0);
  });
});

describe("renderRgba errors", () => {
  test("an unknown palette is rejected", () => {
    expect(() => renderRgba({ ...blank(), paletteId: 99 })).toThrow("unknown palette");
  });

  test("the base is white and every colour comes from the palette", () => {
    const s = withPixels([[5, 5]], 3);
    const { size, rgba } = renderRgba(s);
    const palette = PALETTES[0];
    const at = (x: number, y: number) =>
      Array.from(rgba.subarray((y * size + x) * 4, (y * size + x) * 4 + 4));
    expect(at(7, 7)).toEqual([...(palette?.rgb[3] ?? []), 255]);
    expect(at(6, 7)).toEqual([255, 255, 255, 255]);
  });
});

describe("traceContours details", () => {
  const key = (p: readonly [number, number]) => `${p[0]},${p[1]}`;

  function components(l: ReturnType<typeof layoutSticker>): number {
    const seen = new Set<number>();
    const filled = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < l.size && y < l.size && l.cells[y * l.size + x] !== CELL_EMPTY;
    let count = 0;
    for (let i = 0; i < l.size * l.size; i++) {
      if (!filled(i % l.size, Math.floor(i / l.size)) || seen.has(i)) continue;
      count++;
      const stack = [i];
      for (let c = stack.pop(); c !== undefined; c = stack.pop()) {
        if (seen.has(c)) continue;
        seen.add(c);
        const x = c % l.size;
        const y = Math.floor(c / l.size);
        if (filled(x - 1, y)) stack.push(c - 1);
        if (filled(x + 1, y)) stack.push(c + 1);
        if (filled(x, y - 1)) stack.push(c - l.size);
        if (filled(x, y + 1)) stack.push(c + l.size);
      }
    }
    return count;
  }

  const shoelace = (c: readonly (readonly [number, number])[]) =>
    c.reduce((s, p, i) => {
      const q = c[(i + 1) % c.length] ?? p;
      return s + (p[0] * q[1] - q[0] * p[1]) / 2;
    }, 0);

  test("a single cell is a clockwise unit square starting at its top-left corner", () => {
    const l = layoutSticker(withPixels([[2, 2]]), 0);
    expect(traceContours(l)).toEqual([
      [
        [2, 2],
        [3, 2],
        [3, 3],
        [2, 3],
      ],
    ]);
  });

  test.each([
    [
      "backslash",
      [
        [2, 2],
        [3, 3],
      ],
    ],
    [
      "slash",
      [
        [3, 2],
        [2, 3],
      ],
    ],
  ] as const)("diagonal neighbours (%s) give two separate unit squares", (_n, coords) => {
    const cs = traceContours(layoutSticker(withPixels(coords), 0));
    expect(cs).toHaveLength(2);
    cs.forEach((c) => expect(c).toHaveLength(4));
    cs.forEach((c) => expect(shoelace(c)).toBe(1));
  });

  test("contours are ordered by their start vertex, numerically", () => {
    const cs = traceContours(
      layoutSticker(
        withPixels([
          [1, 3],
          [9, 0],
        ]),
        0,
      ),
    );
    expect(cs.map((c) => key(c[0] as [number, number]))).toEqual(["9,0", "1,3"]);
  });

  test("random shapes: one loop per connected blob, areas add up, no collinear vertices", () => {
    const r = rng(33);
    for (let t = 0; t < 60; t++) {
      const coords: [number, number][] = [];
      const n = 1 + Math.floor(r() * 40);
      for (let i = 0; i < n; i++) coords.push([Math.floor(r() * 12), Math.floor(r() * 12)]);
      const l = layoutSticker(withPixels(coords), Math.floor(r() * 3));
      const cs = traceContours(l);
      expect(cs).toHaveLength(components(l));
      const filled = l.cells.filter((c) => c !== CELL_EMPTY).length;
      expect(cs.reduce((s, c) => s + shoelace(c), 0)).toBe(filled);
      for (const c of cs) {
        c.forEach((p, i) => {
          const a = c[(i + c.length - 1) % c.length] ?? p;
          const b = c[(i + 1) % c.length] ?? p;
          expect((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])).not.toBe(0);
        });
      }
    }
  });

  test("a clockwise loop leaves the shape on its right (positive area) for every fixture", () => {
    for (const s of Object.values(FIXTURES)) {
      for (const c of traceContours(layoutSticker(s))) expect(shoelace(c)).toBeGreaterThan(0);
    }
  });
});

describe("materials", () => {
  const slime = FIXTURES.slime as Sticker;
  const alphaAt = (rgba: Uint8ClampedArray, i: number) => rgba[i * 4 + 3];

  test("a clear sticker's white base lets the paper through; its art stays opaque", () => {
    const plain = renderRgba(slime);
    const clear = renderRgba({ ...slime, material: { kind: "clear", tone: 0 } });
    const { cells } = layoutSticker(slime);
    const base = cells.indexOf(CELL_BASE);
    const art = cells.findIndex((c) => c >= 0 && c < 16);
    expect(alphaAt(plain.rgba, base)).toBe(255);
    expect(alphaAt(clear.rgba, base)).toBeLessThan(128);
    expect(alphaAt(clear.rgba, art)).toBe(255);
  });

  test("the mask covers the whole sticker, or only the foil colour", () => {
    const { cells } = layoutSticker(slime);
    const whole = materialMask({ ...slime, material: { kind: "holo", tone: 0 } });
    const tone = cells.find((c) => c >= 0 && c < 16) ?? 0;
    const foil = materialMask({ ...slime, material: { kind: "foil", tone } });
    cells.forEach((c, i) => {
      expect(alphaAt(whole.rgba, i)).toBe(c === CELL_EMPTY ? 0 : 255);
      expect(alphaAt(foil.rgba, i)).toBe(c === tone ? 255 : 0);
    });
  });
});

describe("outlinePath", () => {
  test("one closed loop per island, inside the unit square", () => {
    const d = outlinePath(FIXTURES.slime as Sticker);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    const numbers = d.match(/[\d.]+/g)?.map(Number) ?? [];
    expect(numbers.length).toBeGreaterThan(8);
    expect(numbers.every((n) => n >= 0 && n <= 1)).toBe(true);
  });

  test("an empty sticker has nothing to touch", () => {
    const slime = FIXTURES.slime as Sticker;
    const empty = {
      ...slime,
      pixels: new Uint8Array(PIXEL_COUNT).fill(slime.transparentIndex ?? 0),
    };
    expect(outlinePath(empty)).toBe("");
  });
});

describe("edgeDepth", () => {
  test("1 on the outline, deeper inside, 0 outside", () => {
    const slime = FIXTURES.slime as Sticker;
    const { size, depth } = edgeDepth(slime);
    const { cells } = layoutSticker(slime);
    cells.forEach((c, i) => expect(depth[i] === 0).toBe(c === CELL_EMPTY));
    expect(Math.max(...depth)).toBeGreaterThan(4);
    expect(depth[0]).toBe(0);
    expect(size).toBe(36);
  });

  test("a full square is deepest in its middle", () => {
    const slime = FIXTURES.slime as Sticker;
    const full = { ...slime, transparentIndex: null };
    const { size, depth } = edgeDepth(full);
    const mid = Math.floor(size / 2);
    expect(depth[mid * size + mid]).toBe(size / 2);
    expect(depth[mid * size]).toBe(1);
  });
});
