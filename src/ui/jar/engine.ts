import { Bodies, Body, Composite, Constraint, Engine, Events, Query, Sleeping } from "matter-js";
import { insideJar, jarGeometry, pushInside, wallSegments } from "../../core/jar-geometry.ts";
import { JAR_FEEL, capSpeed, isCalm, shakeKick } from "../../core/jar-feel.ts";
import { blockSide, dropPose, fitSide, initialPile, rescalePose } from "../../core/jar-layout.ts";
import {
  INITIAL_QUALITY,
  JAR_QUALITY_TIERS,
  nextQuality,
  qualityOf,
  type JarQuality,
  type QualityState,
} from "../../core/jar-quality.ts";
import { blockShape, polygonCentroid, type BlockShape } from "../../core/jar-shape.ts";
import type { Sticker } from "../../core/payload.ts";
import { drawGlass, type GlassLayers } from "./glass.ts";
import { publishProbe } from "./probe.ts";
import { makeBlockSprite, silhouettePath, type BlockSprite } from "./sprite.ts";

type JarBlock = { readonly id: string; readonly sticker: Sticker };

export type JarOptions = {
  readonly canvas: HTMLCanvasElement;
  // static canvases stacked behind and in front of `canvas`, drawn only when the size or theme changes
  readonly glass: GlassLayers;
  // the whole jar canvas in CSS px (the glass, its walls and the room above it)
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
  readonly shape: BlockShape;
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
const WALL_THICKNESS = 80;
const SPRITE_BUDGET_MS = 5;
const MAX_SPAWNS_PER_FRAME = 2;
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

  const geo0 = jarGeometry(o.width, o.height);
  const st = {
    width: o.width,
    height: o.height,
    geo: geo0,
    glassKey: "",
    shake: null as { start: number; fired: number } | null,
    calmSteps: 0,
    rescued: 0,
    side: blockSide(o.blocks.length, geo0.room),
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

  const paintGlass = () => {
    const key = `${canvas.width}x${canvas.height}:${st.width}x${st.height}:${st.dark}`;
    if (key === st.glassKey) return;
    st.glassKey = key;
    drawGlass(st.geo, st.k, st.dark, o.glass);
  };

  const sizeCanvas = () => {
    canvas.width = Math.round(st.width * pixelRatio());
    canvas.height = Math.round(st.height * pixelRatio());
    st.k = canvas.width / st.width;
    st.slab = Math.round(st.side * st.k);
    st.geo = jarGeometry(st.width, st.height);
    paintGlass();
  };

  const makeWalls = () => {
    Composite.remove(engine.world, st.walls);
    // slabs lying outside the jar's inner outline, rounded bottom corners included
    st.walls = wallSegments(st.geo, st.height).map((w) =>
      Bodies.rectangle(
        w.x + (w.nx * WALL_THICKNESS) / 2,
        w.y + (w.ny * WALL_THICKNESS) / 2,
        w.length + 4,
        WALL_THICKNESS,
        {
          isStatic: true,
          angle: w.angle,
          friction: JAR_FEEL.friction,
          restitution: JAR_FEEL.wallRestitution,
        },
      ),
    );
    Composite.add(engine.world, st.walls);
  };

  // convex parts around the shape's centre of mass; a compound body unless the shape is one part
  const makeBody = (e: Entry, x: number, y: number, angle: number): Body => {
    const { parts, centre } = e.shape;
    const feel = {
      label: e.id,
      restitution: JAR_FEEL.restitution,
      friction: JAR_FEEL.friction,
      frictionStatic: JAR_FEEL.frictionStatic,
      frictionAir: JAR_FEEL.frictionAir,
      sleepThreshold: JAR_FEEL.sleepSteps,
      slop: 0.08,
    };
    const local = parts.map((part) =>
      part.map(([px, py]) => ({ x: (px - centre[0]) * st.side, y: (py - centre[1]) * st.side })),
    );
    const only = local[0];
    if (local.length === 1 && only) {
      return Body.create({ ...feel, position: { x, y }, angle, vertices: only });
    }
    const pieces = local.map((v) => {
      const c = polygonCentroid(v.map((p): [number, number] => [p.x, p.y]));
      return Body.create({ position: { x: c[0], y: c[1] }, vertices: v });
    });
    const body = Body.create({ ...feel, parts: pieces });
    Body.setPosition(body, { x, y });
    Body.setAngle(body, angle);
    return body;
  };

  const bodies = (): Body[] => [...st.entries.values()].flatMap((e) => (e.body ? [e.body] : []));
  const dynamicBodies = () => bodies().filter((b) => !b.isStatic);

  const cost = (b: Body) => (b.parts.length > 1 ? b.parts.length - 1 : 1);

  // Collision parts beyond the active budget (counted from the top of the pile) stay as a static pile.
  const applyCap = () => {
    const budget = tier().activeParts;
    bodies()
      .toSorted((a, b) => a.position.y - b.position.y)
      .reduce((used, b) => {
        const frozen = used >= budget;
        if (frozen !== b.isStatic) Body.setStatic(b, frozen);
        return used + cost(b);
      }, 0);
  };
  const wakeAll = () => {
    applyCap();
    dynamicBodies().forEach((b) => Sleeping.set(b, false));
  };

  const buildSprite = (e: Entry) => {
    e.sprite = makeBlockSprite(e.sticker, e.shape, st.slab, st.dark);
    e.stale = false;
  };
  const needsSprite = (e: Entry) => !e.sprite || e.stale;

  const dropPoint = () => {
    const { mouth } = st.geo;
    const pose = dropPose(st.slot++, { width: mouth.x1 - mouth.x0, height: 0 }, st.side);
    return { x: mouth.x0 + pose.x, y: mouth.y + pose.y, angle: pose.angle };
  };

  const spawn = (e: Entry) => {
    const at = dropPoint();
    const body = makeBody(e, at.x, at.y, at.angle);
    Body.setVelocity(body, { x: 0, y: st.side * 0.2 });
    Composite.add(engine.world, body);
    e.body = body;
  };

  // Many blocks pouring in at once can press a block into the glass or through it. Whatever
  // has its centre outside the jar goes back in through the mouth.
  const rescueStrays = () =>
    dynamicBodies().forEach((b) => {
      if (b.position.y < st.geo.mouth.y || insideJar(st.geo, b.position.x, b.position.y)) return;
      const at = dropPoint();
      Body.setPosition(b, at);
      Body.setAngle(b, at.angle);
      Body.setVelocity(b, { x: 0, y: st.side * 0.2 });
      Sleeping.set(b, false);
      st.rescued++;
    });

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
      // the sprite is centred on the sticker square; the body turns about its centre of mass
      const ox = e.shape.centre[0] * st.slab;
      const oy = e.shape.centre[1] * st.slab;
      ctx.setTransform(c, sn, -sn, c, body.position.x * st.k, body.position.y * st.k);
      ctx.drawImage(sprite.canvas, -w / 2 - ox, -h / 2 - oy, w, h);
      if (e.id === selected) {
        ctx.strokeStyle = st.ringColor;
        ctx.lineWidth = Math.max(2, st.k * 1.5);
        ctx.translate(-ox, -oy);
        silhouettePath(ctx, e.shape, st.slab);
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
        (-g.sprite.canvas.width / 2 - g.sprite.shape.centre[0] * g.sprite.slab) * scale,
        (-g.sprite.canvas.height / 2 - g.sprite.shape.centre[1] * g.sprite.slab) * scale,
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

  // speed limit and a little rolling resistance, applied after every physics step
  // A pile under pressure can jitter below what Matter calls asleep for a long time: once nothing
  // has moved visibly for a while, put everything to sleep.
  const limitMotion = () => {
    const awake = dynamicBodies().filter((b) => !b.isSleeping);
    awake.forEach((b) => {
      const v = capSpeed(b.velocity.x, b.velocity.y, st.side);
      if (v.vx !== b.velocity.x || v.vy !== b.velocity.y) Body.setVelocity(b, { x: v.vx, y: v.vy });
      Body.setAngularVelocity(b, b.angularVelocity * JAR_FEEL.spinKept);
    });
    const calm = awake.every((b) => isCalm(b.speed, b.angularSpeed, st.side));
    st.calmSteps = calm && !st.drag && !st.shake ? st.calmSteps + 1 : 0;
    if (st.calmSteps >= JAR_FEEL.calmSteps) {
      awake.forEach((b) => Sleeping.set(b, true));
      st.calmSteps = 0;
    }
  };

  const runShake = (now: number) => {
    const sh = st.shake;
    if (!sh) return;
    const { pulses } = JAR_FEEL.shake;
    const due = pulses.filter((p, i) => i >= sh.fired && now - sh.start >= p.at);
    due.forEach((pulse) => {
      wakeAll();
      dynamicBodies().forEach((b) => {
        const k = shakeKick(pulse.amp, st.side, [Math.random(), Math.random(), Math.random()]);
        Body.setVelocity(b, { x: b.velocity.x + k.vx, y: b.velocity.y + k.vy });
        Body.setAngularVelocity(b, b.angularVelocity + k.spin);
      });
    });
    sh.fired += due.length;
    if (sh.fired >= pulses.length) st.shake = null;
  };

  const settleStill = () => {
    bodies().forEach((b) => Composite.remove(engine.world, b));
    st.entries.forEach((e) => {
      e.body = null;
      if (needsSprite(e)) buildSprite(e);
    });
    // rows packed from the floor, kept clear of the rounded bottom corners
    const { geo } = st;
    const pile = {
      width: geo.room.width - geo.corner * 0.7,
      height: geo.room.height - geo.corner * 0.25,
    };
    const poses = initialPile(st.entries.size, pile, st.side);
    [...st.entries.values()].forEach((e, i) => {
      const p = poses[i];
      if (!p) return;
      e.body = makeBody(
        e,
        (st.width - pile.width) / 2 + p.x,
        geo.floorY - geo.corner * 0.25 - pile.height + p.y,
        p.angle,
      );
      Composite.add(engine.world, e.body);
    });
    const all = bodies();
    Array.from({ length: STILL_STEPS }).some(() => {
      Engine.update(engine, FALLBACK_STEP_MS);
      limitMotion();
      rescueStrays();
      return all.every((b) => b.isSleeping);
    });
    paint(performance.now());
    canvas.dataset.state = "still";
  };

  const stepMs = () => 1000 / tier().stepHz;

  const frame = (now: number) => {
    st.loop.raf = 0;
    pump();
    runShake(now);
    const step = stepMs();
    const dt = st.loop.last === 0 ? step : Math.min(now - st.loop.last, 100);
    st.loop.last = now;
    st.loop.acc += dt;
    const due = Math.min(MAX_STEPS_PER_FRAME, Math.floor(st.loop.acc / step));
    st.loop.acc = due === MAX_STEPS_PER_FRAME ? 0 : st.loop.acc - due * step;
    if (due > 0) {
      const t0 = performance.now();
      Array.from({ length: due }).forEach(() => {
        Engine.update(engine, step);
        limitMotion();
      });
      rescueStrays();
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
    if (st.awake > 0 || st.drag || st.shake || hasPending() || st.ghosts.length > 0) {
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
    const from = { width: st.width, height: st.geo.floorY };
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
    const to = { width: st.width, height: st.geo.floorY };
    bodies().forEach((b) => {
      const p = rescalePose(
        { x: b.position.x, y: b.position.y, angle: b.angle },
        from,
        to,
        fromSide,
        side,
      );
      const [x, y] = pushInside(st.geo, [p.x, p.y], side * 0.5);
      if (factor !== 1) Body.scale(b, factor, factor);
      Body.setPosition(b, { x, y });
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
          shape: blockShape(b.sticker),
          body: null,
          sprite: null,
          stale: false,
        });
      }
    });
    canvas.dataset.blocks = String(st.entries.size);
    const side = fitSide(st.side, st.entries.size, st.geo.room);
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
      paintGlass();
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
    st.entries.set(b.id, {
      id: b.id,
      sticker: b.sticker,
      shape: blockShape(b.sticker),
      body: null,
      sprite: null,
      stale: false,
    }),
  );
  if (still) settleStill();
  else kick();

  if (import.meta.env.VITE_JAR_PROBE) {
    publishProbe({
      stats,
      reset: () => Object.assign(stats, { frames: 0, workMs: 0, worstMs: 0, steps: 0 }),
      blocks: () =>
        bodies().map((b) => ({ x: b.position.x, y: b.position.y, side: st.side, id: b.label })),
      parts: () => bodies().reduce((n, b) => n + cost(b), 0),
      rescued: () => st.rescued,
      awake: () =>
        dynamicBodies()
          .filter((b) => !b.isSleeping)
          .map((b) => ({ x: b.position.x, y: b.position.y, speed: b.speed, spin: b.angularSpeed })),
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
      if (still) return;
      st.hapticUntil = performance.now() + HAPTIC_WINDOW_MS;
      st.shake = { start: performance.now(), fired: 0 };
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
      relayout(width, height, blockSide(st.entries.size, jarGeometry(width, height).room));
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
