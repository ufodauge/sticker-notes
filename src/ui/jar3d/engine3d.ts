import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { JAR_FEEL } from "../../core/jar-feel.ts";
import { blockShape, type BlockShape } from "../../core/jar-shape.ts";
import {
  INITIAL_QUALITY,
  nextQuality,
  qualityOf,
  type QualityState,
} from "../../core/jar-quality.ts";
import {
  JAR3D,
  cameraPosition,
  jarCollisionPieces,
  outerRadiusAt,
  spawnPose,
} from "../../core/jar3d.ts";
import type { Sticker } from "../../core/payload.ts";
import { jarSound } from "../jar/sound.ts";
import { buildBlock, buildScene, type BlockVisual, type Scene3d } from "./scene3d.ts";

type JarBlock = { readonly id: string; readonly sticker: Sticker };

export type Jar3dOptions = {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly blocks: readonly JarBlock[];
  readonly still: boolean;
  readonly selected: () => string | null;
  readonly onSelect: (id: string | null) => void;
};

export type Jar3dHandle = {
  readonly reset: () => void;
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
  readonly visual: BlockVisual;
  body: RAPIER.RigidBody | null;
  vanishing: number;
  lastSpeed: number;
};

type Kind =
  | { readonly kind: "block"; readonly id: string }
  | { readonly kind: "jar" }
  | { readonly kind: "desk" };

const STEP = 1 / 60;
const SUBSTEPS = 2;
const SOLVER_ITERATIONS = 8;
const MAX_BODY_SPEED = 11;
const DESK_HALF = 9.5;
const FALL_LIMIT = -6;
const MAX_STEPS_PER_FRAME = 6;
const PROBE_STEPS_PER_FRAME = 16;
const MAX_SPAWNS_PER_FRAME = 2;
const STILL_STEPS = 900;
const SLEEP_FRAMES_TO_SETTLE = 30;
const VANISH_MS = 220;
const TAP_SLOP_PX = 8;
const TAP_MAX_MS = 600;
const DRAG_GAIN = 16;
const DRAG_MAX_SPEED = 16;
const TILT_RANGE = 0.55;
const PILE_CALM_SPEED = 0.7;
const PILE_CALM_SPIN = 1.2;
const PILE_CALM_STEPS = 90;
const JAR_CALM_SPEED = 0.05;
const JAR_CALM_STEPS = 40;
const JAR_PULL = 0.14;
const JAR_PULL_CAP = 1.4;
const SOUND_SIDE_PX = 48;
const HIT_SPEED_SCALE = 1 / (60 * 0.5);

const rand4 = (): [number, number, number, number] => [
  Math.random(),
  Math.random(),
  Math.random(),
  Math.random(),
];

