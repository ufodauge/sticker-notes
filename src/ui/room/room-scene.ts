import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// A prototype (debug builds only, `?room`): the desk seen from above at a slant, in three
// dimensions. On it, on a grid, things that can be moved about: open albums, a laptop whose lid
// opens and shuts; beside it a bookshelf the albums are taken from and put back on; at the back a
// window with a plant, the sun coming in by the hour and the time of year, and the weather
// outside. Everything is drawn from code (no image files). Not part of the app: a way to feel the
// idea before deciding on it.

export type Weather = "clear" | "cloudy" | "rain" | "snow";

export type RoomOptions = {
  // lighter drawing for a weak device: no shadows, fewer pixels
  readonly light: boolean;
};

export type Room = {
  readonly setTime: (hour: number, month: number) => void;
  readonly setWeather: (w: Weather) => void;
  readonly setEditing: (on: boolean) => void;
  // frames per second over the last second (to tell a weak device)
  readonly fps: () => number;
  readonly dispose: () => void;
};

// the desk's grid: cells of 0.25 (a quarter of the desk's depth unit)
const CELL = 0.25;
const COLS = 12;
const ROWS = 6;
const DESK = { w: COLS * CELL, d: ROWS * CELL, top: 0.75 };

type Footprint = { readonly cols: number; readonly rows: number };
type Item = {
  readonly id: string;
  readonly object: THREE.Object3D;
  readonly size: Footprint;
  readonly cell: { col: number; row: number };
  readonly kind: "album" | "laptop" | "mug" | "lamp";
};

const wood = (base: string, dark: string, w = 512, h = 256): THREE.CanvasTexture => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    Array.from({ length: 90 }, (_, i) => i).forEach((i) => {
      const y = (i / 90) * h + Math.sin(i * 7.3) * 3;
      g.strokeStyle = dark;
      g.globalAlpha = 0.08 + ((i * 37) % 10) / 80;
      g.lineWidth = 1 + ((i * 13) % 3);
      g.beginPath();
      g.moveTo(0, y);
      Array.from({ length: 9 }, (_, k) => k).forEach((k) =>
        g.lineTo((k / 8) * w, y + Math.sin(k * 1.7 + i) * 2.5),
      );
      g.stroke();
    });
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
};

// the album's paper: a fine grid, with a few stickers (dots of colour) stuck on
const pageTexture = (seed: number): THREE.CanvasTexture => {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 340;
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 256, 340);
    g.strokeStyle = "#e4e4e4";
    Array.from({ length: 20 }, (_, i) => i).forEach((i) => {
      g.beginPath();
      g.moveTo(i * 13, 0);
      g.lineTo(i * 13, 340);
      g.moveTo(0, i * 17);
      g.lineTo(256, i * 17);
      g.stroke();
    });
    const colours = ["#e85d75", "#5db7e8", "#8ccf5d", "#f2c14e", "#a47be0"];
    Array.from({ length: 3 }, (_, i) => i).forEach((i) => {
      const x = 40 + ((seed * 97 + i * 71) % 170);
      const y = 50 + ((seed * 53 + i * 113) % 230);
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(x, y, 24, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = colours[(seed + i) % colours.length] ?? "#e85d75";
      g.beginPath();
      g.arc(x, y, 20, 0, Math.PI * 2);
      g.fill();
    });
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const COVERS = ["#34475f", "#7a3b3b", "#3f6b4a", "#6b5a8a", "#b0813a"];

function makeAlbum(seed: number): THREE.Group {
  const g = new THREE.Group();
  const cover = new THREE.Mesh(
    new THREE.BoxGeometry(0.98, 0.02, 0.68),
    new THREE.MeshStandardMaterial({ color: COVERS[seed % COVERS.length], roughness: 0.8 }),
  );
  cover.position.y = 0.01;
  cover.castShadow = true;
  cover.receiveShadow = true;
  g.add(cover);
  [-1, 1].forEach((side) => {
    const page = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.012, 0.64),
      new THREE.MeshStandardMaterial({ map: pageTexture(seed * 2 + side), roughness: 0.95 }),
    );
    page.position.set(side * 0.235, 0.028, 0);
    page.rotation.z = side * -0.04;
    page.castShadow = true;
    page.receiveShadow = true;
    g.add(page);
  });
  return g;
}

