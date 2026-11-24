import type { BlockShape } from "../../core/jar-shape.ts";
import type { Sticker } from "../../core/payload.ts";
import { renderRgba, type Point } from "../../core/render.ts";

export type BlockSprite = {
  readonly canvas: HTMLCanvasElement;
  // device px of the unit square (the sticker's side) this sprite was drawn for
  readonly slab: number;
  // the sprite is centred on the unit square; the body's centre of mass is `centre` * slab away
  readonly shape: BlockShape;
};

const SHADOW_PAD = 0.2;
// slab corners are rounded by this share of the sticker's side (never more than half an edge)
const CORNER = 0.035;
// the sticker image covers this share of the unit square: 36 of the 40 cells
const ART_SHARE = 0.9;
const SLAB_CELLS = 40;
const DEPTH = 0.045;

// Polygon with rounded corners, in the sprite's pixel coordinates.
function roundedPolygonPath(ctx: CanvasRenderingContext2D, pts: readonly Point[], radius: number) {
  const n = pts.length;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const prev = pts[(i + n - 1) % n] ?? p;
    const next = pts[(i + 1) % n] ?? p;
    const lenPrev = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    const lenNext = Math.hypot(next[0] - p[0], next[1] - p[1]);
    const cut = Math.min(radius, lenPrev * 0.45, lenNext * 0.45);
    const a: Point = [
      p[0] + ((prev[0] - p[0]) / lenPrev) * cut,
      p[1] + ((prev[1] - p[1]) / lenPrev) * cut,
    ];
    const b: Point = [
      p[0] + ((next[0] - p[0]) / lenNext) * cut,
      p[1] + ((next[1] - p[1]) / lenNext) * cut,
    ];
    if (i === 0) ctx.moveTo(a[0], a[1]);
    else ctx.lineTo(a[0], a[1]);
    ctx.quadraticCurveTo(p[0], p[1], b[0], b[1]);
  });
  ctx.closePath();
}

const cornerRadius = (slab: number) => slab * CORNER;

export function silhouettePath(ctx: CanvasRenderingContext2D, shape: BlockShape, slab: number) {
  roundedPolygonPath(
    ctx,
    shape.outline.map(([x, y]): Point => [x * slab, y * slab]),
    cornerRadius(slab),
  );
}

function stickerCanvas(sticker: Sticker, cellPx: number): HTMLCanvasElement {
  const { size, rgba } = renderRgba(sticker);
  const src = document.createElement("canvas");
  src.width = size;
  src.height = size;
  src.getContext("2d")?.putImageData(new ImageData(rgba, size, size), 0, 0);
  // whole-pixel upscale first, so the final fractional resize only smooths the seams
  const big = document.createElement("canvas");
  big.width = size * cellPx;
  big.height = size * cellPx;
  const bctx = big.getContext("2d");
  if (bctx) {
    bctx.imageSmoothingEnabled = false;
    bctx.drawImage(src, 0, 0, big.width, big.height);
  }
  return big;
}

type Palette = {
  readonly shadow: string;
  readonly side: string;
  readonly body: readonly [string, string, string];
  readonly glow: string;
  readonly glowAlpha: readonly [number, number, number];
  readonly rim: readonly [string, string, string];
  readonly line: string;
  readonly gloss: number;
};

const LIGHT: Palette = {
  shadow: "rgb(10 30 50 / 0.34)",
  side: "rgb(92 150 178)",
  body: ["rgb(238 247 255 / 0.5)", "rgb(212 232 245 / 0.28)", "rgb(160 196 220 / 0.42)"],
  glow: "255 255 255",
  glowAlpha: [0.1, 0.16, 0.26],
  rim: ["rgb(255 255 255 / 1)", "rgb(255 255 255 / 0.15)", "rgb(40 80 110 / 0.5)"],
  line: "rgb(30 70 100 / 0.4)",
  gloss: 0.5,
};

const DARK: Palette = {
  shadow: "rgb(0 0 0 / 0.7)",
  side: "rgb(58 92 128)",
  body: ["rgb(205 225 250 / 0.28)", "rgb(170 195 225 / 0.12)", "rgb(120 150 190 / 0.3)"],
  glow: "210 230 255",
  glowAlpha: [0.06, 0.1, 0.17],
  rim: ["rgb(235 245 255 / 0.95)", "rgb(220 235 255 / 0.12)", "rgb(10 20 40 / 0.6)"],
  line: "rgb(190 215 245 / 0.42)",
  gloss: 0.28,
};