export function createJar3d(o: Jar3dOptions): Jar3dHandle {
  const { canvas, still } = o;
  const abort = new AbortController();
  const st = {
    disposed: false,
    ready: false,
    size: { width: o.width, height: o.height },
    desired: o.blocks,
    scene: null as Scene3d | null,
    world: null as RAPIER.World | null,
    events: null as RAPIER.EventQueue | null,
    jar: null as RAPIER.RigidBody | null,
    jarColliders: [] as RAPIER.Collider[],
    jarLive: { on: false, calm: 0 },
    pileCalm: 0,
    entries: new Map<string, Entry>(),
    kinds: new Map<number, Kind>(),
    spawnQueue: [] as string[],
    spawned: 0,
    quality: INITIAL_QUALITY as QualityState,
    loop: { raf: 0, last: 0, acc: 0, calm: 0 },
    drag: null as null | {
      id: string | null;
      anchor: THREE.Vector3 | null;
      plane: THREE.Plane;
      target: THREE.Vector3;
      start: { x: number; y: number; t: number };
      moved: boolean;
    },
    shakes: [] as { at: number; amp: number }[],
    tilt: { on: false, gamma: 0, beta: 0 },
    yaw: 0,
  };
  canvas.dataset.renderer = "webgl";
  canvas.dataset.state = "moving";
  canvas.dataset.blocks = String(o.blocks.length);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const render = () => {
    const sc = st.scene;
    if (!sc) return;
    const { width, height } = st.size;
    const aspect = width / Math.max(1, height);
    const [x, y, z] = cameraPosition(aspect, st.yaw);
    sc.camera.aspect = aspect;
    sc.camera.position.set(x, y, z);
    sc.camera.lookAt(...JAR3D.target);
    sc.camera.updateProjectionMatrix();
    sc.renderer.render(sc.scene, sc.camera);
  };

  const applySize = () => {
    const sc = st.scene;
    if (!sc) return;
    const tier = qualityOf(st.quality);
    const cap = import.meta.env.VITE_JAR_PROBE ? 1 : tier.pixelRatioCap;
    sc.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    sc.renderer.setSize(st.size.width, st.size.height, false);
    sc.renderer.shadowMap.enabled = st.quality.tier < 3;
  };

  const registerCollider = (collider: RAPIER.Collider, kind: Kind) => {
    st.kinds.set(collider.handle, kind);
    collider.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  };

  const buildStatics = (world: RAPIER.World) => {
    const desk = world.createCollider(
      RAPIER.ColliderDesc.cuboid(DESK_HALF, JAR3D.deskThickness / 2, DESK_HALF)
        .setTranslation(0, -JAR3D.deskThickness / 2, 0)
        .setFriction(0.7)
        .setRestitution(0.1),
    );
    registerCollider(desk, { kind: "desk" });
  };

  const swapJarColliders = (kind: "smooth" | "pieces") => {
    const world = st.world;
    const jar = st.jar;
    const sc = st.scene;
    if (!world || !jar || !sc) return;
    st.jarColliders.splice(0).forEach((c) => {
      st.kinds.delete(c.handle);
      world.removeCollider(c, false);
    });
    const descs =
      kind === "smooth"
        ? sc.jarGeometries.flatMap((g) => {
            const index = g.getIndex()?.array;
            if (!index) return [];
            const position = new Float32Array(g.getAttribute("position").array as Float32Array);
            return [RAPIER.ColliderDesc.trimesh(position, Uint32Array.from(index))];
          })
        : jarCollisionPieces().flatMap((points) => {
            const desc = RAPIER.ColliderDesc.convexHull(points);
            return desc ? [desc.setDensity(4)] : [];
          });
    descs.forEach((desc) => {
      const collider = world.createCollider(desc.setFriction(0.4).setRestitution(0.05), jar);
      registerCollider(collider, { kind: "jar" });
      st.jarColliders.push(collider);
    });
  };

  const buildJar = (world: RAPIER.World) =>
    world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(0, 0.02, 0)
        .setLinearDamping(0.5)
        .setAngularDamping(1.2)
        .setCcdEnabled(true),
    );

  const hullPoints = (entry: Entry, part: readonly (readonly [number, number])[]) => {
    const [cx, cy] = entry.shape.centre;
    const half = JAR3D.thickness / 2 - 0.02;
    return Float32Array.from(
      part.flatMap(([x, y]) => [
        (x - cx) * JAR3D.side,
        -(y - cy) * JAR3D.side,
        -half,
        (x - cx) * JAR3D.side,
        -(y - cy) * JAR3D.side,
        half,
      ]),
    );
  };

  const makeBody = (entry: Entry, pose: ReturnType<typeof spawnPose>) => {
    const world = st.world;
    if (!world) return null;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.rx, pose.ry, pose.rz));
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pose.x, pose.y, pose.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinearDamping(0.4)
        .setAngularDamping(1.2)
        .setSoftCcdPrediction(0.6),
    );
    entry.shape.parts.forEach((part) => {
      const desc = RAPIER.ColliderDesc.convexHull(hullPoints(entry, part));
      if (!desc) return;
      const collider = world.createCollider(
        desc.setFriction(0.7).setRestitution(0.04).setDensity(1),
        body,
      );
      registerCollider(collider, { kind: "block", id: entry.id });
    });
    return body;
  };

  const addEntry = (b: JarBlock, sc: Scene3d) => {
    const shape = blockShape(b.sticker);
    const visual = buildBlock(b.sticker, shape);
    visual.group.visible = false;
    sc.scene.add(visual.group);
    const entry: Entry = {
      id: b.id,
      sticker: b.sticker,
      shape,
      visual,
      body: null,
      vanishing: 0,
      lastSpeed: 0,
    };
    st.entries.set(b.id, entry);
    st.spawnQueue.push(b.id);
  };

  const removeEntry = (entry: Entry) => {
    const world = st.world;
    const sc = st.scene;
    if (entry.body && world) {
      Array.from({ length: entry.body.numColliders() }).forEach((_, i) => {
        const c = entry.body?.collider(i);
        if (c) st.kinds.delete(c.handle);
      });
      world.removeRigidBody(entry.body);
    }
    sc?.scene.remove(entry.visual.group);
    entry.visual.dispose();
    st.entries.delete(entry.id);
  };

  const spawn = (entry: Entry) => {
    entry.body = makeBody(entry, spawnPose(st.spawned++, rand4()));
    entry.visual.group.visible = true;
  };

  const syncBlocks = () => {
    const sc = st.scene;
    if (!sc || !st.ready) return;
    const wanted = new Map(st.desired.map((b) => [b.id, b]));
    st.entries.forEach((e) => {
      if (!wanted.has(e.id) && e.vanishing === 0) e.vanishing = performance.now();
    });
    wanted.forEach((b, id) => {
      const existing = st.entries.get(id);
      if (existing && existing.vanishing !== 0) {
        existing.vanishing = 0;
        existing.visual.group.scale.setScalar(1);
      }
      if (!existing) addEntry(b, sc);
    });
    canvas.dataset.blocks = String(wanted.size);
    kick();
  };

  const syncMeshes = () => {
    const selected = o.selected();
    const jar = st.jar;
    if (jar && st.scene) {
      const t = jar.translation();
      const r = jar.rotation();
      st.scene.jarGroup.position.set(t.x, t.y, t.z);
      st.scene.jarGroup.quaternion.set(r.x, r.y, r.z, r.w);
    }
    st.entries.forEach((e) => {
      const body = e.body;
      if (!body) return;
      const t = body.translation();
      const r = body.rotation();
      e.visual.group.position.set(t.x, t.y, t.z);
      e.visual.group.quaternion.set(r.x, r.y, r.z, r.w);
      e.visual.tint.emissive.set(selected === e.id ? 0x4fa6ff : 0x000000);
      e.visual.tint.emissiveIntensity = selected === e.id ? 0.55 : 1;
    });
  };

  const anyAwake = () =>
    [...st.entries.values()].some((e) => e.body && !e.body.isSleeping()) ||
    st.jarLive.on ||
    st.spawnQueue.length > 0;

  const applyGravity = () => {
    const world = st.world;
    if (!world) return;
    const g = JAR3D.gravity;
    const tx = st.tilt.on ? Math.max(-TILT_RANGE, Math.min(TILT_RANGE, st.tilt.gamma / 70)) : 0;
    const tz = st.tilt.on ? Math.max(-TILT_RANGE, Math.min(TILT_RANGE, st.tilt.beta / 70)) : 0;
    world.gravity = {
      x: g * tx,
      y: -g * Math.sqrt(Math.max(0.2, 1 - tx * tx - tz * tz)),
      z: g * tz,
    };
  };

  const wakeAll = () => st.entries.forEach((e) => e.body?.wakeUp());

  const jarDragStep = (d: NonNullable<typeof st.drag>) => {
    const jar = st.jar;
    if (!jar || !d.anchor) return;
    const t = jar.translation();
    const r = jar.rotation();
    const world = new THREE.Vector3()
      .copy(d.anchor)
      .applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
    world.add(new THREE.Vector3(t.x, t.y, t.z));
    const toTarget = new THREE.Vector3().subVectors(d.target, world);
    const push = toTarget.multiplyScalar(JAR_PULL * jar.mass());
    const cap = JAR_PULL_CAP * jar.mass();
    if (push.length() > cap) push.setLength(cap);
    jar.applyImpulseAtPoint(
      { x: push.x, y: push.y, z: push.z },
      { x: world.x, y: world.y, z: world.z },
      true,
    );
  };

  const dragStep = () => {
    const d = st.drag;
    if (!d) return;
    if (d.id === null) {
      jarDragStep(d);
      return;
    }
    const body = st.entries.get(d.id)?.body;
    if (!body) return;
    const p = body.translation();
    const v = {
      x: (d.target.x - p.x) * DRAG_GAIN,
      y: (d.target.y - p.y) * DRAG_GAIN,
      z: (d.target.z - p.z) * DRAG_GAIN,
    };
    const speed = Math.hypot(v.x, v.y, v.z);
    const k = speed > DRAG_MAX_SPEED ? DRAG_MAX_SPEED / speed : 1;
    body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  };

  const runShakes = (now: number) => {
    const due = st.shakes.filter((s) => s.at <= now);
    st.shakes = st.shakes.filter((s) => s.at > now);
    due.forEach((s) => {
      jarSound.rattle(s.amp);
      st.entries.forEach((e) => {
        const body = e.body;
        if (!body) return;
        const mass = body.mass();
        body.applyImpulse(
          {
            x: (Math.random() - 0.5) * 2 * 3.2 * mass * s.amp,
            y: (3 + Math.random() * 5) * mass * s.amp,
            z: (Math.random() - 0.5) * 2 * 3.2 * mass * s.amp,
          },
          true,
        );
        body.applyTorqueImpulse(
          {
            x: (Math.random() - 0.5) * mass * 0.5 * s.amp,
            y: (Math.random() - 0.5) * mass * 0.5 * s.amp,
            z: (Math.random() - 0.5) * mass * 0.5 * s.amp,
          },
          true,
        );
      });
    });
  };

  const drainHits = () => {
    const world = st.world;
    const events = st.events;
    if (!world || !events || !jarSound.listening()) {
      events?.clear();
      return;
    }
    events.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const a = st.kinds.get(h1);
      const b = st.kinds.get(h2);
      if (!a || !b) return;
      const speedOf = (k: Kind) =>
        k.kind === "block" ? (st.entries.get(k.id)?.lastSpeed ?? 0) : 0;
      const speed = Math.max(speedOf(a), speedOf(b)) * HIT_SPEED_SCALE * 0.1;
      const surface =
        a.kind === "block" && b.kind === "block"
          ? "block"
          : a.kind === "desk" || b.kind === "desk"
            ? "base"
            : "glass";
      jarSound.hit(surface, speed, SOUND_SIDE_PX);
    });
  };

  const freezeJarWhenCalm = () => {
    const jar = st.jar;
    if (!jar || !st.jarLive.on || st.drag?.id === null) return;
    const v = jar.linvel();
    const w = jar.angvel();
    const calm =
      Math.hypot(v.x, v.y, v.z) < JAR_CALM_SPEED && Math.hypot(w.x, w.y, w.z) < JAR_CALM_SPEED;
    st.jarLive.calm = calm ? st.jarLive.calm + 1 : 0;
    if (st.jarLive.calm < JAR_CALM_STEPS) return;
    jar.setBodyType(RAPIER.RigidBodyType.Fixed, true);
    swapJarColliders("smooth");
    st.jarLive.on = false;
  };

  const sleepPileWhenCalm = () => {
    const awake = [...st.entries.values()].filter((e) => e.body && !e.body.isSleeping());
    const calm =
      st.drag === null &&
      st.shakes.length === 0 &&
      awake.every((e) => {
        const v = e.body?.linvel();
        const w = e.body?.angvel();
        return (
          Math.hypot(v?.x ?? 0, v?.y ?? 0, v?.z ?? 0) < PILE_CALM_SPEED &&
          Math.hypot(w?.x ?? 0, w?.y ?? 0, w?.z ?? 0) < PILE_CALM_SPIN
        );
      });
    st.pileCalm = calm ? st.pileCalm + 1 : 0;
    if (st.pileCalm < PILE_CALM_STEPS) return;
    awake.forEach((e) => e.body?.sleep());
    st.pileCalm = 0;
  };

  const step = () => {
    const world = st.world;
    const events = st.events;
    if (!world || !events) return;
    st.entries.forEach((e) => {
      if (!e.body) return;
      const v = e.body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      e.lastSpeed = speed;
      if (speed > MAX_BODY_SPEED) {
        const k = MAX_BODY_SPEED / speed;
        e.body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true);
      }
    });
    dragStep();
    Array.from({ length: SUBSTEPS }).forEach(() => world.step(events));
    drainHits();
    freezeJarWhenCalm();
    sleepPileWhenCalm();
  };

  const dropBody = (entry: Entry) => {
    const world = st.world;
    if (!entry.body || !world) return;
    Array.from({ length: entry.body.numColliders() }).forEach((_, i) => {
      const c = entry.body?.collider(i);
      if (c) st.kinds.delete(c.handle);
    });
    world.removeRigidBody(entry.body);
    entry.body = null;
    entry.visual.group.visible = false;
  };

  const standJarUp = () => {
    const jar = st.jar;
    if (!jar) return;
    jar.setBodyType(RAPIER.RigidBodyType.Fixed, true);
    swapJarColliders("smooth");
    jar.setTranslation({ x: 0, y: 0.02, z: 0 }, true);
    jar.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    st.jarLive.on = false;
  };

  const rescueStrays = () => {
    st.entries.forEach((e) => {
      if (e.body && e.body.translation().y < FALL_LIMIT) {
        dropBody(e);
        st.spawnQueue.push(e.id);
      }
    });
    if (st.jar && st.jar.translation().y < FALL_LIMIT) standJarUp();
  };

  const resetAll = () => {
    standJarUp();
    st.entries.forEach((e) => {
      if (e.vanishing !== 0) return;
      dropBody(e);
      st.spawnQueue.push(e.id);
    });
    kick();
  };

  const frame = (now: number) => {
    st.loop.raf = 0;
    if (st.disposed) return;
    const t0 = performance.now();
    runShakes(now);
    Array.from({ length: Math.min(MAX_SPAWNS_PER_FRAME, st.spawnQueue.length) }).forEach(() => {
      const id = st.spawnQueue.shift();
      const entry = id ? st.entries.get(id) : undefined;
      if (entry && !entry.body) spawn(entry);
    });
    st.entries.forEach((e) => {
      if (e.vanishing === 0) return;
      const age = now - e.vanishing;
      if (age >= VANISH_MS) removeEntry(e);
      else e.visual.group.scale.setScalar(Math.max(0.01, 1 - age / VANISH_MS));
    });
    const stepSeconds = 1 / qualityOf(st.quality).stepHz;
    const dt = st.loop.last === 0 ? stepSeconds : Math.min((now - st.loop.last) / 1000, 0.1);
    st.loop.last = now;
    st.loop.acc += dt;
    const due = import.meta.env.VITE_JAR_PROBE
      ? PROBE_STEPS_PER_FRAME
      : Math.min(MAX_STEPS_PER_FRAME, Math.floor(st.loop.acc / stepSeconds));
    st.loop.acc = due === MAX_STEPS_PER_FRAME ? 0 : st.loop.acc - due * stepSeconds;
    if (st.world) st.world.timestep = stepSeconds / SUBSTEPS;
    Array.from({ length: due }).forEach(step);
    rescueStrays();
    syncMeshes();
    render();
    if (import.meta.env.VITE_JAR_PROBE) {
      canvas.dataset.awake = String(
        [...st.entries.values()].filter((e) => e.body && !e.body.isSleeping()).length,
      );
      canvas.dataset.leaked = String(
        [...st.entries.values()].filter((e) => {
          const t = e.body?.translation();
          if (!t) return false;
          return (
            Math.hypot(t.x, t.z) > outerRadiusAt(Math.min(JAR3D.height, Math.max(0, t.y))) &&
            t.y < JAR3D.height - 0.2
          );
        }).length,
      );
      const jar = st.jar;
      const v = jar?.linvel();
      const w = jar?.angvel();
      canvas.dataset.jar = `live=${st.jarLive.on} calm=${st.jarLive.calm} ${jar?.isSleeping() ? "sleep" : "awake"} v=${Math.hypot(v?.x ?? 0, v?.y ?? 0, v?.z ?? 0).toFixed(3)} w=${Math.hypot(w?.x ?? 0, w?.y ?? 0, w?.z ?? 0).toFixed(3)} y=${jar?.translation().y.toFixed(3)}`;
      canvas.dataset.speeds = [...st.entries.values()]
        .filter((e) => e.body && !e.body.isSleeping())
        .map((e) => {
          const lv = e.body?.linvel();
          return Math.hypot(lv?.x ?? 0, lv?.y ?? 0, lv?.z ?? 0).toFixed(2);
        })
        .join(",");
    }
    const work = performance.now() - t0;
    const before = st.quality.tier;
    st.quality = nextQuality(st.quality, {
      workMs: work,
      visible: document.visibilityState === "visible",
      reducedMotion: false,
    });
    if (st.quality.tier !== before) applySize();
    const active =
      anyAwake() ||
      st.drag !== null ||
      st.shakes.length > 0 ||
      [...st.entries.values()].some((e) => e.vanishing !== 0);
    st.loop.calm = active ? 0 : st.loop.calm + 1;
    if (st.loop.calm < SLEEP_FRAMES_TO_SETTLE) {
      st.loop.raf = requestAnimationFrame(frame);
    } else {
      st.loop.last = 0;
      canvas.dataset.state = "settled";
    }
  };

  const kick = () => {
    if (!st.ready || still || st.loop.raf !== 0 || document.visibilityState !== "visible") return;
    st.loop.calm = 0;
    canvas.dataset.state = "moving";
    st.loop.raf = requestAnimationFrame(frame);
  };

  const settleOffscreen = () => {
    st.spawnQueue.splice(0).forEach((id, i) => {
      const entry = st.entries.get(id);
      if (!entry) return;
      const pose = spawnPose(i, rand4());
      entry.body = makeBody(entry, { ...pose, y: pose.y + i * 0.55 });
      entry.visual.group.visible = true;
    });
    Array.from({ length: STILL_STEPS }).some(() => {
      step();
      return [...st.entries.values()].every((e) => e.body?.isSleeping());
    });
    syncMeshes();
    render();
    canvas.dataset.state = "still";
  };

  const pick = (clientX: number, clientY: number): Entry | null => {
    const sc = st.scene;
    if (!sc) return null;
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, sc.camera);
    const slabs = [...st.entries.values()]
      .filter((e) => e.body && e.vanishing === 0)
      .map((e) => e.visual.slab);
    const hit = raycaster.intersectObjects(slabs, false)[0];
    if (!hit) return null;
    return [...st.entries.values()].find((e) => e.visual.slab === hit.object) ?? null;
  };

  const dragTarget = (clientX: number, clientY: number) => {
    const sc = st.scene;
    const d = st.drag;
    if (!sc || !d) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, sc.camera);
    raycaster.ray.intersectPlane(d.plane, d.target);
  };

  const startDrag = (
    e: PointerEvent,
    id: string | null,
    point: THREE.Vector3,
    anchor: THREE.Vector3 | null,
  ) => {
    const sc = st.scene;
    if (!sc) return;
    canvas.setPointerCapture(e.pointerId);
    const normal = sc.camera.getWorldDirection(new THREE.Vector3()).negate();
    st.drag = {
      id,
      anchor,
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point),
      target: point.clone(),
      start: { x: e.clientX, y: e.clientY, t: performance.now() },
      moved: false,
    };
    wakeAll();
    kick();
  };

  const pickJar = (clientX: number, clientY: number): THREE.Vector3 | null => {
    const sc = st.scene;
    if (!sc) return null;
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, sc.camera);
    return raycaster.intersectObject(sc.jarFront, false)[0]?.point ?? null;
  };

  const onDown = (e: PointerEvent) => {
    if (still || !st.ready || !st.scene) return;
    jarSound.unlock();
    const hit = pick(e.clientX, e.clientY);
    if (hit?.body) {
      const p = hit.body.translation();
      startDrag(e, hit.id, new THREE.Vector3(p.x, p.y, p.z), null);
      return;
    }
    o.onSelect(null);
    const point = pickJar(e.clientX, e.clientY);
    const jar = st.jar;
    if (!point || !jar) return;
    swapJarColliders("pieces");
    jar.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    st.jarLive.on = true;
    st.jarLive.calm = 0;
    const t = jar.translation();
    const r = jar.rotation();
    const anchor = point
      .clone()
      .sub(new THREE.Vector3(t.x, t.y, t.z))
      .applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w).invert());
    startDrag(e, null, point, anchor);
  };

  const onMove = (e: PointerEvent) => {
    const d = st.drag;
    if (!d) return;
    if (Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) > TAP_SLOP_PX) d.moved = true;
    dragTarget(e.clientX, e.clientY);
    kick();
  };

  const onUp = () => {
    const d = st.drag;
    st.drag = null;
    if (!d) return;
    const tap = !d.moved && performance.now() - d.start.t < TAP_MAX_MS;
    if (tap && d.id !== null) o.onSelect(d.id);
    kick();
  };

  const onOrientation = (e: DeviceOrientationEvent) => {
    st.tilt.gamma = e.gamma ?? 0;
    st.tilt.beta = Math.max(-40, Math.min(40, (e.beta ?? 0) - 50));
    applyGravity();
    wakeAll();
    kick();
  };

  canvas.addEventListener("pointerdown", onDown, { signal: abort.signal });
  canvas.addEventListener("pointermove", onMove, { signal: abort.signal });
  canvas.addEventListener("pointerup", onUp, { signal: abort.signal });
  canvas.addEventListener("pointercancel", onUp, { signal: abort.signal });
  document.addEventListener("visibilitychange", () => kick(), { signal: abort.signal });

  const boot = async () => {
    await RAPIER.init();
    if (st.disposed) return;
    const sc = buildScene(canvas);
    const world = new RAPIER.World({ x: 0, y: -JAR3D.gravity, z: 0 });
    world.timestep = STEP / SUBSTEPS;
    world.integrationParameters.numSolverIterations = SOLVER_ITERATIONS;
    st.scene = sc;
    st.world = world;
    st.events = new RAPIER.EventQueue(true);
    buildStatics(world);
    st.jar = buildJar(world);
    swapJarColliders("smooth");
    applySize();
    st.ready = true;
    syncBlocks();
    if (still) settleOffscreen();
    else render();
  };
  void boot();

  return {
    reset: () => {
      if (!still && st.ready) resetAll();
    },
    shake: () => {
      if (still || !st.ready) return;
      jarSound.unlock();
      const now = performance.now();
      st.shakes.push(...JAR_FEEL.shake.pulses.map((p) => ({ at: now + p.at, amp: p.amp })));
      wakeAll();
      kick();
    },
    setTilt: (on) => {
      st.tilt.on = on;
      if (on) window.addEventListener("deviceorientation", onOrientation, { signal: abort.signal });
      else {
        window.removeEventListener("deviceorientation", onOrientation);
        applyGravity();
        wakeAll();
        kick();
      }
    },
    setBlocks: (blocks) => {
      st.desired = blocks;
      syncBlocks();
      if (still && st.ready) settleOffscreen();
    },
    resize: (width, height) => {
      st.size = { width, height };
      applySize();
      if (st.ready) render();
    },
    repaint: () => {
      syncMeshes();
      render();
    },
    dispose: () => {
      st.disposed = true;
      abort.abort();
      cancelAnimationFrame(st.loop.raf);
      st.entries.forEach((e) => e.visual.dispose());
      st.entries.clear();
      st.scene?.dispose();
      st.world?.free();
      st.events?.free();
      jarSound.release();
    },
  };
}
