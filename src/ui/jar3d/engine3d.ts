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
  PHYSICS3D,
  cameraPosition,
  gravityFromOrientation,
  outerRadiusAt,
  spawnPose,
} from "../../core/jar3d.ts";
import type { Sticker } from "../../core/payload.ts";
import { jarSound } from "../jar/sound.ts";
import { loadJarModel } from "./model.ts";
import { createPhysics, type Physics, type Vec } from "./physics-jolt.ts";
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
  readonly setLid: (on: boolean) => void;
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
  body: number | null;
  vanishing: number;
  inside: { pos: THREE.Vector3; rot: THREE.Quaternion } | null;
};

type Kind =
  | { readonly kind: "block"; readonly id: string }
  | { readonly kind: "jar" }
  | { readonly kind: "desk" };

const STEP = 1 / 60;
const AMBIENT_FRAME_MS = 1000 / 30;
const SUBSTEPS = 2;
const MAX_BODY_SPEED = 11 * PHYSICS3D.speedScale;
const DESK_HALF = 9.5;
const JAR_REST_Y = 0.02;
const CLEAR_OUTSIDE = 0.15;
const MOUTH_DEPTH = 0.9;
const LID_ZONE = 0.7;
const LID_INSIDE_MARGIN = 0.35;
const FALL_LIMIT = -6;
const MAX_STEPS_PER_FRAME = 6;
const PROBE_STEPS_PER_FRAME = 16;
const SPAWN_CLEARANCE = 1.15;
const STILL_SPAWN_EVERY = 4;
const STILL_STEPS = 2400;
const SLEEP_FRAMES_TO_SETTLE = 30;
const VANISH_MS = 220;
const TAP_SLOP_PX = 8;
const TAP_MAX_MS = 600;
const DRAG_GAIN = 16 * PHYSICS3D.speedScale;
const DRAG_MAX_SPEED = 16 * PHYSICS3D.speedScale;
const PILE_WINDOW_STEPS = 45;
const PILE_STILL_MOVE = 0.03;
const PILE_STILL_TURN = 0.06;
const JAR_CALM_SPEED = 0.05 * PHYSICS3D.speedScale;
const JAR_CALM_STEPS = 40;
const JAR_PULL = 0.14 * PHYSICS3D.speedScale ** 2;
const JAR_PULL_CAP = 1.4 * PHYSICS3D.speedScale ** 2;
const SOUND_SIDE_PX = 48;
const HIT_SPEED_SCALE = 1 / (60 * 0.5 * PHYSICS3D.speedScale);
const SHAKE_KICK = 3.2 * PHYSICS3D.speedScale;
const SHAKE_LIFT = PHYSICS3D.speedScale;
const SHAKE_SPIN = 0.5 * PHYSICS3D.speedScale;
// the hand that holds the jar, not air: blocks keep near-zero damping
const JAR_HAND_DAMPING = {
  linear: 0.5 * PHYSICS3D.speedScale,
  angular: 1.2 * PHYSICS3D.speedScale,
};
const BLOCK_DAMPING = { linear: 0, angular: 0.05 };
const ZERO: Vec = { x: 0, y: 0, z: 0 };

const rand4 = (): [number, number, number, number] => [
  Math.random(),
  Math.random(),
  Math.random(),
  Math.random(),
];

const probeFlag = (name: string): boolean =>
  Boolean(import.meta.env.VITE_JAR_PROBE) && location.search.includes(name);

const length = (v: Vec) => Math.hypot(v.x, v.y, v.z);

