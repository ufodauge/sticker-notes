import { describe, expect, test } from "vite-plus/test";
import type { Placement } from "./album.ts";
import type { Sticker } from "./payload.ts";
import {
  A4,
  SHEET_MARGIN,
  albumPageBox,
  layoutAlbum,
  layoutGrid,
  qrModuleMm,
  smoothPath,
  stickerGeometry,
} from "./print.ts";
import { layoutSticker } from "./render.ts";
import { FIXTURES } from "./testing/fixtures.ts";

const slime = FIXTURES.slime as Sticker;
const noise = FIXTURES.noise as Sticker;

const area = (d: string) => [...d.matchAll(/h(\d+)v1/g)].reduce((a, m) => a + Number(m[1]), 0);

describe("stickerGeometry", () => {
  test("one path per colour covering exactly the non-empty cells", () => {
    const g = stickerGeometry(slime);
    expect(g.size).toBe(36);
    const filled = layoutSticker(slime).cells.filter((c) => c >= 0).length;
    expect(g.fills.reduce((a, f) => a + area(f.d), 0)).toBe(filled);
    expect(new Set(g.fills.map((f) => f.fill)).size).toBe(g.fills.length);
    expect(g.fills[0]?.fill).toBe("#ffffff");
  });

  test("element count is bounded by colours, not by pixels", () => {
    expect(stickerGeometry(noise).fills.length).toBeLessThanOrEqual(17);
  });

  test("an opaque square has one rounded cut loop", () => {
    const solid: Sticker = { ...slime, transparentIndex: null, pixels: new Uint8Array(1024) };
    const g = stickerGeometry(solid, 0);
    expect(g.fills).toHaveLength(1);
    expect(g.cutPath.match(/M/g)).toHaveLength(1);
    expect(g.cutPath.endsWith("Z")).toBe(true);
  });
});

describe("smoothPath", () => {
  const square: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  const points = (d: string) =>
    [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);

  test("a closed curve that stays within the shape's box", () => {
    const d = smoothPath(square);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    points(d).forEach(([x, y]) => {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(10);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(10);
    });
    expect(points(d).some(([x, y]) => x === 0 && y === 0)).toBe(false);
  });

  test("a pixel staircase becomes a near-straight diagonal", () => {
    const stairs: [number, number][] = [[0, 0]];
    for (let i = 0; i < 8; i++) stairs.push([i + 1, i], [i + 1, i + 1]);
    stairs.push([0, 8]);
    const pts = points(smoothPath(stairs));
    const nearDiagonal = pts.filter(([x, y]) => x > 1.5 && y < 6.5 && x - y < 1.5);
    expect(nearDiagonal.length).toBeGreaterThan(3);
    nearDiagonal.forEach(([x, y]) => expect(Math.abs(x - y)).toBeLessThan(0.6));
  });

  test("degenerate input gives no path", () => {
    expect(
      smoothPath([
        [0, 0],
        [1, 1],
      ]),
    ).toBe("");
  });
});

describe("layoutGrid", () => {
  test("A4 grid with margin and gap, overflowing to more sheets", () => {
    const sheets = layoutGrid([{ stickerId: "a", copies: 16 }], 1.5);
    expect(sheets).toHaveLength(2);
    expect(sheets[0]?.items).toHaveLength(15);
    const items = sheets[0]?.items ?? [];
    expect(items[0]).toMatchObject({ x: SHEET_MARGIN, y: SHEET_MARGIN, size: 54, rotation: 0 });
    expect(items[1]?.x).toBeCloseTo(SHEET_MARGIN + 54 + 3);
    items.forEach((i) => {
      expect(i.x + i.size).toBeLessThanOrEqual(A4.width - SHEET_MARGIN);
      expect(i.y + i.size).toBeLessThanOrEqual(A4.height - SHEET_MARGIN);
    });
  });

  test("nothing selected → one empty sheet; dot size is clamped", () => {
    expect(layoutGrid([], 1.5)).toEqual([{ items: [] }]);
    expect(layoutGrid([{ stickerId: "a", copies: 1 }], 100)[0]?.items[0]?.size).toBe(144);
  });
});

