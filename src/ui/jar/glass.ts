import type { JarGeometry } from "../../core/jar-geometry.ts";
import type { Point } from "../../core/render.ts";

export type GlassLayers = {
  // behind the blocks: contact shadow, tinted cavity, depth, the far side of the rim
  readonly back: HTMLCanvasElement;
  // in front of the blocks: glass walls and base, reflections, the near side of the rim
  readonly front: HTMLCanvasElement;
};

type Tone = {
  readonly tint: string; // rgb triple of the glass body
  readonly edge: string; // rgb triple of the dark outline
  readonly shade: string; // rgb triple of shadows and depth
  readonly wall: number; // tint alpha of the wall ring
  readonly cavity: number; // tint alpha at the bottom of the cavity
  readonly glow: number; // multiplier for white highlights
  readonly edgeAlpha: number;
  readonly shadow: number;
};

const LIGHT: Tone = {
  tint: "96 165 182",
  edge: "30 70 90",
  shade: "20 50 70",
  wall: 0.3,
  cavity: 0.13,
  glow: 1,
  edgeAlpha: 0.42,
  shadow: 0.34,
};

const DARK: Tone = {
  tint: "140 195 225",
  edge: "205 230 250",
  shade: "0 0 0",
  wall: 0.2,
  cavity: 0.09,
  glow: 0.8,
  edgeAlpha: 0.38,
  shadow: 0.7,
};

const rgba = (rgb: string, a: number) => `rgb(${rgb} / ${Math.min(1, Math.max(0, a))})`;

function tracePath(ctx: CanvasRenderingContext2D, pts: readonly Point[]) {
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
}

function closedPath(ctx: CanvasRenderingContext2D, pts: readonly Point[]) {
  ctx.beginPath();
  tracePath(ctx, pts);
  ctx.closePath();
}

function ringPath(ctx: CanvasRenderingContext2D, geo: JarGeometry) {
  ctx.beginPath();
  tracePath(ctx, geo.outer);
  ctx.closePath();
  tracePath(ctx, geo.inner);
  ctx.closePath();
}

// The mouth seen from a little above: an ellipse, split into its far (back) and near (front) arcs.
function rimEllipse(geo: JarGeometry) {
  const { rim } = geo;
  const lineWidth = rim.y1 - rim.y0;
  const rx = (rim.x1 - rim.x0) / 2 - lineWidth * 0.3;
  return { cx: geo.width / 2, cy: rim.y0 + lineWidth / 2, rx, ry: rx * 0.07, lineWidth };
}

function rimArc(ctx: CanvasRenderingContext2D, geo: JarGeometry, near: boolean, grow = 0) {
  const e = rimEllipse(geo);
  ctx.beginPath();
  ctx.ellipse(
    e.cx,
    e.cy,
    e.rx + grow,
    e.ry + grow * 0.07,
    0,
    near ? 0 : Math.PI,
    near ? Math.PI : Math.PI * 2,
  );
}

function layer(canvas: HTMLCanvasElement, geo: JarGeometry, k: number) {
  canvas.width = Math.round(geo.width * k);
  canvas.height = Math.round(geo.height * k);
  const ctx = canvas.getContext("2d");
  ctx?.scale(k, k);
  return ctx;
}