// One acrylic block, cut to the sticker's silhouette, drawn once: shadow, extruded side wall,
// tinted top face, the art seen slightly magnified through the top, inner glow, bevel and gloss.
// Each frame is a drawImage. `slab` is the sticker's side in device pixels.
export function makeBlockSprite(
  sticker: Sticker,
  shape: BlockShape,
  slab: number,
  dark: boolean,
): BlockSprite {
  const pad = Math.ceil(slab * SHADOW_PAD);
  const total = slab + pad * 2;
  const canvas = document.createElement("canvas");
  canvas.width = total;
  canvas.height = total;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, slab, shape };
  const pal = dark ? DARK : LIGHT;
  const edge = Math.max(1, Math.round(slab / 56));
  const depth = Math.max(2, Math.round(slab * DEPTH));
  const origin = pad + slab / 2;
  const at = (dx = 0, dy = 0) => {
    ctx.setTransform(1, 0, 0, 1, origin + dx, origin + dy);
  };
  const path = () => silhouettePath(ctx, shape, slab);

  // extrusion: the silhouette swept down and to the right, on its own canvas so overlaps do not stack
  const side = document.createElement("canvas");
  side.width = total;
  side.height = total;
  const sctx = side.getContext("2d");
  if (sctx) {
    sctx.fillStyle = pal.side;
    Array.from({ length: depth }, (_, i) => i + 1).forEach((d) => {
      sctx.setTransform(1, 0, 0, 1, origin + d * 0.5, origin + d);
      silhouettePath(sctx, shape, slab);
      sctx.fill();
    });
    sctx.setTransform(1, 0, 0, 1, origin, origin);
    sctx.globalCompositeOperation = "destination-out";
    silhouettePath(sctx, shape, slab);
    sctx.fill();
  }

  // soft shadow cast by the whole extruded block, then cut out so the acrylic stays see-through
  ctx.save();
  ctx.shadowColor = pal.shadow;
  ctx.shadowBlur = slab * 0.14;
  ctx.shadowOffsetY = slab * 0.06;
  ctx.fillStyle = "#000";
  at(depth * 0.5, depth);
  path();
  ctx.fill();
  at();
  path();
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  at(depth * 0.5, depth);
  path();
  ctx.fill();
  at();
  path();
  ctx.fill();
  ctx.restore();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = dark ? 0.62 : 0.7;
  ctx.drawImage(side, 0, 0);
  ctx.globalAlpha = 1;

  // top face tint: lighter at the upper left, denser at the lower right where the slab is thicker
  at();
  const half = slab / 2;
  const body = ctx.createLinearGradient(-half, -half, half, half);
  body.addColorStop(0, pal.body[0]);
  body.addColorStop(0.55, pal.body[1]);
  body.addColorStop(1, pal.body[2]);
  ctx.fillStyle = body;
  path();
  ctx.fill();

  // the art sits below the top surface: a faint deeper copy, then the art magnified a touch and
  // shifted toward the light, as refraction would show it
  const art = stickerCanvas(sticker, Math.max(1, Math.round(slab / SLAB_CELLS)));
  const artSize = slab * ART_SHARE;
  const grow = 1.035;
  ctx.save();
  path();
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "medium";
  ctx.globalAlpha = 0.26;
  ctx.drawImage(art, -artSize / 2 + edge, -artSize / 2 + edge * 2, artSize, artSize);
  ctx.globalAlpha = 1;
  const magnified = artSize * grow;
  ctx.drawImage(
    art,
    -magnified / 2 - edge * 0.6,
    -magnified / 2 - edge * 0.6,
    magnified,
    magnified,
  );
  ctx.restore();

  ctx.save();
  path();
  ctx.clip();

  // inner glow: light gathering near the edges, built from a few widening strokes
  [0.1, 0.06, 0.03].forEach((w, i) => {
    ctx.lineWidth = slab * w;
    ctx.strokeStyle = `rgb(${pal.glow} / ${pal.glowAlpha[i]})`;
    path();
    ctx.stroke();
  });

  // bevel: bright upper-left edge, dark lower-right edge
  ctx.lineWidth = edge * 2.4;
  const rim = ctx.createLinearGradient(-half, -half, half, half);
  rim.addColorStop(0, pal.rim[0]);
  rim.addColorStop(0.5, pal.rim[1]);
  rim.addColorStop(1, pal.rim[2]);
  ctx.strokeStyle = rim;
  path();
  ctx.stroke();

  // glossy diagonal: a broad band and a thin one across the upper left
  const band = (offset: number, width: number, alpha: number) => {
    const g = ctx.createLinearGradient(
      -half + offset,
      -half,
      -half + offset + width,
      -half + width,
    );
    g.addColorStop(0, "rgb(255 255 255 / 0)");
    g.addColorStop(0.5, `rgb(255 255 255 / ${alpha})`);
    g.addColorStop(1, "rgb(255 255 255 / 0)");
    ctx.fillStyle = g;
    ctx.fillRect(-half, -half, slab, slab);
  };
  band(slab * 0.02, slab * 0.5, pal.gloss);
  band(slab * 0.58, slab * 0.12, pal.gloss * 0.8);
  ctx.restore();

  // bright line along the top edge of the slab, then the outline
  ctx.save();
  ctx.lineWidth = edge;
  ctx.strokeStyle = "rgb(255 255 255 / 0.75)";
  ctx.translate(0, -edge * 0.5);
  path();
  ctx.stroke();
  ctx.restore();
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal.line;
  path();
  ctx.stroke();
  return { canvas, slab, shape };
}