describe("layoutAlbum", () => {
  const p = (id: string, pageId: string, over: Partial<Placement>): Placement => ({
    id,
    pageId,
    stickerId: "0".repeat(32),
    x: 0.5,
    y: 0.5,
    scale: 2,
    rotation: 0,
    z: 1,
    ...over,
  });

  test("one sheet per non-empty page, stickers where they are on screen", () => {
    const pages = [
      { id: "b", order: 1 },
      { id: "a", order: 0 },
      { id: "empty", order: 2 },
    ];
    const sheets = layoutAlbum(pages, [
      p("1", "a", { z: 2, rotation: 30 }),
      p("2", "a", { x: 0, y: 0, z: 1, scale: 1 }),
      p("3", "b", {}),
    ]);
    expect(sheets).toHaveLength(2);
    const box = albumPageBox();
    expect(box.w).toBe(200);
    const [low, high] = sheets[0]?.items ?? [];
    expect(low?.key).toBe("2");
    expect(high).toMatchObject({ key: "1", rotation: 30 });
    expect(high?.size).toBeCloseTo(48);
    expect((high?.x ?? 0) + (high?.size ?? 0) / 2).toBeCloseTo(box.x + box.w / 2);
    expect(low?.x).toBeCloseTo(box.x - (low?.size ?? 0) / 2);
  });
});

describe("stickerGeometry exact output", () => {
  const onePixel = (x: number, y: number, color: number): Sticker => {
    const pixels = new Uint8Array(1024).fill(7);
    pixels[y * 32 + x] = color;
    return { ...slime, transparentIndex: 7, pixels };
  };

  test("an unknown palette is rejected", () => {
    expect(() => stickerGeometry({ ...slime, paletteId: 99 })).toThrow("unknown palette");
  });

  test("runs of equal cells become one rectangle each, base first", () => {
    const g = stickerGeometry(onePixel(10, 10, 8), 1);
    expect(g.size).toBe(34);
    expect(g.fills).toEqual([
      { fill: "#ffffff", d: "M10 10h3v1h-3zM10 11h1v1h-1zM12 11h1v1h-1zM10 12h3v1h-3z" },
      { fill: "#ff004d", d: "M11 11h1v1h-1z" },
    ]);
  });

  test("a run that reaches the right edge ends at the edge", () => {
    const pixels = new Uint8Array(1024).fill(7);
    pixels.fill(8, 30, 32);
    pixels.fill(8, 31 * 32 + 30, 1024);
    const g = stickerGeometry({ ...slime, transparentIndex: 7, pixels }, 0);
    expect(g.fills).toEqual([{ fill: "#ff004d", d: "M30 0h2v1h-2zM30 31h2v1h-2z" }]);
  });

  test("the cut path is one smoothed loop per blob", () => {
    const g = stickerGeometry(onePixel(10, 10, 8), 1);
    expect(g.cutPath.match(/M/g)).toHaveLength(1);
    expect(g.cutPath).toBe(
      smoothPath([
        [10, 10],
        [13, 10],
        [13, 13],
        [10, 13],
      ]),
    );
  });
});

describe("smoothPath details", () => {
  const nums = (d: string) =>
    [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
  const square: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];

  test("the outline is sampled every half dot", () => {
    expect(nums(smoothPath(square))).toHaveLength(80);
    expect(
      nums(
        smoothPath([
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ]),
      ),
    ).toHaveLength(8);
  });

  test("a triangle is a valid shape", () => {
    expect(
      smoothPath([
        [0, 0],
        [6, 0],
        [0, 6],
      ]).startsWith("M"),
    ).toBe(true);
  });

  test("smoothing a symmetric shape keeps it centred and inside its box", () => {
    const pts = nums(smoothPath(square));
    const mean = (f: (p: readonly [number, number]) => number) =>
      pts.reduce((s, p) => s + f(p), 0) / pts.length;
    expect(mean((p) => p[0])).toBeCloseTo(5, 1);
    expect(mean((p) => p[1])).toBeCloseTo(5, 1);
    const length = pts.reduce((s, p, i) => {
      const q = pts[(i + 1) % pts.length] ?? p;
      return s + Math.hypot(q[0] - p[0], q[1] - p[1]);
    }, 0);
    expect(length).toBeLessThan(36);
    expect(length).toBeGreaterThan(33);
    expect(Math.min(...pts.map((p) => p[1]))).toBeLessThan(0.01);
    expect(Math.max(...pts.map((p) => p[1]))).toBeGreaterThan(9.99);
  });

  test("coordinates are rounded to 3 decimals", () => {
    const d = smoothPath([
      [0, 0],
      [7, 0],
      [7, 3],
      [0, 3],
    ]);
    for (const [x, y] of nums(d)) {
      expect(Math.round(x * 1000) / 1000).toBe(x);
      expect(Math.round(y * 1000) / 1000).toBe(y);
    }
  });
});