export function createJar3d(o: Jar3dOptions): Jar3dHandle {
  const { canvas, still } = o;
  const abort = new AbortController();
  const st = {
    disposed: false,
    ready: false,
    size: { width: o.width, height: o.height },
    desired: o.blocks,
    scene: null as Scene3d | null,
    physics: null as Physics | null,
    jar: null as number | null,
    lid: false,
    lidWanted: false,
    escapes: 0,
    escapeLog: [] as string[],
    jarLive: { on: false, calm: 0 },
    pileCalm: 0,
    marks: new Map<string, { t: THREE.Vector3; r: THREE.Quaternion }>(),
    steps: 0,
    physicsMs: 0,
    hits: 0,
    entries: new Map<string, Entry>(),
    kinds: new Map<number, Kind>(),
    spawnQueue: [] as string[],
    spawned: 0,
    quality: INITIAL_QUALITY as QualityState,
    loop: { raf: 0, last: 0, acc: 0, calm: 0 },
    ambient: { raf: 0, last: 0 },
    drag: null as null | {
      id: string | null;
      anchor: THREE.Vector3 | null;
      plane: THREE.Plane;
      target: THREE.Vector3;
      start: { x: number; y: number; t: number };
      moved: boolean;
    },
    shakes: [] as { at: number; amp: number }[],
    tilt: { on: false, down: [0, -1, 0] as readonly [number, number, number] },
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
    sc.atmosphere.time.value = performance.now() / 1000;
    sc.renderer.render(sc.scene, sc.camera);
  };

  const applySize = () => {
    const sc = st.scene;
    if (!sc) return;
    const tier = qualityOf(st.quality);
    const cap = import.meta.env.VITE_JAR_PROBE ? 1 : tier.pixelRatioCap;
    sc.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    sc.atmosphere.setPixelRatio(sc.renderer.getPixelRatio());
    sc.atmosphere.group.visible = st.quality.tier < 2;
    sc.renderer.setSize(st.size.width, st.size.height, false);
    const shadows = st.quality.tier < 3;
    if (sc.spot.castShadow === shadows) return;
    sc.spot.castShadow = shadows;
    sc.scene.traverse((o) => {
      const material = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      [material].flat().forEach((m) => {
        if (m) m.needsUpdate = true;
      });
    });
  };

  const buildWorld = (ph: Physics, sc: Scene3d) => {
    const desk = ph.addBox(
      { x: DESK_HALF, y: JAR3D.deskThickness / 2, z: DESK_HALF },
      { x: 0, y: -JAR3D.deskThickness / 2, z: 0 },
      { friction: PHYSICS3D.friction.wood, restitution: PHYSICS3D.restitution.wood },
    );
    st.kinds.set(desk, { kind: "desk" });
    const jar = ph.addJar({
      meshes: sc.collision.map((m) => ({ positions: m.positions, index: m.indices })),
      pieces: sc.pieces,
      density: PHYSICS3D.glassDensity,
      material: { friction: PHYSICS3D.friction.glass, restitution: PHYSICS3D.restitution.glass },
      y: JAR_REST_Y,
      damping: JAR_HAND_DAMPING,
      smooth: !probeFlag("pieces=1"),
      lid: sc.lidPieces,
    });
    st.kinds.set(jar, { kind: "jar" });
    st.jar = jar;
  };

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
    const ph = st.physics;
    if (!ph) return null;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.rx, pose.ry, pose.rz));
    const parts = probeFlag("hull=1") ? [entry.shape.parts.flat()] : entry.shape.parts;
    const body = ph.addBlock({
      hulls: parts.map((part) => hullPoints(entry, part)),
      density: PHYSICS3D.acrylicDensity,
      material: {
        friction: PHYSICS3D.friction.acrylic,
        restitution: PHYSICS3D.restitution.acrylic,
      },
      position: { x: pose.x, y: pose.y, z: pose.z },
      rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
      damping: BLOCK_DAMPING,
      maxSpeed: MAX_BODY_SPEED,
    });
    st.kinds.set(body, { kind: "block", id: entry.id });
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
      inside: null,
    };
    st.entries.set(b.id, entry);
    st.spawnQueue.push(b.id);
  };

  const dropBody = (entry: Entry) => {
    if (entry.body === null) return;
    st.kinds.delete(entry.body);
    st.physics?.remove(entry.body);
    entry.body = null;
    entry.visual.group.visible = false;
  };

  const removeEntry = (entry: Entry) => {
    dropBody(entry);
    st.scene?.scene.remove(entry.visual.group);
    entry.visual.dispose();
    st.entries.delete(entry.id);
  };

  const trySpawn = (entry: Entry): boolean => {
    const ph = st.physics;
    if (!ph) return false;
    const pose = spawnPose(st.spawned, rand4(), st.scene?.spawn.y ?? JAR3D.height + 1.4);
    if (!ph.clearOf({ x: pose.x, y: pose.y, z: pose.z }, SPAWN_CLEARANCE)) return false;
    st.spawned++;
    entry.body = makeBody(entry, pose);
    entry.visual.group.visible = true;
    return true;
  };

  const spawnNext = (): boolean => {
    const id = st.spawnQueue[0];
    if (id === undefined || st.lid) return false;
    const entry = st.entries.get(id);
    if (!entry || entry.body !== null) {
      st.spawnQueue.shift();
      return true;
    }
    if (!trySpawn(entry)) return false;
    st.spawnQueue.shift();
    return true;
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
    const ph = st.physics;
    if (!ph) return;
    const selected = o.selected();
    if (st.jar !== null && st.scene) {
      const t = ph.position(st.jar);
      const r = ph.rotation(st.jar);
      st.scene.jarGroup.position.set(t.x, t.y, t.z);
      st.scene.jarGroup.quaternion.set(r.x, r.y, r.z, r.w);
      const upright = new THREE.Vector3(0, 1, 0).applyQuaternion(st.scene.jarGroup.quaternion).y;
      st.scene.contact.position.set(t.x, st.scene.contact.position.y, t.z);
      (st.scene.contact.material as THREE.MeshBasicMaterial).opacity = Math.max(0, upright) ** 2;
    }
    st.entries.forEach((e) => {
      if (e.body === null) return;
      const t = ph.position(e.body);
      const r = ph.rotation(e.body);
      e.visual.group.position.set(t.x, t.y, t.z);
      e.visual.group.quaternion.set(r.x, r.y, r.z, r.w);
      e.visual.tint.emissive.set(selected === e.id ? 0x4fa6ff : 0x000000);
      e.visual.tint.emissiveIntensity = selected === e.id ? 0.55 : 1;
    });
  };

  const awakeEntries = () =>
    [...st.entries.values()].filter(
      (e) => e.body !== null && st.physics !== null && !st.physics.sleeping(e.body),
    );

  const anyAwake = () => awakeEntries().length > 0 || st.jarLive.on || st.spawnQueue.length > 0;

  const applyGravity = () => {
    const ph = st.physics;
    if (!ph) return;
    const g = PHYSICS3D.gravity;
    const [x, y, z] = st.tilt.on ? st.tilt.down : [0, -1, 0];
    ph.setGravity({ x: g * x, y: g * y, z: g * z });
  };

  const wakeAll = () =>
    st.entries.forEach((e) => {
      if (e.body !== null) st.physics?.wake(e.body);
    });

  const jarDragStep = (d: NonNullable<typeof st.drag>) => {
    const ph = st.physics;
    const jar = st.jar;
    if (!ph || jar === null || !d.anchor) return;
    const t = ph.position(jar);
    const r = ph.rotation(jar);
    const world = new THREE.Vector3()
      .copy(d.anchor)
      .applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w))
      .add(new THREE.Vector3(t.x, t.y, t.z));
    const mass = ph.mass(jar);
    const push = new THREE.Vector3().subVectors(d.target, world).multiplyScalar(JAR_PULL * mass);
    const cap = JAR_PULL_CAP * mass;
    if (push.length() > cap) push.setLength(cap);
    ph.impulse(jar, push, world);
  };

  const dragStep = () => {
    const d = st.drag;
    const ph = st.physics;
    if (!d || !ph) return;
    if (d.id === null) {
      jarDragStep(d);
      return;
    }
    const body = st.entries.get(d.id)?.body;
    if (body === undefined || body === null) return;
    const p = ph.position(body);
    const v = {
      x: (d.target.x - p.x) * DRAG_GAIN,
      y: (d.target.y - p.y) * DRAG_GAIN,
      z: (d.target.z - p.z) * DRAG_GAIN,
    };
    const speed = length(v);
    const k = speed > DRAG_MAX_SPEED ? DRAG_MAX_SPEED / speed : 1;
    ph.setVelocity(body, { x: v.x * k, y: v.y * k, z: v.z * k }, ZERO);
  };

  const runShakes = (now: number) => {
    const ph = st.physics;
    if (!ph) return;
    const due = st.shakes.filter((s) => s.at <= now);
    st.shakes = st.shakes.filter((s) => s.at > now);
    due.forEach((s) => {
      jarSound.rattle(s.amp);
      st.entries.forEach((e) => {
        const body = e.body;
        if (body === null) return;
        const mass = ph.mass(body);
        ph.impulse(body, {
          x: (Math.random() - 0.5) * 2 * SHAKE_KICK * mass * s.amp,
          y: (3 + Math.random() * 5) * SHAKE_LIFT * mass * s.amp,
          z: (Math.random() - 0.5) * 2 * SHAKE_KICK * mass * s.amp,
        });
        ph.angularImpulse(body, {
          x: (Math.random() - 0.5) * mass * SHAKE_SPIN * s.amp,
          y: (Math.random() - 0.5) * mass * SHAKE_SPIN * s.amp,
          z: (Math.random() - 0.5) * mass * SHAKE_SPIN * s.amp,
        });
      });
    });
  };

  const drainHits = () => {
    const hits = st.physics?.drainHits() ?? [];
    st.hits += hits.length;
    if (!jarSound.listening()) return;
    hits.forEach((h) => {
      const a = st.kinds.get(h.a);
      const b = st.kinds.get(h.b);
      if (!a || !b) return;
      const surface =
        a.kind === "block" && b.kind === "block"
          ? "block"
          : a.kind === "desk" || b.kind === "desk"
            ? "base"
            : "glass";
      jarSound.hit(surface, h.speed * HIT_SPEED_SCALE, SOUND_SIDE_PX);
    });
  };

  const freezeJarWhenCalm = () => {
    const ph = st.physics;
    const jar = st.jar;
    if (!ph || jar === null || !st.jarLive.on || st.drag?.id === null) return;
    const calm = length(ph.linvel(jar)) < JAR_CALM_SPEED && length(ph.angvel(jar)) < JAR_CALM_SPEED;
    st.jarLive.calm = calm ? st.jarLive.calm + 1 : 0;
    if (st.jarLive.calm < JAR_CALM_STEPS) return;
    ph.setJarDynamic(false);
    st.jarLive.on = false;
  };

  const poseOf = (body: number) => {
    const ph = st.physics;
    const t = ph?.position(body) ?? ZERO;
    const r = ph?.rotation(body) ?? { x: 0, y: 0, z: 0, w: 1 };
    return { t: new THREE.Vector3(t.x, t.y, t.z), r: new THREE.Quaternion(r.x, r.y, r.z, r.w) };
  };

  const sleepPileWhenCalm = () => {
    if (probeFlag("pilesleep=0")) return;
    const awake = awakeEntries();
    if (
      st.drag !== null ||
      st.shakes.length > 0 ||
      st.lid !== st.lidWanted ||
      st.spawnQueue.length > 0 ||
      awake.length === 0
    ) {
      st.pileCalm = 0;
      st.marks.clear();
      return;
    }
    st.pileCalm++;
    if (st.pileCalm < PILE_WINDOW_STEPS) return;
    st.pileCalm = 0;
    const still = awake.every((e) => {
      const mark = st.marks.get(e.id);
      if (e.body === null || !mark) return false;
      const now = poseOf(e.body);
      return now.t.distanceTo(mark.t) < PILE_STILL_MOVE && now.r.angleTo(mark.r) < PILE_STILL_TURN;
    });
    st.marks.clear();
    if (still) {
      awake.forEach((e) => {
        if (e.body !== null) st.physics?.sleep(e.body);
      });
      return;
    }
    awake.forEach((e) => {
      if (e.body !== null) st.marks.set(e.id, poseOf(e.body));
    });
  };

  const step = (seconds: number) => {
    const ph = st.physics;
    if (!ph) return;
    dragStep();
    ph.step(seconds, st.jarLive.on ? SUBSTEPS * 2 : SUBSTEPS);
    st.steps++;
    drainHits();
    freezeJarWhenCalm();
    sleepPileWhenCalm();
  };

  const standJarUp = () => {
    const ph = st.physics;
    if (!ph) return;
    ph.setJarDynamic(false);
    ph.placeJar({ x: 0, y: JAR_REST_Y, z: 0 });
    st.jarLive.on = false;
  };

  const rescueStrays = () => {
    const ph = st.physics;
    if (!ph) return;
    st.entries.forEach((e) => {
      if (e.body !== null && ph.position(e.body).y < FALL_LIMIT) {
        dropBody(e);
        st.spawnQueue.push(e.id);
      }
    });
    if (st.jar !== null && ph.position(st.jar).y < FALL_LIMIT) standJarUp();
  };

  const jarLocal = (p: Vec): THREE.Vector3 => {
    const ph = st.physics;
    if (!ph || st.jar === null) return new THREE.Vector3(p.x, p.y, p.z);
    const t = ph.position(st.jar);
    const r = ph.rotation(st.jar);
    return new THREE.Vector3(p.x - t.x, p.y - t.y, p.z - t.z).applyQuaternion(
      new THREE.Quaternion(r.x, r.y, r.z, r.w).invert(),
    );
  };

  const glassRegion = (local: THREE.Vector3): "inside" | "outside" | "wall" => {
    const sc = st.scene;
    if (!sc) return "inside";
    const top = sc.jarHeight - (st.lid ? LID_INSIDE_MARGIN : 0);
    const radius = Math.hypot(local.x, local.z);
    const inner = sc.innerRadiusAt(Math.min(top, Math.max(0, local.y)));
    if (local.y > JAR3D.baseThickness && local.y < top && radius < inner) return "inside";
    if (local.y < -CLEAR_OUTSIDE || radius > inner + JAR3D.wall + CLEAR_OUTSIDE) return "outside";
    return "wall";
  };

  const jarPose = () => {
    const ph = st.physics;
    if (!ph || st.jar === null) return { t: new THREE.Vector3(), r: new THREE.Quaternion() };
    const t = ph.position(st.jar);
    const r = ph.rotation(st.jar);
    return { t: new THREE.Vector3(t.x, t.y, t.z), r: new THREE.Quaternion(r.x, r.y, r.z, r.w) };
  };

  const keepContained = () => {
    const ph = st.physics;
    const sc = st.scene;
    if (!ph || !sc) return;
    const jar = jarPose();
    const toJar = jar.r.clone().invert();
    st.entries.forEach((e) => {
      if (e.body === null) return;
      const p = ph.position(e.body);
      const r = ph.rotation(e.body);
      const local = new THREE.Vector3(p.x, p.y, p.z).sub(jar.t).applyQuaternion(toJar);
      const region = glassRegion(local);
      if (region === "wall") return;
      if (region === "inside") {
        e.inside = {
          pos: local,
          rot: toJar.clone().multiply(new THREE.Quaternion(r.x, r.y, r.z, r.w)),
        };
        return;
      }
      const viaMouth = !st.lid && local.y > sc.jarHeight - MOUTH_DEPTH;
      if (!e.inside || viaMouth) {
        e.inside = null;
        return;
      }
      const back = e.inside.pos.clone().applyQuaternion(jar.r).add(jar.t);
      const turn = jar.r.clone().multiply(e.inside.rot);
      ph.place(e.body, back, { x: turn.x, y: turn.y, z: turn.z, w: turn.w });
      const v = st.jar === null ? { x: 0, y: 0, z: 0 } : ph.linvel(st.jar);
      ph.setVelocity(e.body, v, { x: 0, y: 0, z: 0 });
      st.escapes++;
      if (import.meta.env.VITE_JAR_PROBE)
        st.escapeLog = [
          ...st.escapeLog.slice(-7),
          `${Math.hypot(local.x, local.z).toFixed(2)}@${local.y.toFixed(2)}`,
        ];
    });
  };

  const neckClear = (): boolean => {
    const ph = st.physics;
    const sc = st.scene;
    if (!ph || !sc) return false;
    const jar = jarPose();
    const toJar = jar.r.clone().invert();
    return [...st.entries.values()].every((e) => {
      if (e.body === null) return true;
      const p = ph.position(e.body);
      return (
        new THREE.Vector3(p.x, p.y, p.z).sub(jar.t).applyQuaternion(toJar).y <
        sc.jarHeight - LID_ZONE
      );
    });
  };

  const applyLid = () => {
    const ph = st.physics;
    const sc = st.scene;
    if (!ph || !sc || st.lid === st.lidWanted) return;
    if (st.lidWanted && (st.spawnQueue.length > 0 || !neckClear())) return;
    st.lid = st.lidWanted;
    ph.setLid(st.lid);
    if (sc.lid) sc.lid.visible = st.lid;
    wakeAll();
  };

  const setLid = (on: boolean) => {
    st.lidWanted = on;
    applyLid();
    kick();
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

  const writeProbe = () => {
    const ph = st.physics;
    if (!ph) return;
    const awake = awakeEntries();
    canvas.dataset.awake = String(awake.length);
    canvas.dataset.leaked = String(
      [...st.entries.values()].filter((e) => {
        if (e.body === null) return false;
        const t = jarLocal(ph.position(e.body));
        return (
          Math.hypot(t.x, t.z) > outerRadiusAt(Math.min(JAR3D.height, Math.max(0, t.y))) &&
          t.y < JAR3D.height - 0.2
        );
      }).length,
    );
    canvas.dataset.leakinfo = [...st.entries.values()]
      .filter((e) => e.body !== null)
      .map((e) => {
        const t = jarLocal(ph.position(e.body ?? 0));
        return `${Math.hypot(t.x, t.z).toFixed(2)}@${t.y.toFixed(2)}/${st.scene?.innerRadiusAt(t.y).toFixed(2)}/${e.inside ? 1 : 0}`;
      })
      .join(" ");
    canvas.dataset.embedded = String(
      [...st.entries.values()].filter((e) => {
        if (e.body === null) return false;
        const t = ph.position(e.body);
        const r = Math.hypot(t.x, t.z);
        const outer = outerRadiusAt(Math.min(JAR3D.height, Math.max(0, t.y)));
        return r > outer - JAR3D.wall && r <= outer && t.y < JAR3D.height - 0.2;
      }).length,
    );
    canvas.dataset.steps = String(st.steps);
    canvas.dataset.physicsMs = st.physicsMs.toFixed(1);
    canvas.dataset.physics = "jolt";
    canvas.dataset.hits = String(st.hits);
    canvas.dataset.escapes = `${st.escapes} ${st.escapeLog.join(" ")}`;
    canvas.dataset.queue = String(st.spawnQueue.length);
    canvas.dataset.calm = String(st.pileCalm);
    const jar = st.jar;
    if (jar !== null) {
      canvas.dataset.jar = `live=${st.jarLive.on} calm=${st.jarLive.calm} ${ph.sleeping(jar) ? "sleep" : "awake"} v=${length(ph.linvel(jar)).toFixed(3)} w=${length(ph.angvel(jar)).toFixed(3)} y=${ph.position(jar).y.toFixed(3)}`;
    }
    canvas.dataset.speeds = awake
      .map((e) =>
        e.body === null
          ? ""
          : `${length(ph.linvel(e.body)).toFixed(2)}/${length(ph.angvel(e.body)).toFixed(2)}`,
      )
      .join(",");
  };

  const frame = (now: number) => {
    st.loop.raf = 0;
    if (st.disposed) return;
    if (st.scene) st.scene.renderer.shadowMap.autoUpdate = true;
    const t0 = performance.now();
    runShakes(now);
    spawnNext();
    st.entries.forEach((e) => {
      if (e.vanishing === 0) return;
      const age = now - e.vanishing;
      if (age >= VANISH_MS) removeEntry(e);
      else e.visual.group.scale.setScalar(Math.max(0.01, 1 - age / VANISH_MS));
    });
    // probe builds keep the step fixed so slow software rendering cannot change the simulation
    const stepSeconds = import.meta.env.VITE_JAR_PROBE ? STEP : 1 / qualityOf(st.quality).stepHz;
    const dt = st.loop.last === 0 ? stepSeconds : Math.min((now - st.loop.last) / 1000, 0.1);
    st.loop.last = now;
    st.loop.acc += dt;
    const due = import.meta.env.VITE_JAR_PROBE
      ? PROBE_STEPS_PER_FRAME
      : Math.min(MAX_STEPS_PER_FRAME, Math.floor(st.loop.acc / stepSeconds));
    st.loop.acc = due === MAX_STEPS_PER_FRAME ? 0 : st.loop.acc - due * stepSeconds;
    const p0 = performance.now();
    Array.from({ length: due }).forEach(() => step(stepSeconds));
    st.physicsMs += performance.now() - p0;
    rescueStrays();
    keepContained();
    applyLid();
    syncMeshes();
    render();
    if (import.meta.env.VITE_JAR_PROBE) writeProbe();
    const work = performance.now() - t0;
    const before = st.quality.tier;
    const pinned = import.meta.env.VITE_JAR_PROBE && location.search.includes("tier=0");
    if (!pinned)
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
      startAmbient();
    }
  };

  const ambientFrame = (now: number) => {
    st.ambient.raf = 0;
    const sc = st.scene;
    if (!sc || st.disposed || still || st.loop.raf !== 0 || !sc.atmosphere.group.visible) return;
    if (document.visibilityState !== "visible") return;
    if (now - st.ambient.last >= AMBIENT_FRAME_MS) {
      st.ambient.last = now;
      sc.renderer.shadowMap.autoUpdate = false;
      render();
    }
    st.ambient.raf = requestAnimationFrame(ambientFrame);
  };

  const startAmbient = () => {
    if (st.ambient.raf === 0 && !still) st.ambient.raf = requestAnimationFrame(ambientFrame);
  };

  const kick = () => {
    if (!st.ready || still || st.loop.raf !== 0 || document.visibilityState !== "visible") return;
    st.loop.calm = 0;
    canvas.dataset.state = "moving";
    st.loop.raf = requestAnimationFrame(frame);
  };

  const settleOffscreen = () => {
    const tries = { n: 0 };
    Array.from({ length: STILL_STEPS }).some(() => {
      if (st.spawnQueue.length > 0 && tries.n++ % STILL_SPAWN_EVERY === 0) spawnNext();
      step(STEP);
      return st.spawnQueue.length === 0 && awakeEntries().length === 0;
    });
    syncMeshes();
    render();
    canvas.dataset.state = "still";
  };

  const rayFrom = (clientX: number, clientY: number, sc: Scene3d) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, sc.camera);
  };

  const pick = (clientX: number, clientY: number): Entry | null => {
    const sc = st.scene;
    if (!sc) return null;
    rayFrom(clientX, clientY, sc);
    const slabs = [...st.entries.values()]
      .filter((e) => e.body !== null && e.vanishing === 0)
      .map((e) => e.visual.slab);
    const hit = raycaster.intersectObjects(slabs, false)[0];
    if (!hit) return null;
    return [...st.entries.values()].find((e) => e.visual.slab === hit.object) ?? null;
  };

  const dragTarget = (clientX: number, clientY: number) => {
    const sc = st.scene;
    const d = st.drag;
    if (!sc || !d) return;
    rayFrom(clientX, clientY, sc);
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
    rayFrom(clientX, clientY, sc);
    return raycaster.intersectObject(sc.jarGroup, true)[0]?.point ?? null;
  };

  const onDown = (e: PointerEvent) => {
    const ph = st.physics;
    if (still || !st.ready || !st.scene || !ph) return;
    jarSound.unlock();
    const hit = pick(e.clientX, e.clientY);
    if (hit && hit.body !== null) {
      const p = ph.position(hit.body);
      startDrag(e, hit.id, new THREE.Vector3(p.x, p.y, p.z), null);
      return;
    }
    o.onSelect(null);
    const point = pickJar(e.clientX, e.clientY);
    const jar = st.jar;
    if (!point || jar === null) return;
    ph.setJarDynamic(true);
    st.jarLive.on = true;
    st.jarLive.calm = 0;
    const t = ph.position(jar);
    const r = ph.rotation(jar);
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
    st.tilt.down = gravityFromOrientation(
      e.beta ?? 90,
      e.gamma ?? 0,
      screen.orientation?.angle ?? 0,
    );
    applyGravity();
    wakeAll();
    kick();
  };

  canvas.addEventListener("pointerdown", onDown, { signal: abort.signal });
  canvas.addEventListener("pointermove", onMove, { signal: abort.signal });
  canvas.addEventListener("pointerup", onUp, { signal: abort.signal });
  canvas.addEventListener("pointercancel", onUp, { signal: abort.signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      kick();
      startAmbient();
    },
    { signal: abort.signal },
  );

  const boot = async () => {
    const ph = await createPhysics(PHYSICS3D.gravity);
    if (st.disposed) {
      ph.free();
      return;
    }
    const model = await loadJarModel();
    if (st.disposed) {
      ph.free();
      return;
    }
    const sc = buildScene(canvas, model);
    st.scene = sc;
    st.physics = ph;
    buildWorld(ph, sc);
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
    setLid: (on) => {
      if (st.ready) setLid(on);
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
      cancelAnimationFrame(st.ambient.raf);
      st.entries.forEach((e) => e.visual.dispose());
      st.entries.clear();
      st.scene?.dispose();
      st.physics?.free();
      st.physics = null;
      jarSound.release();
    },
  };
}
