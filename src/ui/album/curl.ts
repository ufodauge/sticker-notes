import { fold, reach, settle, type Fold, type Pt } from "../../core/page-curl.ts";

// Draws a page being turned by its corner onto a canvas laid over the notebook: the part still
// flat, the flap folded over with the back of the page on it, and the shadows of the fold.

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
  readonly corner: Pt;
  readonly dpr: number;
};

export type Curl = {
  // the finger, in the canvas's CSS pixels
  readonly follow: (x: number, y: number) => void;
  // lets go: the corner settles over the spine (turned) or back where it was
  readonly release: (turned: boolean, done: () => void) => void;
};

function path(ctx: CanvasRenderingContext2D, poly: readonly Pt[]) {
  ctx.beginPath();
  poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

// A gradient across the fold, from the fold line `along` the given direction.
function band(
  ctx: CanvasRenderingContext2D,
  f: Fold,
  dir: 1 | -1,
  width: number,
  stops: [number, string][],
) {
  const { at, normal } = f;
  const g = ctx.createLinearGradient(
    at.x,
    at.y,
    at.x + normal.x * width * dir,
    at.y + normal.y * width * dir,
  );
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

export function startCurl(s: CurlSetup): Curl {
  const { canvas, w, h, outward, front, back, corner, dpr } = s;
  const ctx = canvas.getContext("2d");
  const state = { finger: corner, frame: 0 };

  // outward page coordinates → canvas
  const base = () => {
    ctx?.setTransform(dpr * outward, 0, 0, dpr, s.spineX * dpr, s.top * dpr);
  };
  // the page's own picture in outward coordinates: a left page is seen mirrored
  const drawSide = (img: HTMLCanvasElement, mirrored: boolean) => {
    if (!ctx) return;
    if (mirrored) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(img, 0, 0, w, h);
  };

  const draw = () => {
    state.frame = 0;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const f = fold(corner, state.finger, w, h);
    base();
    if (!f) {
      drawSide(front, outward < 0);
      return;
    }
    const lifted = Math.hypot(corner.x - state.finger.x, corner.y - state.finger.y);
    const soft = Math.min(48, lifted * 0.3) + 6;

    // the page still lying flat, darkened a little where the flap hangs over it
    if (f.flat.length > 0) {
      ctx.save();
      path(ctx, f.flat);
      ctx.clip();
      drawSide(front, outward < 0);
      base();
      ctx.fillStyle = band(ctx, f, -1, soft * 0.8, [
        [0, "rgb(0 0 0 / 0.22)"],
        [1, "rgb(0 0 0 / 0)"],
      ]);
      ctx.fillRect(-w, -h, w * 3, h * 3);
      ctx.restore();
    }

    // the flap's shadow on what lies under it, beyond the fold
    ctx.save();
    ctx.beginPath();
    ctx.rect(-w, 0, w * 2, h);
    ctx.clip();
    ctx.fillStyle = band(ctx, f, 1, soft * 1.4, [
      [0, "rgb(0 0 0 / 0.3)"],
      [1, "rgb(0 0 0 / 0)"],
    ]);
    const n = f.normal;
    ctx.beginPath();
    ctx.moveTo(f.at.x - n.y * 4 * w, f.at.y + n.x * 4 * w);
    ctx.lineTo(f.at.x + n.y * 4 * w, f.at.y - n.x * 4 * w);
    ctx.lineTo(f.at.x + n.y * 4 * w + n.x * soft * 2, f.at.y - n.x * 4 * w + n.y * soft * 2);
    ctx.lineTo(f.at.x - n.y * 4 * w + n.x * soft * 2, f.at.y + n.x * 4 * w + n.y * soft * 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // the flap: the back of the page, curving up from the fold into the light
    if (f.flap.length > 0) {
      ctx.save();
      path(ctx, f.flap);
      ctx.clip();
      const [a, b, c, d, e, ff] = f.mirror;
      ctx.transform(a, b, c, d, e, ff);
      drawSide(back, outward > 0);
      base();
      ctx.fillStyle = band(ctx, f, -1, Math.max(soft * 3, 40), [
        [0, "rgb(0 0 0 / 0.2)"],
        [0.12, "rgb(255 255 255 / 0.28)"],
        [0.45, "rgb(255 255 255 / 0.06)"],
        [1, "rgb(0 0 0 / 0.08)"],
      ]);
      ctx.fillRect(-w * 2, -h, w * 4, h * 3);
      ctx.restore();
      ctx.save();
      path(ctx, f.flap);
      ctx.strokeStyle = "rgb(0 0 0 / 0.1)";
      ctx.lineWidth = 1 / dpr;
      ctx.stroke();
      ctx.restore();
    }
  };

  const schedule = () => {
    if (!state.frame) state.frame = requestAnimationFrame(draw);
  };

  draw();
  return {
    follow: (x, y) => {
      const finger = { x: (x - s.spineX) * outward, y: y - s.top };
      state.finger = reach(corner, finger, w, h);
      schedule();
    },
    release: (turned, done) => {
      cancelAnimationFrame(state.frame);
      const from = state.finger;
      const to = turned ? { x: -corner.x, y: corner.y } : corner;
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const ms = reduced ? 1 : turned ? 680 : 340;
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        state.finger = settle(from, to, t, h);
        draw();
        if (t < 1) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    },
  };
}
