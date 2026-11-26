import {
  apply,
  reach,
  roll,
  settle,
  stripMatrix,
  stripPolygon,
  type Pt,
} from "../../core/page-curl.ts";

// Paper lifted where it is gripped and rolled over toward the finger, drawn on a canvas: the part
// still lying flat, the roll (its front rising into shade, its back coming over into the light)
// and the paper beyond lying turned over, with the shadow it casts. Used for pages being turned
// and for stickers being peeled.

type Draw = (ctx: CanvasRenderingContext2D) => void;

export type RollPicture = {
  // the paper's size in its own units (the drawings below use them)
  readonly w: number;
  readonly h: number;
  readonly grip: Pt;
  readonly finger: Pt;
  readonly front: Draw;
  readonly back: Draw;
  // puts a context into the paper's own coordinates
  readonly base: (ctx: CanvasRenderingContext2D) => void;
  // how dark the shadow under the lifted paper is (0 for none)
  readonly shadow: number;
  // 1 while held; down to 0 as the paper settles flat
  readonly tightness?: number;
  // where the paper is fastened and never lifts (a page's spine)
  readonly held?: readonly Pt[];
};

function path(ctx: CanvasRenderingContext2D, poly: readonly Pt[]) {
  ctx.beginPath();
  poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

// the lifted paper is drawn here first, so that it can cast a shadow of its own shape
const layer: { canvas: HTMLCanvasElement | null } = { canvas: null };

function layerFor(target: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const c = (layer.canvas ??= document.createElement("canvas"));
  if (c.width !== target.width || c.height !== target.height) {
    c.width = target.width;
    c.height = target.height;
  }
  const ctx = c.getContext("2d");
  ctx?.setTransform(1, 0, 0, 1, 0, 0);
  ctx?.clearRect(0, 0, c.width, c.height);
  return ctx;
}

export function drawRoll(ctx: CanvasRenderingContext2D, p: RollPicture): void {
  const r = roll(p.grip, p.finger, p.w, p.h, p.tightness, p.held);
  p.base(ctx);
  if (!r) {
    p.front(ctx);
    return;
  }
  const { at, normal: n, radius } = r;
  const big = Math.max(p.w, p.h) * 4;

  // the paper still lying flat, a little darker near the roll that hangs over it (only where
  // there is paper: the shading keeps to what was drawn)
  if (r.flat.length > 0) {
    ctx.save();
    path(ctx, r.flat);
    ctx.clip();
    p.front(ctx);
    p.base(ctx);
    const g = ctx.createLinearGradient(
      at.x,
      at.y,
      at.x - n.x * radius * 2.5,
      at.y - n.y * radius * 2.5,
    );
    g.addColorStop(0, `rgb(0 0 0 / ${0.16 * p.shadow + 0.05})`);
    g.addColorStop(1, "rgb(0 0 0 / 0)");
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = g;
    ctx.fillRect(-big, -big, big * 2, big * 2);
    ctx.restore();
  }

  // the roll, on its own layer: the strips facing up first, then the ones turned over above them
  const lifted = layerFor(ctx.canvas);
  if (!lifted) return;
  const order = [...r.strips.filter((s) => !s.back), ...r.strips.filter((s) => s.back)];
  order.forEach((s) => {
    const m = stripMatrix(r, s);
    // a hair of overlap, so the strips meet without seams
    const source = stripPolygon(r, { ...s, d0: s.d0 - 0.4, d1: s.d1 + 0.4 });
    if (source.length === 0) return;
    const shown = source.map((q) => apply(m, q));
    lifted.save();
    p.base(lifted);
    path(lifted, shown);
    lifted.clip();
    lifted.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    (s.back ? p.back : p.front)(lifted);
    p.base(lifted);
    lifted.globalCompositeOperation = "source-atop";
    lifted.fillStyle = s.back
      ? s.height < 1
        ? `rgb(255 255 255 / ${0.32 * s.height})`
        : "rgb(0 0 0 / 0.03)"
      : `rgb(0 0 0 / ${0.32 * s.height})`;
    path(lifted, shown);
    lifted.fill();
    lifted.restore();
  });

  // laid on top, casting a soft shadow of its own outline onto what lies beneath
  const t = ctx.getTransform();
  const scale = Math.hypot(t.a, t.b);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.shadowColor = `rgb(0 0 0 / ${0.35 * p.shadow})`;
  ctx.shadowBlur = Math.max(2, radius * 2.2 * scale);
  ctx.shadowOffsetY = radius * 0.6 * scale;
  ctx.drawImage(lifted.canvas, 0, 0);
  ctx.restore();
}

export type CurlSetup = {
  readonly canvas: HTMLCanvasElement;
  // in the canvas's CSS pixels: where the spine is, where the page starts, and its size
  readonly spineX: number;
  readonly top: number;
  readonly w: number;
  readonly h: number;
  // +1: the right page turning left; −1: the left page turning back to the right
  readonly outward: 1 | -1;
  readonly front: HTMLCanvasElement;
  readonly back: HTMLCanvasElement;
  // where the page is held, in page coordinates measured outward from the spine
  readonly grip: Pt;
  readonly dpr: number;
};

export type Curl = {
  // the finger, in the canvas's CSS pixels
  readonly follow: (x: number, y: number) => void;
  // lets go: the page goes over the spine (turned) or back where it was
  readonly release: (turned: boolean, done: () => void) => void;
};

// let go, a page goes over this quickly (or falls back where it was)
const TURN_MS = 440;
const BACK_MS = 240;

export function startCurl(s: CurlSetup): Curl {
  const { canvas, w, h, outward, front, back, grip, dpr } = s;
  const ctx = canvas.getContext("2d");
  const state = { finger: grip, frame: 0, tightness: 1 };
  const spine = [
    { x: 0, y: 0 },
    { x: 0, y: h },
  ];

  const base = (c: CanvasRenderingContext2D) => {
    c.setTransform(dpr * outward, 0, 0, dpr, s.spineX * dpr, s.top * dpr);
  };
  // a page's own picture in outward coordinates: a left page is seen mirrored
  const side = (img: HTMLCanvasElement, mirrored: boolean) => (c: CanvasRenderingContext2D) => {
    if (mirrored) {
      c.translate(w, 0);
      c.scale(-1, 1);
    }
    c.drawImage(img, 0, 0, w, h);
  };

  const draw = () => {
    state.frame = 0;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRoll(ctx, {
      w,
      h,
      grip,
      finger: state.finger,
      front: side(front, outward < 0),
      back: side(back, outward > 0),
      base,
      shadow: state.tightness,
      tightness: state.tightness,
      held: spine,
    });
  };

  draw();
  return {
    follow: (x, y) => {
      const finger = { x: (x - s.spineX) * outward, y: y - s.top };
      state.finger = reach(grip, finger, w, h);
      if (!state.frame) state.frame = requestAnimationFrame(draw);
    },
    release: (turned, done) => {
      cancelAnimationFrame(state.frame);
      const from = state.finger;
      const to = turned ? { x: -grip.x, y: grip.y } : grip;
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const ms = reduced ? 1 : turned ? TURN_MS : BACK_MS;
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        // the arc stays within the page's reach, so the spine never lifts on the way
        state.finger = reach(grip, settle(from, to, t, h), w, h);
        // gone over, the page comes down flat on the other side
        if (turned) state.tightness = 1 - t ** 3;
        draw();
        if (t < 1) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    },
  };
}