describe("layoutGrid details", () => {
  test("rows and columns follow the dot size", () => {
    const sheets = layoutGrid([{ stickerId: "a", copies: 36 }], 1);
    expect(sheets).toHaveLength(2);
    expect(sheets[0]?.items).toHaveLength(35);
    expect(sheets[1]?.items).toHaveLength(1);
    const items = sheets[0]?.items ?? [];
    expect(items[4]).toMatchObject({ x: 5 + 4 * 39, y: 5 });
    expect(items[5]).toMatchObject({ x: 5, y: 5 + 39 });
    expect(items[34]).toMatchObject({ x: 5 + 4 * 39, y: 5 + 6 * 39 });
    expect(sheets[1]?.items[0]).toMatchObject({ x: 5, y: 5, size: 36, dotMm: 1 });
  });

  test("dot size is clamped to 0.5–4 mm", () => {
    expect(layoutGrid([{ stickerId: "a", copies: 1 }], 0.1)[0]?.items[0]).toMatchObject({
      size: 18,
      dotMm: 0.5,
    });
    expect(layoutGrid([{ stickerId: "a", copies: 1 }], 100)[0]?.items[0]).toMatchObject({
      size: 144,
      dotMm: 4,
    });
    const sheets = layoutGrid([{ stickerId: "a", copies: 3 }], 4);
    expect(sheets.map((s) => s.items.length)).toEqual([1, 1, 1]);
  });

  test("copies are floored, negative counts give nothing, keys are unique per copy", () => {
    const sheets = layoutGrid(
      [
        { stickerId: "a", copies: 2.9 },
        { stickerId: "b", copies: -3 },
        { stickerId: "c", copies: 1 },
      ],
      1.5,
    );
    const items = sheets.flatMap((s) => s.items);
    expect(items.map((i) => i.key)).toEqual(["a-0", "a-1", "c-0"]);
    expect(items.map((i) => i.stickerId)).toEqual(["a", "a", "c"]);
  });

  test("a sticker larger than the page still gets a cell", () => {
    expect(layoutGrid([{ stickerId: "a", copies: 1 }], 4)[0]?.items).toHaveLength(1);
  });
});

describe("album page box and layout details", () => {
  test("the page is as wide as the margins allow, 3:4, centred on A4", () => {
    expect(albumPageBox()).toEqual({ x: 5, y: 15.167, w: 200, h: 266.667 });
  });

  test("placement geometry in millimetres", () => {
    const placement: Placement = {
      id: "p",
      pageId: "a",
      stickerId: "0".repeat(32),
      x: 0.25,
      y: 0.75,
      scale: 3,
      rotation: -10,
      z: 1,
    };
    const [sheet] = layoutAlbum([{ id: "a", order: 0 }], [placement]);
    const item = sheet?.items[0];
    expect(item).toMatchObject({ key: "p", size: 72, dotMm: 2, rotation: -10 });
    expect(item?.x).toBeCloseTo(5 + 0.25 * 200 - 36, 3);
    expect(item?.y).toBeCloseTo(15.167 + 0.75 * 266.667 - 36, 2);
  });

  test("pages are ordered by their order, empty pages are skipped", () => {
    const mk = (id: string, pageId: string): Placement => ({
      id,
      pageId,
      stickerId: "0".repeat(32),
      x: 0.5,
      y: 0.5,
      scale: 1,
      rotation: 0,
      z: 1,
    });
    const sheets = layoutAlbum(
      [
        { id: "z", order: 9 },
        { id: "e", order: 5 },
        { id: "a", order: 1 },
      ],
      [mk("1", "z"), mk("2", "a")],
    );
    expect(sheets.map((s) => s.items[0]?.key)).toEqual(["2", "1"]);
  });
});

