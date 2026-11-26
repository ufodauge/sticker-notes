import { peelPull, type Pt } from "../../core/page-curl.ts";
import type { Sticker } from "../../core/payload.ts";
import { carry } from "./carry.ts";
import { drawRoll } from "./curl.ts";
import { stickerBack, stickerCanvas } from "./page-paint.ts";

// A sticker being peeled, drawn rolled up on the window-wide canvas: the edge under the finger
// lifts and rolls back over the sticker toward where the finger goes, showing its white back,
// while the rest still lies stuck.

export type PeelView = {
  // the finger on screen; how far it has been peeled, in sticker sizes
  readonly show: (finger: Pt) => number;
  // the way the sticker rolled, on screen (a unit vector from the finger back to where it held)
  readonly direction: () => Pt;
  // let go before it came off: it rolls back down flat, then calls `done`
  readonly settleBack: (done: () => void) => void;
  readonly clear: () => void;
};

export function startPeel(
  sticker: Sticker,
  centre: Pt,
  size: number,
  rotationDeg: number,
  grip: Pt,
): PeelView | undefined {
  const canvas = carry.peelCanvas();
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return undefined;
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  const a = (rotationDeg * Math.PI) / 180;
  const [cos, sin] = [Math.cos(a), Math.sin(a)];
  const local = (p: Pt): Pt => {
    const dx = p.x - centre.x;
    const dy = p.y - centre.y;
    return { x: dx * cos + dy * sin + size / 2, y: -dx * sin + dy * cos + size / 2 };
  };
  const held = local(grip);
  const state = { finger: held, frame: 0 };
  const base = (c: CanvasRenderingContext2D) => {
    c.setTransform(dpr * cos, dpr * sin, -dpr * sin, dpr * cos, dpr * centre.x, dpr * centre.y);
    c.translate(-size / 2, -size / 2);
  };
  const picture = (img: HTMLCanvasElement) => (c: CanvasRenderingContext2D) => {
    c.imageSmoothingEnabled = false;
    c.drawImage(img, 0, 0, size, size);
  };
  const draw = () => {
    state.frame = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRoll(ctx, {
      w: size,
      h: size,
      grip: held,
      finger: state.finger,
      front: picture(stickerCanvas(sticker)),
      back: picture(stickerBack(sticker)),
      base,
      shadow: 0.45,
    });
  };
  const clear = () => {
    cancelAnimationFrame(state.frame);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  draw();
  return {
    show: (finger) => {
      const pull = peelPull(held, local(finger), size);
      state.finger = pull.finger;
      if (!state.frame) state.frame = requestAnimationFrame(draw);
      return pull.peeled;
    },
    direction: () => {
      const dx = held.x - state.finger.x;
      const dy = held.y - state.finger.y;
      const l = Math.hypot(dx, dy) || 1;
      return { x: (dx * cos - dy * sin) / l, y: (dx * sin + dy * cos) / l };
    },
    settleBack: (done) => {
      cancelAnimationFrame(state.frame);
      const from = state.finger;
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const ms = reduced ? 1 : 220;
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        const e = 1 - (1 - t) ** 3;
        state.finger = { x: from.x + (held.x - from.x) * e, y: from.y + (held.y - from.y) * e };
        draw();
        if (t < 1) requestAnimationFrame(step);
        else {
          clear();
          done();
        }
      };
      requestAnimationFrame(step);
    },
    clear,
  };
}