function drawBack(ctx: CanvasRenderingContext2D, geo: JarGeometry, tone: Tone) {
  const { width, wall, bottomY, bodyX0, bodyX1 } = geo;
  const bodyW = bodyX1 - bodyX0;
  const cx = width / 2;

  // contact shadow and a pale caustic on the surface under the base
  const rx = bodyW * 0.5;
  const ry = wall * 1.5;
  ctx.save();
  ctx.translate(cx, bottomY + ry * 0.25);
  ctx.scale(1, ry / rx);
  const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  shadow.addColorStop(0, rgba(tone.shade, tone.shadow));
  shadow.addColorStop(0.55, rgba(tone.shade, tone.shadow * 0.45));
  shadow.addColorStop(1, rgba(tone.shade, 0));
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(cx, bottomY + ry * 0.9);
  ctx.scale(1, (ry * 0.9) / (rx * 0.62));
  const caustic = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 0.62);
  caustic.addColorStop(0, rgba(tone.tint, 0.2 * tone.glow));
  caustic.addColorStop(1, rgba(tone.tint, 0));
  ctx.fillStyle = caustic;
  ctx.beginPath();
  ctx.arc(0, 0, rx * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // the cavity: a faint tint that deepens toward the base, darker where the walls turn away
  ctx.save();
  closedPath(ctx, geo.inner);
  ctx.clip();
  const body = ctx.createLinearGradient(0, geo.rim.y1, 0, geo.floorY);
  body.addColorStop(0, rgba(tone.tint, tone.cavity * 0.25));
  body.addColorStop(1, rgba(tone.tint, tone.cavity));
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, width, geo.height);
  const depth = wall * 3.2;
  const left = ctx.createLinearGradient(geo.mouth.x0 - wall, 0, geo.bodyX0 + wall + depth, 0);
  left.addColorStop(0, rgba(tone.shade, 0.2));
  left.addColorStop(1, rgba(tone.shade, 0));
  const right = ctx.createLinearGradient(geo.bodyX1 - wall, 0, geo.bodyX1 - wall - depth, 0);
  right.addColorStop(0, rgba(tone.shade, 0.2));
  right.addColorStop(1, rgba(tone.shade, 0));
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, width / 2, geo.height);
  ctx.fillStyle = right;
  ctx.fillRect(width / 2, 0, width / 2, geo.height);
  const floor = ctx.createLinearGradient(0, geo.floorY - wall * 5, 0, geo.floorY);
  floor.addColorStop(0, rgba(tone.shade, 0));
  floor.addColorStop(1, rgba(tone.shade, 0.16));
  ctx.fillStyle = floor;
  ctx.fillRect(0, geo.floorY - wall * 5, width, wall * 5);
  ctx.restore();

  // far side of the rim
  const e = rimEllipse(geo);
  rimArc(ctx, geo, false);
  ctx.lineWidth = e.lineWidth;
  ctx.strokeStyle = rgba(tone.tint, tone.wall * 0.9);
  ctx.stroke();
  rimArc(ctx, geo, false, -e.lineWidth * 0.5);
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(tone.edge, tone.edgeAlpha * 0.7);
  ctx.stroke();
  rimArc(ctx, geo, false, e.lineWidth * 0.5);
  ctx.strokeStyle = rgba("255 255 255", 0.5 * tone.glow);
  ctx.stroke();
}

