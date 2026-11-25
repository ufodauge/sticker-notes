import type { Placement } from "../../core/album.ts";
import type { Sticker } from "../../core/payload.ts";
import { renderRgba } from "../../core/render.ts";

// A page drawn onto a canvas, the way the album shows it: the squared paper, the shade at the
// spine and the stickers. Only while a page is being turned, so it can bend like paper.

export type FaceArt =
  | {
      readonly kind: "page";
      // which half of the spread this side shows
      readonly half: 0 | 1;
      readonly placements: readonly Placement[];
      readonly stickers: ReadonlyMap<string, Sticker>;
    }
  | { readonly kind: "new" }
  | { readonly kind: "blank" };

const SHEET = "#ffffff";
const SHEET_LINE = "#ececec";
const SHEET_EDGE = "#d6d6d6";
const INK_SOFT = "#6b6b6b";

const art = new Map<Sticker, HTMLCanvasElement>();

export function stickerCanvas(s: Sticker): HTMLCanvasElement {
  const known = art.get(s);
  if (known) return known;
  const { size, rgba } = renderRgba(s);
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  c.getContext("2d")?.putImageData(new ImageData(rgba, size, size), 0, 0);
  art.set(s, c);
  return c;
}

const backs = new Map<Sticker, HTMLCanvasElement>();

// The sticker's back: its own outline in the white of the release side, no picture.
export function stickerBack(s: Sticker): HTMLCanvasElement {
  const known = backs.get(s);
  if (known) return known;
  const { size, rgba } = renderRgba(s);
  const back = Uint8ClampedArray.from(rgba, (v, i) => (i % 4 === 3 ? (v > 0 ? 255 : 0) : 238));
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  c.getContext("2d")?.putImageData(new ImageData(back, size, size), 0, 0);
  backs.set(s, c);
  return c;
}

function paper(ctx: CanvasRenderingContext2D, w: number, h: number, spine: "left" | "right") {
  ctx.fillStyle = SHEET;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = SHEET_LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  Array.from({ length: 20 }, (_, i) => (i * w) / 20).forEach((x) => {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, h);
  });
  Array.from({ length: 27 }, (_, i) => i * h * 0.0375).forEach((y) => {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(w, Math.round(y) + 0.5);
  });
  ctx.stroke();
  ctx.strokeStyle = SHEET_EDGE;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  const shade = w * 0.12;
  const from = spine === "left" ? 0 : w;
  const g = ctx.createLinearGradient(from, 0, spine === "left" ? shade : w - shade, 0);
  g.addColorStop(0, "rgb(0 0 0 / 0.13)");
  g.addColorStop(1, "rgb(0 0 0 / 0)");
  ctx.fillStyle = g;
  ctx.fillRect(spine === "left" ? 0 : w - shade, 0, shade, h);
}

// dimmed as the album is with the lights out
const DUSK = "rgb(10 14 32 / 0.62)";

export function paintFace(
  face: FaceArt,
  w: number,
  h: number,
  dpr: number,
  spine: "left" | "right",
  dark: boolean,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.scale(dpr, dpr);
  paper(ctx, w, h, spine);
  if (face.kind === "new") {
    ctx.strokeStyle = INK_SOFT;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 14, h / 2);
    ctx.lineTo(w / 2 + 14, h / 2);
    ctx.moveTo(w / 2, h / 2 - 14);
    ctx.lineTo(w / 2, h / 2 + 14);
    ctx.stroke();
  }
  if (face.kind !== "page") return dim(ctx, w, h, dark, c);
  ctx.imageSmoothingEnabled = false;
  face.placements
    .toSorted((a, b) => a.z - b.z)
    .forEach((p) => {
      const s = face.stickers.get(p.stickerId);
      if (!s) return;
      const size = (w / 300) * 36 * p.scale;
      ctx.save();
      ctx.translate((p.x * 2 - face.half) * w, p.y * h);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.shadowColor = "rgb(0 0 0 / 0.25)";
      ctx.shadowBlur = 1.5;
      ctx.shadowOffsetY = 1;
      ctx.drawImage(stickerCanvas(s), -size / 2, -size / 2, size, size);
      ctx.restore();
    });
  return dim(ctx, w, h, dark, c);
}

function dim(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  dark: boolean,
  c: HTMLCanvasElement,
): HTMLCanvasElement {
  if (dark) {
    ctx.fillStyle = DUSK;
    ctx.fillRect(0, 0, w, h);
  }
  return c;
}