describe("layoutGrid columns at the page edge", () => {
  test("two columns fit exactly when 2 stickers and a gap span the usable width", () => {
    const dot = 98.5 / 36;
    const sheets = layoutGrid([{ stickerId: "a", copies: 3 }], dot);
    expect(sheets[0]?.items.map((i) => [i.x, i.y])).toEqual([
      [5, 5],
      [106.5, 5],
      [5, 106.5],
    ]);
  });

  test("a second column that would cross the right margin is not used", () => {
    const sheets = layoutGrid([{ stickerId: "a", copies: 2 }], 2.77777);
    expect(sheets[0]?.items.map((i) => [i.x, i.y])).toEqual([
      [5, 5],
      [5, 108],
    ]);
  });
});

test("cut paths of several blobs are joined by single spaces", () => {
  const pixels = new Uint8Array(1024).fill(7);
  pixels[0] = 8;
  pixels[31 * 32 + 31] = 8;
  const g = stickerGeometry({ ...slime, transparentIndex: 7, pixels }, 1);
  const loops = g.cutPath.split(/(?<=Z) (?=M)/);
  expect(loops).toHaveLength(2);
  loops.forEach((l) => expect(l).toMatch(/^M.*Z$/));
});

describe("layoutGrid with a QR block", () => {
  const qr = { stickerId: "me", sizeMm: 40, matrixSize: 65 } as const;
  const sticker = (copies: number) => [{ stickerId: "a", copies }];

  test("the QR is the first cell of the row-major flow, with its real size", () => {
    const items = layoutGrid(sticker(2), 1.5, qr)[0]?.items ?? [];
    expect(items.map((i) => i.kind)).toEqual(["qr", "sticker", "sticker"]);
    expect(items[0]).toMatchObject({ x: SHEET_MARGIN, y: SHEET_MARGIN, size: 40, key: "qr-me" });
    expect(items[1]).toMatchObject({ x: SHEET_MARGIN + 40 + 3, y: SHEET_MARGIN, size: 54 });
    expect(items[2]).toMatchObject({ x: SHEET_MARGIN + 40 + 3 + 54 + 3, y: SHEET_MARGIN });
  });

  test("the next row starts below the tallest cell of the previous row", () => {
    const items = layoutGrid(sticker(4), 1.5, qr)[0]?.items ?? [];
    expect(items.map((i) => [i.x, i.y])).toEqual([
      [5, 5],
      [48, 5],
      [105, 5],
      [5, 62],
      [62, 62],
    ]);
  });

  test("the QR alone fills a sheet with one cell and is not duplicated", () => {
    const sheets = layoutGrid([], 1.5, qr);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.items).toHaveLength(1);
  });

  test("overflow continues on the next sheet and nothing leaves the margins", () => {
    const sheets = layoutGrid(sticker(30), 1.5, qr);
    expect(sheets.length).toBeGreaterThan(1);
    expect(sheets.flatMap((s) => s.items).filter((i) => i.kind === "qr")).toHaveLength(1);
    expect(sheets.flatMap((s) => s.items)).toHaveLength(31);
    sheets.forEach((sheet) =>
      sheet.items.forEach((i) => {
        expect(i.x + i.size).toBeLessThanOrEqual(A4.width - SHEET_MARGIN + 1e-6);
        expect(i.y + i.size).toBeLessThanOrEqual(A4.height - SHEET_MARGIN + 1e-6);
      }),
    );
    expect(sheets[1]?.items[0]).toMatchObject({ x: SHEET_MARGIN, y: SHEET_MARGIN });
  });

  test("module size in millimetres counts the quiet zone", () => {
    expect(qrModuleMm(40, 65)).toBeCloseTo(40 / 73);
    const item = layoutGrid([], 1.5, qr)[0]?.items[0];
    expect(item).toMatchObject({ kind: "qr", moduleMm: 40 / 73 });
  });

  test("without a QR block the layout is unchanged", () => {
    expect(layoutGrid(sticker(16), 1.5, null)).toEqual(layoutGrid(sticker(16), 1.5));
  });
});