function drawFront(ctx: CanvasRenderingContext2D, geo: JarGeometry, tone: Tone) {
  const { width, wall, bodyX0, bodyX1, shoulderEndY, bodyEndY } = geo;
  const bodyW = bodyX1 - bodyX0;
  const white = (a: number) => rgba("255 255 255", a * tone.glow);

  // glass walls and base: a tinted ring, brighter toward both of its edges
  ctx.save();
  ringPath(ctx, geo);
  ctx.clip("evenodd");
  ctx.fillStyle = rgba(tone.tint, tone.wall);
  ctx.fillRect(0, 0, width, geo.height);
  const passes = [
    { w: wall * 1.6, a: 0.1 },
    { w: wall * 1.1, a: 0.18 },
    { w: wall * 0.6, a: 0.28 },
  ];
  passes.forEach(({ w, a }) => {
    closedPath(ctx, geo.outer);
    ctx.lineWidth = w;
    ctx.strokeStyle = white(a);
    ctx.stroke();
  });
  // inner surface of the glass catches a little less light
  closedPath(ctx, geo.inner);
  ctx.lineWidth = wall * 0.9;
  ctx.strokeStyle = white(0.12);
  ctx.stroke();
  // the base is thick glass: a denser band along the floor
  const base = ctx.createLinearGradient(0, geo.floorY, 0, geo.bottomY);
  base.addColorStop(0, rgba(tone.tint, 0.1));
  base.addColorStop(1, rgba(tone.shade, 0.22));
  ctx.fillStyle = base;
  ctx.fillRect(0, geo.floorY, width, geo.bottomY - geo.floorY + 1);
  ctx.restore();

  // thin veil of the front glass over the blocks, brighter near the edges
  ctx.save();
  closedPath(ctx, geo.inner);
  ctx.clip();
  const reach = wall * 2.6;
  const fresnelL = ctx.createLinearGradient(geo.bodyX0 + wall, 0, geo.bodyX0 + wall + reach, 0);
  fresnelL.addColorStop(0, white(0.2));
  fresnelL.addColorStop(1, white(0));
  const fresnelR = ctx.createLinearGradient(geo.bodyX1 - wall, 0, geo.bodyX1 - wall - reach, 0);
  fresnelR.addColorStop(0, white(0.14));
  fresnelR.addColorStop(1, white(0));
  ctx.fillStyle = fresnelL;
  ctx.fillRect(0, 0, width / 2, geo.height);
  ctx.fillStyle = fresnelR;
  ctx.fillRect(width / 2, 0, width / 2, geo.height);
  const veil = ctx.createLinearGradient(0, geo.rim.y1, 0, geo.floorY);
  veil.addColorStop(0, white(0.07));
  veil.addColorStop(0.5, white(0.02));
  veil.addColorStop(1, white(0.06));
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, width, geo.height);

  // soft reflections: a window-like band and a long streak on the left, a thin rim light on the right
  const streakTop = shoulderEndY + wall;
  const streakBottom = bodyEndY - bodyW * 0.02;
  const streak = (x: number, w: number, a: number, y0 = streakTop, y1 = streakBottom) => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, white(0));
    g.addColorStop(0.12, white(a));
    g.addColorStop(0.7, white(a * 0.7));
    g.addColorStop(1, white(0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, y0, w, y1 - y0, w / 2);
    ctx.fill();
  };
  const sx = bodyX0 + wall + bodyW * 0.05;
  streak(sx - bodyW * 0.02, bodyW * 0.1, 0.08);
  streak(sx, bodyW * 0.035, 0.5);
  streak(
    sx + bodyW * 0.05,
    bodyW * 0.012,
    0.35,
    streakTop + bodyW * 0.1,
    streakBottom - bodyW * 0.15,
  );
  streak(
    bodyX1 - wall - bodyW * 0.07,
    bodyW * 0.016,
    0.3,
    streakTop + bodyW * 0.05,
    streakBottom - bodyW * 0.05,
  );
  ctx.restore();

  // highlight along the shoulder and a crescent on the base
  const shoulder = geo.outer.filter(
    ([x, y]) => x < width / 2 && y > geo.rim.y1 && y < shoulderEndY,
  );
  const side = (pts: readonly Point[], dx: number): Point[] => pts.map(([x, y]) => [x + dx, y]);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1.5, wall * 0.28);
  ctx.strokeStyle = white(0.7);
  ctx.beginPath();
  tracePath(ctx, side(shoulder, wall * 0.45));
  ctx.stroke();
  const crescent = geo.inner.filter(([, y]) => y > bodyEndY);
  const bottom = ctx.createLinearGradient(bodyX0, 0, bodyX1, 0);
  bottom.addColorStop(0.1, white(0));
  bottom.addColorStop(0.3, white(0.75));
  bottom.addColorStop(0.5, white(0.1));
  bottom.addColorStop(0.78, white(0.4));
  bottom.addColorStop(0.92, white(0));
  ctx.strokeStyle = bottom;
  ctx.lineWidth = Math.max(1.5, wall * 0.22);
  ctx.beginPath();
  tracePath(
    ctx,
    side(crescent, 0).map(([x, y]): Point => [x, y - wall * 0.1]),
  );
  ctx.stroke();
  ctx.restore();

  // outlines: outer silhouette and the inner glass surface
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  ctx.strokeStyle = rgba(tone.edge, tone.edgeAlpha);
  closedPath(ctx, geo.outer);
  ctx.stroke();
  ctx.strokeStyle = rgba(tone.edge, tone.edgeAlpha * 0.55);
  ctx.beginPath();
  tracePath(ctx, geo.inner);
  ctx.stroke();

  // near side of the rim
  const e = rimEllipse(geo);
  rimArc(ctx, geo, true);
  ctx.lineWidth = e.lineWidth;
  ctx.strokeStyle = rgba(tone.tint, tone.wall * 1.2);
  ctx.stroke();
  rimArc(ctx, geo, true);
  ctx.lineWidth = e.lineWidth * 0.55;
  ctx.strokeStyle = white(0.22);
  ctx.stroke();
  rimArc(ctx, geo, true, e.lineWidth * 0.5);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = white(0.85);
  ctx.stroke();
  rimArc(ctx, geo, true, e.lineWidth * 0.5 + 1);
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(tone.edge, tone.edgeAlpha);
  ctx.stroke();
  rimArc(ctx, geo, true, -e.lineWidth * 0.5);
  ctx.strokeStyle = rgba(tone.edge, tone.edgeAlpha * 0.6);
  ctx.stroke();
  // sparkle where the lip catches the light
  const px = e.cx - e.rx * 0.62;
  const py = e.cy + e.ry * 0.78;
  const spark = ctx.createRadialGradient(px, py, 0, px, py, wall * 0.9);
  spark.addColorStop(0, white(0.95));
  spark.addColorStop(1, white(0));
  ctx.fillStyle = spark;
  ctx.fillRect(px - wall, py - wall, wall * 2, wall * 2);
}

// Both layers are drawn once per size and theme into their own canvases, stacked behind and in
// front of the block canvas, so a frame costs nothing for the glass.
export function drawGlass(geo: JarGeometry, k: number, dark: boolean, layers: GlassLayers) {
  const tone = dark ? DARK : LIGHT;
  const back = layer(layers.back, geo, k);
  const front = layer(layers.front, geo, k);
  if (back) drawBack(back, geo, tone);
  if (front) drawFront(front, geo, tone);
}
