import { Bodies, Body, Composite, Constraint, Engine, Query, Sleeping } from "matter-js";
import { blockSide, initialPile } from "../../core/jar-layout.ts";
import type { BlockSprite } from "./sprite.ts";

export type JarOptions = {
  readonly canvas: HTMLCanvasElement;
  // jar interior in CSS px
  readonly width: number;
  readonly height: number;
  // device px per CSS px for the canvas backing store
  readonly pixelRatio: number;
  readonly count: number;
  // builds the sprite for block `i` at `slab` device px
  readonly sprite: (i: number, slab: number) => BlockSprite;
  // static pile: simulate offscreen, paint once, no loop, no input
  readonly still: boolean;
};

export type JarHandle = {
  readonly shake: () => void;
  readonly setTilt: (on: boolean) => void;
  readonly dispose: () => void;
};

type JarStats = { frames: number; workMs: number; worstMs: number; steps: number };

const STEP_MS = 1000 / 60;
// after a long stall (background tab, slow device) drop time instead of spiralling
const MAX_STEPS_PER_FRAME = 3;
const STILL_STEPS = 360;
const GRAVITY_SCALE = 0.0015;

export function createJar(o: JarOptions): JarHandle {
  const { canvas, width, height, pixelRatio, count } = o;
  const ctx = canvas.getContext("2d");
  const side = blockSide(count, { width, height });
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const k = canvas.width / width;
  const slab = Math.round(side * k);

  const engine = Engine.create({ enableSleeping: true });
  engine.gravity.scale = GRAVITY_SCALE;
  engine.positionIterations = 14;
  engine.velocityIterations = 6;

  const bevel = Math.min(side * 1.2, width / 4);
  const wall = (x: number, y: number, w: number, h: number, angle = 0) =>
    Bodies.rectangle(x, y, w, h, { isStatic: true, angle, friction: 0.5, restitution: 0.1 });
  const T = 200;
  const off = (T / 2) * Math.SQRT1_2;
  Composite.add(engine.world, [
    wall(width / 2, height + T / 2, width + 2 * T, T),
    wall(width / 2, -T / 2, width + 2 * T, T),
    wall(-T / 2, height / 2, T, height * 4),
    wall(width + T / 2, height / 2, T, height * 4),
    wall(bevel / 2 - off, height - bevel / 2 + off, bevel * Math.SQRT2 + T, T, Math.PI / 4),
    wall(
      width - bevel / 2 + off,
      height - bevel / 2 + off,
      bevel * Math.SQRT2 + T,
      T,
      -Math.PI / 4,
    ),
  ]);

  const pile = initialPile(count, { width, height }, side, o.still ? 0 : height * 0.3);
  const blocks = pile.map((p) =>
    Bodies.rectangle(p.x, p.y, side, side, {
      angle: p.angle,
      chamfer: { radius: side * 0.2, quality: 2 },
      restitution: 0.12,
      friction: 0.5,
      frictionStatic: 0.7,
      frictionAir: 0.012,
      slop: 0.08,
    }),
  );
  Composite.add(engine.world, blocks);
  const sprites = blocks.map((_, i) => o.sprite(i, slab));

  const paint = (): number => {
    if (!ctx) return 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const awake = blocks.reduce((n, b, i) => {
      const s = sprites[i];
      if (!s) return n;
      const c = Math.cos(b.angle);
      const sn = Math.sin(b.angle);
      ctx.setTransform(c, sn, -sn, c, b.position.x * k, b.position.y * k);
      ctx.drawImage(s.canvas, -s.canvas.width / 2, -s.canvas.height / 2);
      return b.isSleeping ? n : n + 1;
    }, 0);
    return awake;
  };

  canvas.dataset.blocks = String(count);

  if (o.still) {
    Array.from({ length: STILL_STEPS }).some(() => {
      Engine.update(engine, STEP_MS);
      return blocks.every((b) => b.isSleeping);
    });
    paint();
    canvas.dataset.state = "still";
    return { shake: () => {}, setTilt: () => {}, dispose: () => Engine.clear(engine) };
  }

  const loop = { raf: 0, last: 0, acc: 0 };
  const drag: { constraint: Constraint | null; pointerId: number } = {
    constraint: null,
    pointerId: -1,
  };
  const stats: JarStats = { frames: 0, workMs: 0, worstMs: 0, steps: 0 };
  (window as unknown as { __jarStats?: JarStats }).__jarStats = stats;
  const tilt: { abort: AbortController | null } = { abort: null };

  const frame = (now: number) => {
    const t0 = performance.now();
    const dt = loop.last === 0 ? STEP_MS : Math.min(now - loop.last, 100);
    loop.last = now;
    loop.acc += dt;
    const due = Math.min(MAX_STEPS_PER_FRAME, Math.floor(loop.acc / STEP_MS));
    loop.acc = due === MAX_STEPS_PER_FRAME ? 0 : loop.acc - due * STEP_MS;
    Array.from({ length: due }).forEach(() => Engine.update(engine, STEP_MS));
    const awake = paint();
    const work = performance.now() - t0;
    stats.frames++;
    stats.steps += due;
    stats.workMs += work;
    stats.worstMs = Math.max(stats.worstMs, work);
    if (awake > 0 || drag.constraint) {
      loop.raf = requestAnimationFrame(frame);
    } else {
      loop.raf = 0;
      loop.last = 0;
      canvas.dataset.state = "settled";
    }
  };
  const kick = () => {
    if (loop.raf !== 0) return;
    canvas.dataset.state = "moving";
    loop.raf = requestAnimationFrame(frame);
  };
  const wakeAll = () => blocks.forEach((b) => Sleeping.set(b, false));

  const input = new AbortController();
  const local = (e: PointerEvent, r: DOMRect) => ({ x: e.clientX - r.left, y: e.clientY - r.top });
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      const rect = canvas.getBoundingClientRect();
      const p = local(e, rect);
      const hit = Query.point(blocks, p).at(-1);
      if (!hit || drag.constraint) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drag.pointerId = e.pointerId;
      Sleeping.set(hit, false);
      const c = Constraint.create({
        pointA: p,
        bodyB: hit,
        pointB: { x: p.x - hit.position.x, y: p.y - hit.position.y },
        stiffness: 0.18,
        damping: 0.12,
        length: 0,
      });
      drag.constraint = c;
      Composite.add(engine.world, c);
      const stop = new AbortController();
      const release = () => {
        Composite.remove(engine.world, c);
        drag.constraint = null;
        stop.abort();
        kick();
      };
      canvas.addEventListener(
        "pointermove",
        (m) => {
          if (m.pointerId !== drag.pointerId) return;
          const next = local(m, rect);
          c.pointA = next;
        },
        { signal: stop.signal },
      );
      canvas.addEventListener("pointerup", release, { signal: stop.signal });
      canvas.addEventListener("pointercancel", release, { signal: stop.signal });
      kick();
    },
    { signal: input.signal },
  );

  const setGravity = (x: number, y: number) => {
    const g = engine.gravity;
    if (Math.abs(g.x - x) + Math.abs(g.y - y) < 0.03) return;
    g.x = x;
    g.y = y;
    wakeAll();
    kick();
  };

  const handle: JarHandle = {
    shake: () => {
      blocks.forEach((b) => {
        Sleeping.set(b, false);
        Body.setVelocity(b, {
          x: (Math.random() - 0.5) * side * 0.5,
          y: -side * (0.2 + Math.random() * 0.4),
        });
        Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.3);
      });
      kick();
    },
    setTilt: (on) => {
      tilt.abort?.abort();
      tilt.abort = null;
      if (!on) {
        setGravity(0, 1);
        return;
      }
      const a = new AbortController();
      tilt.abort = a;
      window.addEventListener(
        "deviceorientation",
        (e) => {
          if (e.gamma === null) return;
          const rad = (Math.max(-90, Math.min(90, e.gamma)) * Math.PI) / 180;
          setGravity(Math.sin(rad), Math.max(0.15, Math.cos(rad)));
        },
        { signal: a.signal },
      );
    },
    dispose: () => {
      cancelAnimationFrame(loop.raf);
      tilt.abort?.abort();
      input.abort();
      Composite.clear(engine.world, false);
      Engine.clear(engine);
    },
  };
  kick();
  return handle;
}
