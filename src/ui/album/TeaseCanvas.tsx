import type { Pt } from "../../core/page-curl.ts";
import type { Sticker } from "../../core/payload.ts";
import { teaseGrip } from "../../core/tease-grip.ts";
import { drawRoll } from "./curl.ts";
import { stickerBack, stickerCanvas } from "./page-paint.ts";
import styles from "./PageCanvas.module.css";

// A sticker not quite pressed down: now and then one edge curls up, showing its white back, and
// lies down again. Drawn by the same roll as a real peel (curl.ts), in the sticker's own box (the
// placed element is already moved and turned), with room around it for the roll and its shadow.
// A marker (`[data-tease-grip]`) sits where the edge lifts, turned with the sticker, for the
// tutorial's finger.

const PERIOD = 2600;
// how far in the edge rolls: a share of the way from the edge to the middle (the art's own
// outline, not its box, which has room around the shape), and at least this many CSS pixels
const REACH = 0.4;
const REACH_MIN = 7;
// room around the sticker's box for the roll and its shadow, in sticker sizes
const MARGIN = 0.3;

// 0 lying flat .. 1 curled up, over one period of 2.6s: rest, lift (450ms), hold (400ms), lie
// down (300ms), a small spring back up and down (250ms) as paper does, rest
const PHASES: readonly (readonly [end: number, at: (x: number) => number])[] = [
  [600, () => 0],
  [1050, (x) => 1 - (1 - x) ** 3],
  [1450, () => 1],
  [1750, (x) => 1 - x ** 3],
  [2000, (x) => 0.4 * Math.sin(x * Math.PI)],
  [PERIOD, () => 0],
];

function lift(ms: number): number {
  const i = PHASES.findIndex(([end]) => ms < end);
  const phase = PHASES[i];
  if (!phase) return 0;
  const begin = PHASES[i - 1]?.[0] ?? 0;
  return phase[1]((ms - begin) / (phase[0] - begin));
}

function gripOf(art: HTMLCanvasElement): Pt {
  const n = art.width;
  const data = art.getContext("2d")?.getImageData(0, 0, n, n).data ?? new Uint8ClampedArray(0);
  return teaseGrip(
    Array.from({ length: n * n }, (_, i) => data[i * 4 + 3] ?? 0),
    n,
  );
}

// Sets the canvas up for a sticker of `size` CSS pixels and returns how to draw it k curled up.
function setUp(box: HTMLElement, canvas: HTMLCanvasElement, sticker: Sticker, size: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const front = stickerCanvas(sticker);
  const back = stickerBack(sticker);
  const px = size / front.width;
  const g = gripOf(front);
  // the middle of the grip's pixel
  const grip = { x: (g.x + 0.5) * px, y: (g.y + 0.5) * px };
  box.style.setProperty("--gx", `${grip.x}px`);
  box.style.setProperty("--gy", `${grip.y}px`);
  const inward = { x: size / 2 - grip.x, y: size / 2 - grip.y };
  const len = Math.hypot(inward.x, inward.y) || 1;
  const margin = size * MARGIN;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const side = size + margin * 2;
  canvas.width = Math.round(side * dpr);
  canvas.height = Math.round(side * dpr);
  box.style.setProperty("--m", `${-margin}px`);
  box.style.setProperty("--box", `${side}px`);
  const picture = (img: HTMLCanvasElement) => (c: CanvasRenderingContext2D) => {
    c.imageSmoothingEnabled = false;
    c.drawImage(img, 0, 0, size, size);
  };
  return (k: number) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const d = Math.max(REACH * len, REACH_MIN) * k;
    drawRoll(ctx, {
      w: size,
      h: size,
      grip,
      finger: { x: grip.x + (inward.x / len) * d, y: grip.y + (inward.y / len) * d },
      front: picture(front),
      back: picture(back),
      base: (c) => c.setTransform(dpr, 0, 0, dpr, dpr * margin, dpr * margin),
      shadow: 0.35,
    });
  };
}

export function TeaseCanvas({ sticker }: { readonly sticker: Sticker }) {
  const start = (box: HTMLElement | null) => {
    const canvas = box?.querySelector("canvas");
    const grab = box?.parentElement;
    if (!box || !canvas || !grab) return undefined;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const run = { draw: null as ((k: number) => void) | null, size: 0, last: -1, frame: 0 };
    // set up again whenever the sticker's size changes (a turned phone, a resized window), and
    // once it has a size at all
    const resized = () => {
      const size = grab.offsetWidth;
      if (size === 0 || size === run.size) return;
      run.size = size;
      run.draw = setUp(box, canvas, sticker, size);
      run.last = -1;
      if (reduce) run.draw?.(0.5);
    };
    const watch = new ResizeObserver(resized);
    watch.observe(grab);
    resized();
    const began = performance.now();
    const tick = (now: number) => {
      const k = lift((now - began) % PERIOD);
      // lying flat stays drawn: nothing to do until it lifts again
      if (run.draw && !(k === 0 && run.last === 0)) run.draw(k);
      run.last = run.draw ? k : -1;
      run.frame = requestAnimationFrame(tick);
    };
    if (!reduce) run.frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(run.frame);
      watch.disconnect();
    };
  };
  return (
    <span ref={start} className={styles.tease} aria-hidden="true">
      <canvas />
      <span className={styles.teaseGrip} data-tease-grip="" />
    </span>
  );
}