function makeLaptop(): { group: THREE.Group; lid: THREE.Group; screen: THREE.Mesh } {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({
    color: "#c9ccd1",
    metalness: 0.6,
    roughness: 0.35,
  });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.42), metal);
  base.position.y = 0.01;
  base.castShadow = true;
  group.add(base);
  const keys = new THREE.Mesh(
    new THREE.PlaneGeometry(0.54, 0.22),
    new THREE.MeshStandardMaterial({ color: "#2a2c30", roughness: 0.9 }),
  );
  keys.rotation.x = -Math.PI / 2;
  keys.position.set(0, 0.021, -0.04);
  group.add(keys);
  // the lid hinges at the back edge
  const lid = new THREE.Group();
  lid.position.set(0, 0.02, -0.21);
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.012, 0.42), metal);
  shell.position.set(0, 0.006, 0.21);
  shell.castShadow = true;
  lid.add(shell);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 0.36),
    new THREE.MeshStandardMaterial({ color: "#0d1117", emissive: "#b9c9dc", emissiveIntensity: 0 }),
  );
  screen.rotation.x = Math.PI / 2;
  screen.position.set(0, -0.001, 0.21);
  lid.add(screen);
  group.add(lid);
  return { group, lid, screen };
}

function makePlant(): THREE.Group {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.12, 0.28, 20),
    new THREE.MeshStandardMaterial({ color: "#b5643c", roughness: 0.9 }),
  );
  pot.position.y = 0.14;
  pot.castShadow = true;
  g.add(pot);
  const leaf = new THREE.MeshStandardMaterial({
    color: "#3e7d3a",
    roughness: 0.7,
    side: THREE.DoubleSide,
  });
  Array.from({ length: 14 }, (_, i) => i).forEach((i) => {
    const blade = new THREE.Mesh(new THREE.CircleGeometry(0.09, 10), leaf);
    const a = (i / 14) * Math.PI * 2;
    const h = 0.32 + ((i * 7) % 5) * 0.07;
    blade.position.set(Math.cos(a) * 0.12, h, Math.sin(a) * 0.12);
    blade.scale.set(0.7, 1.4, 1);
    blade.lookAt(Math.cos(a) * 0.6, h + 0.3, Math.sin(a) * 0.6);
    blade.castShadow = true;
    g.add(blade);
  });
  return g;
}

// sun: how high and from where, by the hour (0..24) and month (1..12), for a window facing south
function sunOf(hour: number, month: number): { up: number; across: number; day: boolean } {
  // longer days in summer: from about 5:30 to 18:30 in June, 7:00 to 16:30 in December
  // 1 in June, 0 in December
  const summer = 0.5 + 0.5 * Math.cos(((month - 6) / 6) * Math.PI);
  const rise = 7 - summer * 1.5;
  const set = 16.5 + summer * 2;
  const t = (hour - rise) / (set - rise);
  const day = t > 0 && t < 1;
  const peak = 0.45 + summer * 0.5; // radians: the noon sun higher in summer
  const up = day ? Math.sin(t * Math.PI) * peak : 0;
  const across = (t - 0.5) * 2; // -1 morning (east) .. 1 evening (west)
  return { up, across, day };
}

