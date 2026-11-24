import { Bodies, Body, Composite, Constraint, Engine, Events, Query, Sleeping } from "matter-js";
import { blockSide, dropPose, fitSide, initialPile, rescalePose } from "../../core/jar-layout.ts";
import {
  INITIAL_QUALITY,
  JAR_QUALITY_TIERS,
  nextQuality,
  qualityOf,
  type JarQuality,
  type QualityState,
} from "../../core/jar-quality.ts";
import type { Sticker } from "../../core/payload.ts";
import { publishProbe } from "./probe.ts";
import { makeBlockSprite, type BlockSprite } from "./sprite.ts";

type JarBlock = { readonly id: string; readonly sticker: Sticker };

export type JarOptions = {
  readonly canvas: HTMLCanvasElement;
  // jar interior in CSS px
  readonly width: number;
  readonly height: number;
  readonly blocks: readonly JarBlock[];
  // static pile: simulate offscreen, paint once, no loop, no dragging
  readonly still: boolean;
  readonly selected: () => string | null;
  readonly onSelect: (id: string | null) => void;
};

export type JarHandle = {
  readonly shake: () => void;
  readonly setTilt: (on: boolean) => void;
  readonly setBlocks: (blocks: readonly JarBlock[]) => void;
  readonly resize: (width: number, height: number) => void;
  readonly repaint: () => void;
  readonly dispose: () => void;
};

type Entry = {
  readonly id: string;
  readonly sticker: Sticker;
  body: Body | null;
  sprite: BlockSprite | null;
  stale: boolean;
};

type Ghost = {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly sprite: BlockSprite;
  readonly born: number;
};

const FALLBACK_STEP_MS = 1000 / 60;
// after a long stall (background tab, slow device) drop time instead of spiralling
const MAX_STEPS_PER_FRAME = 3;
const STILL_STEPS = 360;
const GRAVITY_SCALE = 0.0015;
const SPRITE_BUDGET_MS = 5;
const MAX_SPAWNS_PER_FRAME = 4;
const VANISH_MS = 240;
const TAP_SLOP_PX = 8;
const TAP_MAX_MS = 600;
const HAPTIC_WINDOW_MS = 1500;
const HAPTIC_GAP_MS = 120;
const HAPTIC_MS = 8;
const HAPTIC_SPEED_PER_SIDE = 0.3;

