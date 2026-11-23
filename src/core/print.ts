import { PAGE_ASPECT, type Page, type Placement } from "./album.ts";
import { getPalette } from "./palette.ts";
import type { Sticker } from "./payload.ts";
import {
  BASE_COLOR,
  CELL_BASE,
  CELL_EMPTY,
  DEFAULT_OUTLINE,
  layoutSticker,
  traceContours,
  type Point,
} from "./render.ts";

export const A4 = { width: 210, height: 297 } as const;
export const SHEET_MARGIN = 5;
const SHEET_GAP = 3;
export const DEFAULT_DOT_MM = 1.5;
export const MIN_DOT_MM = 0.5;
export const MAX_DOT_MM = 4;
export const CUT_STROKE_MM = 0.2;
const PAGE_DOTS = 300;

export type StickerGeometry = {
  readonly size: number;
  readonly fills: readonly { readonly fill: string; readonly d: string }[];
  readonly cutPath: string;
};

const hex = ([r, g, b]: readonly [number, number, number]) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function stickerGeometry(s: Sticker, outline = DEFAULT_OUTLINE): StickerGeometry {
  const palette = getPalette(s.paletteId);
  if (!palette) throw new Error("unknown palette");
  const layout = layoutSticker(s, outline);
  const { size, cells } = layout;
  const byFill = new Map<string, string[]>();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size;) {
      const c = cells[y * size + x] ?? CELL_EMPTY;
      const start = x;
      while (x < size && cells[y * size + x] === c) x++;
      if (c === CELL_EMPTY) continue;
      const fill = hex(c === CELL_BASE ? BASE_COLOR : (palette.rgb[c] ?? BASE_COLOR));
      byFill.set(fill, [
        ...(byFill.get(fill) ?? []),
        `M${start} ${y}h${x - start}v1h${start - x}z`,
      ]);
    }
  }
  const cutPath = traceContours(layout).map(smoothPath).join(" ");
  return {
    size,
    fills: [...byFill]
      .toSorted(([a], [b]) => Number(b === hex(BASE_COLOR)) - Number(a === hex(BASE_COLOR)))
      .map(([fill, parts]) => ({ fill, d: parts.join("") })),
    cutPath,
  };
}

function resample(poly: readonly Point[], step: number): Point[] {
  return poly.flatMap(([ax, ay], i) => {
    const [bx, by] = poly[(i + 1) % poly.length] ?? [ax, ay];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
    return Array.from({ length: n }, (_, k): Point => [
      ax + ((bx - ax) * k) / n,
      ay + ((by - ay) * k) / n,
    ]);
  });
}

function average(points: readonly Point[], radius: number): Point[] {
  const n = points.length;
  return points.map((_, i) => {
    const sum = { x: 0, y: 0 };
    for (let k = -radius; k <= radius; k++) {
      const [x, y] = points[(i + k + n) % n] ?? [0, 0];
      sum.x += x;
      sum.y += y;
    }
    const w = radius * 2 + 1;
    return [sum.x / w, sum.y / w];
  });
}

const SAMPLES_PER_DOT = 2;
const SMOOTH_DOTS = 2;
const SMOOTH_PASSES = 3;

export function smoothPath(poly: readonly Point[]): string {
  if (poly.length < 3) return "";
  const sampled = resample(poly, 1 / SAMPLES_PER_DOT);
  const smooth = Array.from({ length: SMOOTH_PASSES }).reduce<Point[]>(
    (pts) => average(pts, SMOOTH_DOTS * SAMPLES_PER_DOT),
    sampled,
  );
  const f = ([x, y]: Point) => `${round3(x)} ${round3(y)}`;
  return `M${smooth.map(f).join("L")}Z`;
}

type SheetItem = {
  readonly key: string;
  readonly stickerId: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly dotMm: number;
  readonly rotation: number;
};
export type Sheet = { readonly items: readonly SheetItem[] };

const clampDot = (d: number) => Math.min(MAX_DOT_MM, Math.max(MIN_DOT_MM, d));
const SIDE_DOTS = 32 + DEFAULT_OUTLINE * 2;

export function layoutGrid(
  entries: readonly { readonly stickerId: string; readonly copies: number }[],
  dotMm: number,
): readonly Sheet[] {
  const dot = clampDot(dotMm);
  const cell = round3(SIDE_DOTS * dot);
  const copies = entries.flatMap((e) =>
    Array.from({ length: Math.max(0, Math.floor(e.copies)) }, (_, i) => ({
      key: `${e.stickerId}-${i}`,
      stickerId: e.stickerId,
    })),
  );
  if (copies.length === 0)
    return [
      {
        items: [],
      },
    ];

  const usableW = A4.width - SHEET_MARGIN * 2;
  const usableH = A4.height - SHEET_MARGIN * 2;
  const cols = Math.max(1, Math.floor((usableW + SHEET_GAP) / (cell + SHEET_GAP)));
  const rows = Math.max(1, Math.floor((usableH + SHEET_GAP) / (cell + SHEET_GAP)));
  const perSheet = cols * rows;
  return Array.from({ length: Math.ceil(copies.length / perSheet) }, (_, s) => ({
    items: copies.slice(s * perSheet, (s + 1) * perSheet).map((c, i) => ({
      ...c,
      x: round3(SHEET_MARGIN + (i % cols) * (cell + SHEET_GAP)),
      y: round3(SHEET_MARGIN + Math.floor(i / cols) * (cell + SHEET_GAP)),
      size: cell,
      dotMm: dot,
      rotation: 0,
    })),
  }));
}

export function albumPageBox(): {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
} {
  const maxW = A4.width - SHEET_MARGIN * 2;
  const maxH = A4.height - SHEET_MARGIN * 2;
  const w = Math.min(maxW, maxH * PAGE_ASPECT);
  const h = w / PAGE_ASPECT;
  return {
    x: round3((A4.width - w) / 2),
    y: round3((A4.height - h) / 2),
    w: round3(w),
    h: round3(h),
  };
}

export function layoutAlbum(
  pages: readonly Page[],
  placements: readonly Placement[],
): readonly Sheet[] {
  const box = albumPageBox();
  return pages
    .toSorted((a, b) => a.order - b.order)
    .map((page) => ({
      items: placements
        .filter((p) => p.pageId === page.id)
        .toSorted((a, b) => a.z - b.z)
        .map((p) => {
          const dotMm = (box.w / PAGE_DOTS) * p.scale;
          const size = SIDE_DOTS * dotMm;
          return {
            key: p.id,
            stickerId: p.stickerId,
            x: round3(box.x + p.x * box.w - size / 2),
            y: round3(box.y + p.y * box.h - size / 2),
            size: round3(size),
            dotMm,
            rotation: p.rotation,
          };
        }),
    }))
    .filter((s) => s.items.length > 0);
}