export function createRoom(host: HTMLElement, options: RoomOptions): Room {
  const renderer = new THREE.WebGLRenderer({ antialias: !options.light });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, options.light ? 1 : 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.shadowMap.enabled = !options.light;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#2b2420");

  // where things are: the desk pushed against the wall under a big window
  const deskBackZ = -1.0;
  // the room's wall runs just behind the desk; in it, a window seat: a recess whose side walls
  // narrow toward the back, with a seat at about the desk's height and the window at its back.
  // The desk is pushed up against the seat; the plant stands on the seat
  const roomWallZ = deskBackZ - 0.02;
  const seatDepth = 0.9;
  const wallZ = roomWallZ - seatDepth;
  const seatFront = DESK.w + 0.1;
  const seatBack = seatFront * 0.68;
  const seatTop = DESK.top - 0.05;
  const WALL_H = 6;
  const deskCentreZ = deskBackZ + 0.05 + DESK.d / 2;
  const deskFrontZ = deskBackZ + 0.1 + DESK.d;

  // seen from above at a steep slant, as one sitting at the desk; no turning round, only
  // coming closer (pinch, wheel) and moving across (drag)
  const camera = new THREE.PerspectiveCamera(42, host.clientWidth / host.clientHeight, 0.1, 50);
  const home = new THREE.Vector3(0, DESK.top + 3.1, deskFrontZ + 1.1);
  camera.position.copy(home);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, DESK.top, deskCentreZ - 0.2);
  controls.enableRotate = false;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  controls.minDistance = 0.9;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.enableDamping = true;
  // never wandering off the desk
  controls.addEventListener("change", () => {
    const t = controls.target;
    const cx = THREE.MathUtils.clamp(t.x, -DESK.w / 2, DESK.w / 2);
    const cz = THREE.MathUtils.clamp(t.z, deskBackZ, deskFrontZ);
    if (cx !== t.x || cz !== t.z) {
      camera.position.x += cx - t.x;
      camera.position.z += cz - t.z;
      t.x = cx;
      t.z = cz;
    }
  });
  controls.update();

  // the floor, in the room only: through the window there is only the sky
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 6),
    new THREE.MeshStandardMaterial({ map: wood("#6b4a33", "#3a2618"), roughness: 0.85 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = roomWallZ + 3;
  floor.receiveShadow = true;
  scene.add(floor);
  const wallMat = new THREE.MeshStandardMaterial({ color: "#e9e2d6", roughness: 0.95 });
  // the room's wall, on both sides of the recess
  [
    [-5, -seatFront / 2],
    [seatFront / 2, 5],
  ].forEach(([x0 = 0, x1 = 0]) => {
    // solid back to the window's line (the recess is cut into it), and taller than where one
    // looks from, so nothing is seen over it
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(x1 - x0, WALL_H, roomWallZ - wallZ + 0.1),
      wallMat,
    );
    m.position.set((x0 + x1) / 2, WALL_H / 2, (roomWallZ + wallZ) / 2);
    m.receiveShadow = true;
    scene.add(m);
  });
  // the recess's side walls, closing in toward the window
  const slant = (seatFront - seatBack) / 2;
  const sideLength = Math.hypot(slant, seatDepth);
  [-1, 1].forEach((side) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.08, WALL_H, sideLength), wallMat);
    wall.position.set(
      (side * (seatFront / 2 + seatBack / 2)) / 2,
      WALL_H / 2,
      (roomWallZ + wallZ) / 2,
    );
    wall.rotation.y = Math.atan2(side * slant, seatDepth);
    wall.receiveShadow = true;
    wall.castShadow = true;
    scene.add(wall);
  });
  // the seat: a board over the recess's floor, cut to its shape
  const seatShape = new THREE.Shape();
  seatShape.moveTo(-seatFront / 2, -roomWallZ);
  seatShape.lineTo(seatFront / 2, -roomWallZ);
  seatShape.lineTo(seatBack / 2, -wallZ);
  seatShape.lineTo(-seatBack / 2, -wallZ);
  seatShape.closePath();
  const seat = new THREE.Mesh(
    new THREE.ExtrudeGeometry(seatShape, { depth: seatTop, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color: "#efe9df", roughness: 0.8 }),
  );
  seat.rotation.x = -Math.PI / 2;
  seat.receiveShadow = true;
  seat.castShadow = true;
  scene.add(seat);
  // the window at the recess's back: from just above the seat up, its frame throwing a cross
  // over the seat and the desk
  const win = { x: 0, y: seatTop + 1.0, w: seatBack - 0.04, h: 1.8 };
  const above = new THREE.Mesh(
    new THREE.BoxGeometry(seatFront, WALL_H - (win.y + win.h / 2), 0.1),
    wallMat,
  );
  above.position.set(0, (WALL_H + win.y + win.h / 2) / 2, wallZ);
  scene.add(above);
  const frameMat = new THREE.MeshStandardMaterial({ color: "#f5f2ec", roughness: 0.6 });
  const bars: readonly (readonly [number, number, number, number])[] = [
    [win.x, win.y + win.h / 2, win.w, 0.08],
    [win.x, win.y - win.h / 2, win.w, 0.08],
    [win.x - win.w / 2, win.y, 0.08, win.h],
    [win.x + win.w / 2, win.y, 0.08, win.h],
    [win.x, win.y + 0.1, win.w, 0.06],
    [win.x, win.y, 0.06, win.h],
  ];
  bars.forEach(([x, y, w, h]) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), frameMat);
    bar.position.set(x, y, wallZ);
    bar.castShadow = true;
    scene.add(bar);
  });
  const skyMat = new THREE.MeshBasicMaterial({ color: "#9cc9f0" });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(12, 7), skyMat);
  sky.position.set(win.x, win.y, wallZ - 3);
  scene.add(sky);

  // the desk, with a drawer in its front
  const deskTex = wood("#b07a4f", "#6e4527");
  deskTex.repeat.set(2, 1);
  const deskWood = new THREE.MeshStandardMaterial({ map: deskTex, roughness: 0.7 });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(DESK.w + 0.2, 0.06, DESK.d + 0.2), deskWood);
  desk.position.set(0, DESK.top - 0.03, deskCentreZ);
  desk.receiveShadow = true;
  desk.castShadow = true;
  scene.add(desk);
  const apronMat = new THREE.MeshStandardMaterial({ color: "#8a5a36", roughness: 0.75 });
  const apron = new THREE.Mesh(new THREE.BoxGeometry(DESK.w + 0.2, 0.18, 0.04), apronMat);
  apron.position.set(0, DESK.top - 0.15, deskFrontZ);
  apron.castShadow = true;
  scene.add(apron);
  const drawerFront = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.13, 0.02),
    new THREE.MeshStandardMaterial({ color: "#9a6a42", roughness: 0.7 }),
  );
  drawerFront.position.set(-DESK.w / 2 + 0.7, DESK.top - 0.15, deskFrontZ + 0.025);
  scene.add(drawerFront);
  const knob = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.03, 16),
    new THREE.MeshStandardMaterial({ color: "#d9b46a", metalness: 0.7, roughness: 0.3 }),
  );
  knob.rotation.x = Math.PI / 2;
  knob.position.set(drawerFront.position.x, DESK.top - 0.15, deskFrontZ + 0.05);
  scene.add(knob);
  const legMat = new THREE.MeshStandardMaterial({ color: "#7a5234", roughness: 0.8 });
  [-1, 1].forEach((sx) =>
    [-1, 1].forEach((sz) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, DESK.top - 0.06, 0.07), legMat);
      leg.position.set(sx * (DESK.w / 2), (DESK.top - 0.06) / 2, deskCentreZ + sz * (DESK.d / 2));
      leg.castShadow = true;
      scene.add(leg);
    }),
  );
  const deskOrigin = new THREE.Vector3(-DESK.w / 2, DESK.top, deskBackZ + 0.05);
  const cellCentre = (col: number, row: number, size: Footprint) =>
    new THREE.Vector3(
      deskOrigin.x + (col + size.cols / 2) * CELL,
      DESK.top,
      deskOrigin.z + (row + size.rows / 2) * CELL,
    );

  // the grid, shown while things are being moved
  const grid = new THREE.Group();
  const gridMat = new THREE.LineBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0.35,
  });
  const gridPoints = [
    ...Array.from({ length: COLS + 1 }, (_, c) => [
      new THREE.Vector3(deskOrigin.x + c * CELL, DESK.top + 0.002, deskOrigin.z),
      new THREE.Vector3(deskOrigin.x + c * CELL, DESK.top + 0.002, deskOrigin.z + DESK.d),
    ]),
    ...Array.from({ length: ROWS + 1 }, (_, r) => [
      new THREE.Vector3(deskOrigin.x, DESK.top + 0.002, deskOrigin.z + r * CELL),
      new THREE.Vector3(deskOrigin.x + DESK.w, DESK.top + 0.002, deskOrigin.z + r * CELL),
    ]),
  ].flat();
  grid.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gridPoints), gridMat));
  grid.visible = false;
  scene.add(grid);

  // the book stand on the desk: the albums stand between two bookends
  const stand = new THREE.Group();
  const endMat = new THREE.MeshStandardMaterial({
    color: "#3a3f44",
    metalness: 0.5,
    roughness: 0.4,
  });
  [-0.2, 0.2].forEach((x) => {
    const end = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.36, 0.2), endMat);
    end.position.set(x, 0.18, 0);
    end.castShadow = true;
    stand.add(end);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.008, 0.2), endMat);
    foot.position.set(x + (x < 0 ? 0.06 : -0.06), 0.004, 0);
    stand.add(foot);
  });

  // the albums: each either standing in the stand (a spine) or open on the desk
  type Album = { seed: number; spine: THREE.Mesh; open: THREE.Group | null };
  const albums: Album[] = Array.from({ length: 5 }, (_, i) => {
    const spine = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.34, 0.24),
      new THREE.MeshStandardMaterial({ color: COVERS[i % COVERS.length], roughness: 0.8 }),
    );
    spine.position.set(-0.15 + i * 0.075, 0.17, 0);
    spine.rotation.z = i === 4 ? -0.08 : 0;
    spine.castShadow = true;
    spine.userData = { album: i };
    stand.add(spine);
    return { seed: i, spine, open: null };
  });

  // things on the desk
  const items: Item[] = [];
  const occupied = (except: string | null) => items.filter((it) => it.id !== except);
  const fits = (col: number, row: number, size: Footprint, except: string | null) =>
    col >= 0 &&
    row >= 0 &&
    col + size.cols <= COLS &&
    row + size.rows <= ROWS &&
    occupied(except).every(
      (o) =>
        col + size.cols <= o.cell.col ||
        o.cell.col + o.size.cols <= col ||
        row + size.rows <= o.cell.row ||
        o.cell.row + o.size.rows <= row,
    );
  const place = (it: Item) =>
    it.object.position.copy(cellCentre(it.cell.col, it.cell.row, it.size));
  // an album taken out lies at the front first, near the hand
  const firstFree = (size: Footprint) =>
    Array.from({ length: ROWS * COLS }, (_, i) => ({
      col: [4, 5, 3, 6, 2, 7, 1, 8, 0][i % COLS] ?? i % COLS,
      row: ROWS - size.rows - Math.floor(i / COLS),
    })).find((c) => c.row >= 0 && fits(c.col, c.row, size, null));
  const addItem = (it: Item) => {
    items.push(it);
    it.object.userData = { item: it.id };
    place(it);
    scene.add(it.object);
  };

  const albumSize: Footprint = { cols: 4, rows: 3 };
  const takeOut = (a: Album) => {
    if (a.open) return;
    const cell = firstFree(albumSize);
    if (!cell) return;
    const group = makeAlbum(a.seed);
    a.open = group;
    a.spine.visible = false;
    addItem({ id: `album-${a.seed}`, object: group, size: albumSize, cell, kind: "album" });
  };
  const putBack = (id: string) => {
    const i = items.findIndex((it) => it.id === id);
    const it = items[i];
    if (!it || it.kind !== "album") return;
    const a = albums.find((x) => x.open === it.object);
    if (a) {
      a.open = null;
      a.spine.visible = true;
    }
    scene.remove(it.object);
    items.splice(i, 1);
  };
  // the stand at the back left, the laptop at the back right (the plant is on the window seat)
  const plant = makePlant();
  plant.scale.setScalar(1.5);
  plant.position.set(-seatBack / 2 + 0.3, seatTop, wallZ + 0.3);
  scene.add(plant);
  addItem({
    id: "stand",
    object: stand,
    size: { cols: 2, rows: 1 },
    cell: { col: 0, row: 0 },
    kind: "mug",
  });
  const laptop = makeLaptop();
  addItem({
    id: "laptop",
    object: laptop.group,
    size: { cols: 3, rows: 2 },
    cell: { col: 8, row: 0 },
    kind: "laptop",
  });
  const first = albums[0];
  if (first) takeOut(first);
  const lid = { open: true, angle: -1.85 };
  laptop.lid.rotation.x = lid.angle;

  // light: the sky, the sun through the window, a lamp at night
  const hemi = new THREE.HemisphereLight("#dfe8f5", "#6b4a33", 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff2d6", 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(options.light ? 512 : 2048, options.light ? 512 : 2048);
  sun.shadow.camera.left = -4;
  sun.shadow.camera.right = 4;
  sun.shadow.camera.top = 4;
  sun.shadow.camera.bottom = -4;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);
  sun.target.position.set(0, DESK.top, 0);
  // the desk lamp: a thing on the desk like the others (its light goes where it is put)
  const lampGroup = new THREE.Group();
  const lamp = new THREE.PointLight("#ffc98a", 0, 4, 1.6);
  lamp.position.set(0, 0.62, 0);
  lamp.castShadow = !options.light;
  lampGroup.add(lamp);
  const lampMat = new THREE.MeshStandardMaterial({
    color: "#2f3a33",
    roughness: 0.5,
    metalness: 0.4,
  });
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.03, 20), lampMat);
  lampBase.position.y = 0.015;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 8), lampMat);
  stem.position.y = 0.3;
  const shadeMat = new THREE.MeshStandardMaterial({
    color: "#2f3a33",
    emissive: "#ffc98a",
    emissiveIntensity: 0,
    side: THREE.DoubleSide,
  });
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.12, 20, 1, true), shadeMat);
  shade.position.y = 0.66;
  [lampBase, stem, shade].forEach((m) => {
    m.castShadow = true;
    lampGroup.add(m);
  });
  addItem({
    id: "lamp",
    object: lampGroup,
    size: { cols: 1, rows: 1 },
    cell: { col: 11, row: 0 },
    kind: "lamp",
  });

  // the weather outside: falling rain or snow, seen through the window
  const fallCount = options.light ? 300 : 900;
  const fallGeo = new THREE.BufferGeometry();
  const fallPos = new Float32Array(fallCount * 3);
  Array.from({ length: fallCount }, (_, i) => i).forEach((i) => {
    fallPos[i * 3] = win.x + (Math.random() - 0.5) * 6;
    fallPos[i * 3 + 1] = Math.random() * 4;
    fallPos[i * 3 + 2] = wallZ - 0.3 - Math.random() * 2;
  });
  fallGeo.setAttribute("position", new THREE.BufferAttribute(fallPos, 3));
  const fallMat = new THREE.PointsMaterial({
    color: "#cfe0f0",
    size: 0.025,
    transparent: true,
    opacity: 0.8,
  });
  const fall = new THREE.Points(fallGeo, fallMat);
  fall.visible = false;
  scene.add(fall);
  // rain falls in streaks: each drop a short line
  const streakPos = new Float32Array(fallCount * 6);
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute("position", new THREE.BufferAttribute(streakPos, 3));
  const streakMat = new THREE.LineBasicMaterial({
    color: "#9fb4c8",
    transparent: true,
    opacity: 0.55,
  });
  const streaks = new THREE.LineSegments(streakGeo, streakMat);
  streaks.visible = false;
  scene.add(streaks);

  const state = {
    hour: 10,
    month: 5,
    weather: "clear" as Weather,
    editing: false,
    frame: 0,
    frames: [] as number[],
  };

  const applyLight = () => {
    const s = sunOf(state.hour, state.month);
    const cloud = state.weather === "clear" ? 1 : state.weather === "cloudy" ? 0.25 : 0.1;
    const low = 1 - Math.min(1, s.up / 0.5);
    // from outside the window, behind the room: across the sky from east to west
    const dist = 6;
    sun.position.set(
      win.x - s.across * 4,
      DESK.top + Math.max(0.15, Math.sin(s.up) * dist),
      wallZ - Math.cos(s.up) * dist,
    );
    sun.intensity = s.day ? 3 * cloud * Math.min(1, s.up * 4) : 0;
    sun.color.setHSL(0.09 - low * 0.05, 0.6 + low * 0.3, 0.8 - low * 0.15);
    const daylight = s.day ? 0.25 + Math.min(1, s.up * 3) * 0.6 : 0.05;
    hemi.intensity = daylight * (state.weather === "clear" ? 1 : 0.75);
    lamp.intensity = s.day && s.up > 0.2 ? 0 : 2.2;
    shadeMat.emissiveIntensity = lamp.intensity > 0 ? 0.9 : 0;
    // the sky in the window
    const night = new THREE.Color("#0e1630");
    const dusk = new THREE.Color("#f0a070");
    const day = new THREE.Color(state.weather === "clear" ? "#9cc9f0" : "#a9b2bc");
    const skyColour = s.day
      ? day.clone().lerp(dusk, low * (state.weather === "clear" ? 0.7 : 0.3))
      : night;
    skyMat.color.copy(skyColour);
    // seen through the window, the outside is all sky
    scene.background = skyColour.clone();
    fall.visible = state.weather === "snow";
    streaks.visible = state.weather === "rain";
    fallMat.size = state.weather === "snow" ? 0.05 : 0.02;
    fallMat.color.set(state.weather === "snow" ? "#ffffff" : "#bcd0e4");
  };
  applyLight();

  // pointing: tap a spine to take an album out; tap the laptop to open or shut it; tap an open
  // album to put it back; while editing, drag things across the grid
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const deskPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DESK.top);
  const pick = (e: PointerEvent) => {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
  };
  const owner = (o: THREE.Object3D | null): THREE.Object3D | null =>
    o === null ? null : o.userData.item || o.userData.album !== undefined ? o : owner(o.parent);
  const drag = { id: null as string | null, from: { x: 0, y: 0 }, moved: false };

  const onDown = (e: PointerEvent) => {
    pick(e);
    drag.from = { x: e.clientX, y: e.clientY };
    drag.moved = false;
    const hit = ray
      .intersectObjects(scene.children, true)
      .map((h) => owner(h.object))
      .find((o) => o);
    drag.id =
      state.editing && hit && typeof hit.userData.item === "string" ? hit.userData.item : null;
    controls.enabled = drag.id === null;
  };
  const onMove = (e: PointerEvent) => {
    if (!drag.id) return;
    if (Math.hypot(e.clientX - drag.from.x, e.clientY - drag.from.y) > 4) drag.moved = true;
    pick(e);
    const at = new THREE.Vector3();
    if (!ray.ray.intersectPlane(deskPlane, at)) return;
    const it = items.find((x) => x.id === drag.id);
    if (!it) return;
    const col = Math.round((at.x - deskOrigin.x) / CELL - it.size.cols / 2);
    const row = Math.round((at.z - deskOrigin.z) / CELL - it.size.rows / 2);
    if (fits(col, row, it.size, it.id)) {
      it.cell.col = col;
      it.cell.row = row;
      place(it);
    }
  };
  const onUp = (e: PointerEvent) => {
    const wasDrag = drag.id !== null && drag.moved;
    drag.id = null;
    controls.enabled = true;
    if (wasDrag || Math.hypot(e.clientX - drag.from.x, e.clientY - drag.from.y) > 6) return;
    pick(e);
    const hit = ray
      .intersectObjects(scene.children, true)
      .map((h) => owner(h.object))
      .find((o) => o);
    if (!hit || state.editing) return;
    if (typeof hit.userData.album === "number") {
      const a = albums[hit.userData.album];
      if (a) takeOut(a);
      return;
    }
    const it = items.find((x) => x.id === hit.userData.item);
    if (it?.kind === "laptop") lid.open = !lid.open;
    if (it?.kind === "album") putBack(it.id);
  };
  const stop = new AbortController();
  renderer.domElement.addEventListener("pointerdown", onDown, { signal: stop.signal });
  addEventListener("pointermove", onMove, { signal: stop.signal });
  addEventListener("pointerup", onUp, { signal: stop.signal });
  const resized = { once: false };
  const onResize = () => {
    renderer.setSize(host.clientWidth, host.clientHeight);
    camera.aspect = host.clientWidth / host.clientHeight;
    // the whole desk fits across at the farthest (further back on a tall screen); closer is a
    // pinch or a turn of the wheel
    const far =
      home.distanceTo(new THREE.Vector3(0, DESK.top, deskCentreZ - 0.2)) *
      Math.max(1, 1.15 / camera.aspect);
    controls.maxDistance = far;
    const back = camera.position.clone().sub(controls.target);
    if (back.length() > far || !resized.once)
      camera.position.copy(controls.target).add(back.setLength(far));
    resized.once = true;
    camera.updateProjectionMatrix();
  };
  onResize();
  addEventListener("resize", onResize, { signal: stop.signal });

  const clock = new THREE.Clock();
  const tick = () => {
    const dt = clock.getDelta();
    state.frames = [...state.frames.filter((t) => performance.now() - t < 1000), performance.now()];
    // the lid eases toward open or shut; the screen lights when open
    const target = lid.open ? -1.85 : 0;
    lid.angle += (target - lid.angle) * Math.min(1, dt * 6);
    laptop.lid.rotation.x = lid.angle;
    const screenMat = laptop.screen.material;
    if (screenMat instanceof THREE.MeshStandardMaterial) {
      screenMat.emissiveIntensity = lid.open ? 0.35 : 0;
    }
    if (fall.visible || streaks.visible) {
      const speed = state.weather === "snow" ? 0.3 : 3;
      Array.from({ length: fallCount }, (_, i) => i).forEach((i) => {
        const y = (fallPos[i * 3 + 1] ?? 0) - speed * dt;
        fallPos[i * 3 + 1] = y < 0 ? 4 : y;
        if (state.weather === "snow")
          fallPos[i * 3] = (fallPos[i * 3] ?? 0) + Math.sin(y * 3 + i) * 0.002;
      });
      fallGeo.getAttribute("position").needsUpdate = true;
      if (streaks.visible) {
        Array.from({ length: fallCount }, (_, i) => i).forEach((i) => {
          const x = fallPos[i * 3] ?? 0;
          const y = fallPos[i * 3 + 1] ?? 0;
          const z = fallPos[i * 3 + 2] ?? 0;
          streakPos.set([x, y, z, x + 0.01, y + 0.12, z], i * 6);
        });
        streakGeo.getAttribute("position").needsUpdate = true;
      }
    }
    controls.update();
    renderer.render(scene, camera);
    state.frame = requestAnimationFrame(tick);
  };
  state.frame = requestAnimationFrame(tick);

  return {
    setTime: (hour, month) => {
      state.hour = hour;
      state.month = month;
      applyLight();
    },
    setWeather: (w) => {
      state.weather = w;
      applyLight();
    },
    setEditing: (on) => {
      state.editing = on;
      grid.visible = on;
    },
    fps: () => state.frames.length,
    dispose: () => {
      cancelAnimationFrame(state.frame);
      stop.abort();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