export function createJar(o: JarOptions): JarHandle {
  const { canvas, still } = o;
  const ctx = canvas.getContext("2d");
  const dpr = () => window.devicePixelRatio || 1;
  const darkQuery = matchMedia("(prefers-color-scheme: dark)");

  const st = {
    width: o.width,
    height: o.height,
    side: blockSide(o.blocks.length, o),
    k: 1,
    slab: 1,
    dark: darkQuery.matches,
    ringColor: "",
    slot: 0,
    awake: 0,
    entries: new Map<string, Entry>(),
    walls: [] as Body[],
    ghosts: [] as Ghost[],
    quality: INITIAL_QUALITY as QualityState,
    pinned: null as number | null,
    hapticUntil: 0,
    lastHaptic: 0,
    loop: { raf: 0, last: 0, acc: 0 },
    drag: null as Constraint | null,
    tilt: null as AbortController | null,
  };
  const stats = { frames: 0, workMs: 0, worstMs: 0, steps: 0 };

  const engine = Engine.create({ enableSleeping: true });
  engine.gravity.scale = GRAVITY_SCALE;
  engine.positionIterations = 14;
  engine.velocityIterations = 6;

  const tier = (): JarQuality => {
    const pinned = st.pinned === null ? undefined : JAR_QUALITY_TIERS[st.pinned];
    return pinned ?? qualityOf(st.quality);
  };
  const pixelRatio = () => (still ? Math.min(2, dpr()) : Math.min(tier().pixelRatioCap, dpr()));

  const sizeCanvas = () => {
    canvas.width = Math.round(st.width * pixelRatio());
    canvas.height = Math.round(st.height * pixelRatio());
    st.k = canvas.width / st.width;
    st.slab = Math.round(st.side * st.k);
  };

  const makeWalls = () => {
    Composite.remove(engine.world, st.walls);
    const { width, height } = st;
    const wall = (x: number, y: number, w: number, h: number, angle = 0) =>
      Bodies.rectangle(x, y, w, h, { isStatic: true, angle, friction: 0.5, restitution: 0.1 });
    const bevel = Math.min(st.side * 1.2, width / 4);
    const T = 200;
    const off = (T / 2) * Math.SQRT1_2;
    st.walls = [
      wall(width / 2, height + T / 2, width + 2 * T, T),
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
    ];
    Composite.add(engine.world, st.walls);
  };

  const makeBody = (id: string, x: number, y: number, angle: number): Body =>
    Bodies.rectangle(x, y, st.side, st.side, {
      label: id,
      angle,
      chamfer: { radius: st.side * 0.2, quality: 2 },
      restitution: 0.12,
      friction: 0.5,
      frictionStatic: 0.7,
      frictionAir: 0.012,
      slop: 0.08,
    });

  const bodies = (): Body[] => [...st.entries.values()].flatMap((e) => (e.body ? [e.body] : []));
  const dynamicBodies = () => bodies().filter((b) => !b.isStatic);

  // Blocks beyond the active cap (counted from the top of the pile) stay as a static pile.
  const applyCap = () => {
    const cap = tier().activeCap;
    bodies()
      .toSorted((a, b) => a.position.y - b.position.y)
      .forEach((b, i) => {
        const frozen = i >= cap;
        if (frozen !== b.isStatic) Body.setStatic(b, frozen);
      });
  };
  const wakeAll = () => {
    applyCap();
    dynamicBodies().forEach((b) => Sleeping.set(b, false));
  };

  const buildSprite = (e: Entry) => {
    e.sprite = makeBlockSprite(e.sticker, st.slab, st.dark);
    e.stale = false;
  };
  const needsSprite = (e: Entry) => !e.sprite || e.stale;

  const spawn = (e: Entry) => {
    const pose = dropPose(st.slot++, st, st.side);
    const body = makeBody(e.id, pose.x, pose.y, pose.angle);
    Body.setVelocity(body, { x: 0, y: st.side * 0.2 });
    Composite.add(engine.world, body);
    e.body = body;
  };

  // First-time sprite generation is spread over frames; a block drops in once its sprite exists.
  const pump = () => {
    const start = performance.now();
    const done = { sprites: 0, spawns: 0 };
    for (const e of st.entries.values()) {
      if (!needsSprite(e)) continue;
      if (!e.body && done.spawns >= MAX_SPAWNS_PER_FRAME) continue;
      if (done.sprites > 0 && performance.now() - start > SPRITE_BUDGET_MS) break;
      buildSprite(e);
      done.sprites++;
      if (!e.body) {
        spawn(e);
        done.spawns++;
      }
    }
  };
  const hasPending = () => [...st.entries.values()].some(needsSprite);

  const paint = (now: number) => {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const selected = o.selected();
    const awake = [...st.entries.values()].reduce((n, e) => {
      const { body, sprite } = e;
      if (!body || !sprite) return n;
      const c = Math.cos(body.angle);
      const sn = Math.sin(body.angle);
      const scale = st.slab / sprite.slab;
      const w = sprite.canvas.width * scale;
      const h = sprite.canvas.height * scale;
      ctx.setTransform(c, sn, -sn, c, body.position.x * st.k, body.position.y * st.k);
      ctx.drawImage(sprite.canvas, -w / 2, -h / 2, w, h);
      if (e.id === selected) {
        ctx.strokeStyle = st.ringColor;
        ctx.lineWidth = Math.max(2, st.k * 1.5);
        ctx.beginPath();
        ctx.roundRect(-st.slab / 2, -st.slab / 2, st.slab, st.slab, st.slab * 0.2);
        ctx.stroke();
      }
      return body.isSleeping || body.isStatic ? n : n + 1;
    }, 0);
    st.ghosts = st.ghosts.filter((g) => now - g.born < VANISH_MS);
    st.ghosts.forEach((g) => {
      const t = (now - g.born) / VANISH_MS;
      const scale = (st.slab / g.sprite.slab) * (1 - 0.35 * t);
      const c = Math.cos(g.angle);
      const sn = Math.sin(g.angle);
      ctx.globalAlpha = 1 - t;
      ctx.setTransform(c, sn, -sn, c, g.x * st.k, g.y * st.k);
      ctx.drawImage(
        g.sprite.canvas,
        (-g.sprite.canvas.width * scale) / 2,
        (-g.sprite.canvas.height * scale) / 2,
        g.sprite.canvas.width * scale,
        g.sprite.canvas.height * scale,
      );
    });
    ctx.globalAlpha = 1;
    st.awake = awake;
  };

  const readRingColor = () => {
    st.ringColor = getComputedStyle(canvas).color;
  };

  const settleStill = () => {
    bodies().forEach((b) => Composite.remove(engine.world, b));
    st.entries.forEach((e) => {
      e.body = null;
      if (needsSprite(e)) buildSprite(e);
    });
    const poses = initialPile(st.entries.size, st, st.side);
    [...st.entries.values()].forEach((e, i) => {
      const p = poses[i];
      if (!p) return;
      e.body = makeBody(e.id, p.x, p.y, p.angle);
      Composite.add(engine.world, e.body);
    });
    const all = bodies();
    Array.from({ length: STILL_STEPS }).some(() => {
      Engine.update(engine, FALLBACK_STEP_MS);
      return all.every((b) => b.isSleeping);
    });
    paint(performance.now());
    canvas.dataset.state = "still";
  };

  const stepMs = () => 1000 / tier().stepHz;

  const frame = (now: number) => {
    st.loop.raf = 0;
    pump();
    const step = stepMs();
    const dt = st.loop.last === 0 ? step : Math.min(now - st.loop.last, 100);
    st.loop.last = now;
    st.loop.acc += dt;
    const due = Math.min(MAX_STEPS_PER_FRAME, Math.floor(st.loop.acc / step));
    st.loop.acc = due === MAX_STEPS_PER_FRAME ? 0 : st.loop.acc - due * step;
    if (due > 0) {
      const t0 = performance.now();
      Array.from({ length: due }).forEach(() => Engine.update(engine, step));
      paint(now);
      const work = performance.now() - t0;
      stats.frames++;
      stats.steps += due;
      stats.workMs += work;
      stats.worstMs = Math.max(stats.worstMs, work);
      if (st.pinned === null) {
        const before = st.quality.tier;
        st.quality = nextQuality(st.quality, {
          workMs: work,
          visible: document.visibilityState === "visible",
          reducedMotion: false,
        });
        if (st.quality.tier !== before) applyTier();
      }
    }
    if (st.awake > 0 || st.drag || hasPending() || st.ghosts.length > 0) {
      st.loop.raf = requestAnimationFrame(frame);
    } else {
      st.loop.last = 0;
      applyCap();
      canvas.dataset.state = "settled";
    }
  };

  const kick = () => {
    if (still || st.loop.raf !== 0 || document.visibilityState !== "visible") return;
    canvas.dataset.state = "moving";
    st.loop.raf = requestAnimationFrame(frame);
  };

  const markAllStale = () => st.entries.forEach((e) => (e.stale = true));

  const applyTier = () => {
    const before = st.k;
    sizeCanvas();
    if (st.k !== before) markAllStale();
    applyCap();
    kick();
  };

  const relayout = (width: number, height: number, side: number) => {
    const from = { width: st.width, height: st.height };
    const fromSide = st.side;
    st.width = width;
    st.height = height;
    st.side = side;
    sizeCanvas();
    makeWalls();
    if (still) {
      settleStill();
      return;
    }
    const factor = side / fromSide;
    bodies().forEach((b) => {
      const p = rescalePose(
        { x: b.position.x, y: b.position.y, angle: b.angle },
        from,
        st,
        fromSide,
        side,
      );
      if (factor !== 1) Body.scale(b, factor, factor);
      Body.setPosition(b, p);
      Body.setVelocity(b, { x: 0, y: 0 });
    });
    markAllStale();
    wakeAll();
    kick();
  };

  const vanish = (e: Entry) => {
    const { body, sprite } = e;
    if (!body || !sprite) return;
    st.ghosts.push({
      x: body.position.x,
      y: body.position.y,
      angle: body.angle,
      sprite,
      born: performance.now(),
    });
  };

  const setBlocks = (blocks: readonly JarBlock[]) => {
    const next = new Set(blocks.map((b) => b.id));
    const removed = [...st.entries.values()].filter((e) => !next.has(e.id));
    removed.forEach((e) => {
      if (!still) vanish(e);
      if (e.body) Composite.remove(engine.world, e.body);
      st.entries.delete(e.id);
      if (o.selected() === e.id) o.onSelect(null);
    });
    blocks.forEach((b) => {
      if (!st.entries.has(b.id)) {
        st.entries.set(b.id, {
          id: b.id,
          sticker: b.sticker,
          body: null,
          sprite: null,
          stale: false,
        });
      }
    });
    canvas.dataset.blocks = String(st.entries.size);
    const side = fitSide(st.side, st.entries.size, st);
    if (side !== st.side) {
      relayout(st.width, st.height, side);
      return;
    }
    if (still) {
      settleStill();
      return;
    }
    if (removed.length > 0) wakeAll();
    kick();
  };

  const pointInJar = (e: PointerEvent, rect: DOMRect) => ({
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  });

  const input = new AbortController();
  canvas.addEventListener(
    "pointerdown",
    (down) => {
      if (st.drag) return;
      const rect = canvas.getBoundingClientRect();
      const start = pointInJar(down, rect);
      const hit = Query.point(bodies(), start).at(-1);
      const gesture = { startedAt: performance.now(), moved: false };
      const stop = new AbortController();
      if (hit) {
        down.preventDefault();
        canvas.setPointerCapture(down.pointerId);
      }
      const grabbed = hit && !still && !hit.isStatic ? hit : undefined;
      const constraint = grabbed
        ? Constraint.create({
            pointA: start,
            bodyB: grabbed,
            pointB: { x: start.x - grabbed.position.x, y: start.y - grabbed.position.y },
            stiffness: 0.18,
            damping: 0.12,
            length: 0,
          })
        : null;
      if (grabbed && constraint) {
        Sleeping.set(grabbed, false);
        Composite.add(engine.world, constraint);
        st.drag = constraint;
        st.hapticUntil = performance.now() + HAPTIC_WINDOW_MS;
      }
      const release = (up: PointerEvent) => {
        stop.abort();
        if (constraint) {
          Composite.remove(engine.world, constraint);
          st.drag = null;
          st.hapticUntil = performance.now() + HAPTIC_WINDOW_MS;
        }
        const tapped =
          !gesture.moved &&
          up.type === "pointerup" &&
          performance.now() - gesture.startedAt < TAP_MAX_MS;
        if (tapped) o.onSelect(hit?.label ?? null);
        kick();
      };
      canvas.addEventListener(
        "pointermove",
        (move) => {
          if (move.pointerId !== down.pointerId) return;
          const p = pointInJar(move, rect);
          if (Math.hypot(p.x - start.x, p.y - start.y) > TAP_SLOP_PX) gesture.moved = true;
          if (constraint) constraint.pointA = p;
        },
        { signal: stop.signal },
      );
      canvas.addEventListener("pointerup", release, { signal: stop.signal });
      canvas.addEventListener("pointercancel", release, { signal: stop.signal });
      kick();
    },
    { signal: input.signal },
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "visible") {
        kick();
        return;
      }
      cancelAnimationFrame(st.loop.raf);
      st.loop.raf = 0;
      st.loop.last = 0;
    },
    { signal: input.signal },
  );
  darkQuery.addEventListener(
    "change",
    () => {
      st.dark = darkQuery.matches;
      readRingColor();
      markAllStale();
      if (still) settleStill();
      else kick();
    },
    { signal: input.signal },
  );

  if (typeof navigator.vibrate === "function") {
    Events.on(engine, "collisionStart", (event) => {
      const now = performance.now();
      if (now > st.hapticUntil || now - st.lastHaptic < HAPTIC_GAP_MS) return;
      const strong = event.pairs.some(
        (p) =>
          Math.hypot(
            p.bodyA.velocity.x - p.bodyB.velocity.x,
            p.bodyA.velocity.y - p.bodyB.velocity.y,
          ) >
          st.side * HAPTIC_SPEED_PER_SIDE,
      );
      if (!strong) return;
      st.lastHaptic = now;
      navigator.vibrate(HAPTIC_MS);
    });
  }

  const setGravity = (x: number, y: number) => {
    const g = engine.gravity;
    if (Math.abs(g.x - x) + Math.abs(g.y - y) < 0.03) return;
    g.x = x;
    g.y = y;
    wakeAll();
    kick();
  };

  sizeCanvas();
  makeWalls();
  readRingColor();
  canvas.dataset.blocks = String(o.blocks.length);
  o.blocks.forEach((b) =>
    st.entries.set(b.id, { id: b.id, sticker: b.sticker, body: null, sprite: null, stale: false }),
  );
  if (still) settleStill();
  else kick();

  if (import.meta.env.VITE_JAR_PROBE) {
    publishProbe({
      stats,
      reset: () => Object.assign(stats, { frames: 0, workMs: 0, worstMs: 0, steps: 0 }),
      blocks: () =>
        bodies().map((b) => ({ x: b.position.x, y: b.position.y, side: st.side, id: b.label })),
      size: () => ({ width: st.width, height: st.height }),
      tier: () => st.pinned ?? st.quality.tier,
      pinTier: (i) => {
        st.pinned = i;
        applyTier();
      },
      frozen: () => bodies().filter((b) => b.isStatic).length,
    });
  }

  return {
    shake: () => {
      st.hapticUntil = performance.now() + HAPTIC_WINDOW_MS;
      wakeAll();
      dynamicBodies().forEach((b) => {
        Body.setVelocity(b, {
          x: (Math.random() - 0.5) * st.side * 0.5,
          y: -st.side * (0.2 + Math.random() * 0.4),
        });
        Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.3);
      });
      kick();
    },
    setTilt: (on) => {
      st.tilt?.abort();
      st.tilt = null;
      if (!on) {
        setGravity(0, 1);
        return;
      }
      const a = new AbortController();
      st.tilt = a;
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
    setBlocks,
    resize: (width, height) => {
      if (Math.abs(width - st.width) < 0.5 && Math.abs(height - st.height) < 0.5) return;
      relayout(width, height, blockSide(st.entries.size, { width, height }));
    },
    repaint: () => {
      readRingColor();
      if (still) paint(performance.now());
      else kick();
    },
    dispose: () => {
      cancelAnimationFrame(st.loop.raf);
      st.tilt?.abort();
      input.abort();
      Composite.clear(engine.world, false);
      Engine.clear(engine);
    },
  };
}
