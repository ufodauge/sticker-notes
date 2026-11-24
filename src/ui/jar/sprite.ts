import type { Sticker } from "../../core/payload.ts";
import { renderRgba } from "../../core/render.ts";

export type BlockSprite = {
  readonly canvas: HTMLCanvasElement;
  // distance from the sprite edge to the slab edge (room for the baked shadow)
  readonly pad: number;
};

const SHADOW_PAD = 0.2;

// Art size in device px: an integer multiple of 32 once it fits, otherwise the nearest size.
function artSize(slab: number): number {
  const target = slab * 0.7;
  return target >= 32 ? Math.floor(target / 32) * 32 : Math.max(8, Math.round(target));
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, s, s, r);
}

// One acrylic slab (shadow, body, bevel, art, highlights) drawn once; each frame is a drawImage.
// `slab` is in device pixels.
export function makeBlockSprite(sticker: Sticker, slab: number): BlockSprite {
  const pad = Math.ceil(slab * SHADOW_PAD);
  const total = slab + pad * 2;
  const canvas = document.createElement("canvas");
  canvas.width = total;
  canvas.height = total;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, pad };
  const radius = slab * 0.2;
  const edge = Math.max(1, Math.round(slab / 28));

  // soft shadow: cast from an opaque slab, then cut the slab out so the acrylic stays see-through
  ctx.save();
  ctx.shadowColor = "rgb(0 0 0 / 0.38)";
  ctx.shadowBlur = slab * 0.16;
  ctx.shadowOffsetY = slab * 0.07;
  ctx.fillStyle = "#000";
  roundRectPath(ctx, pad, pad, slab, radius);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  roundRectPath(ctx, pad, pad, slab, radius);
  ctx.fill();
  ctx.restore();

  // body: faint cool tint, denser toward the lower edge where the glass is thicker
  const body = ctx.createLinearGradient(pad, pad, pad + slab, pad + slab);
  body.addColorStop(0, "rgb(235 245 255 / 0.55)");
  body.addColorStop(0.55, "rgb(205 225 240 / 0.38)");
  body.addColorStop(1, "rgb(150 180 205 / 0.5)");
  ctx.fillStyle = body;
  roundRectPath(ctx, pad, pad, slab, radius);
  ctx.fill();

  // the art floats slightly inside the slab, with a hair of offset for depth
  const art = artSize(slab);
  const { size, rgba } = renderRgba(sticker);
  const src = document.createElement("canvas");
  src.width = size;
  src.height = size;
  src.getContext("2d")?.putImageData(new ImageData(rgba, size, size), 0, 0);
  const ax = Math.round(pad + (slab - art) / 2);
  const ay = Math.round(pad + (slab - art) / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.28;
  ctx.drawImage(src, ax + edge, ay + edge * 2, art, art);
  ctx.globalAlpha = 1;
  ctx.drawImage(src, ax, ay, art, art);

  // inner bevel: lit upper-left edge, dark lower-right edge
  ctx.save();
  roundRectPath(ctx, pad, pad, slab, radius);
  ctx.clip();
  ctx.lineWidth = edge * 2;
  const rim = ctx.createLinearGradient(pad, pad, pad + slab, pad + slab);
  rim.addColorStop(0, "rgb(255 255 255 / 0.95)");
  rim.addColorStop(0.5, "rgb(255 255 255 / 0.18)");
  rim.addColorStop(1, "rgb(40 70 100 / 0.55)");
  ctx.strokeStyle = rim;
  roundRectPath(ctx, pad, pad, slab, radius);
  ctx.stroke();

  // faint reflection: a diagonal band across the upper half
  ctx.fillStyle = "rgb(255 255 255 / 0.2)";
  ctx.beginPath();
  ctx.moveTo(pad, pad + slab * 0.1);
  ctx.lineTo(pad + slab * 0.62, pad);
  ctx.lineTo(pad + slab * 0.38, pad);
  ctx.lineTo(pad, pad + slab * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = "rgb(30 60 90 / 0.35)";
  ctx.lineWidth = 1;
  roundRectPath(ctx, pad + 0.5, pad + 0.5, slab - 1, radius);
  ctx.stroke();
  return { canvas, pad };
}
