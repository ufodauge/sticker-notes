import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { JAR3D } from "../../core/jar3d.ts";
import type { BlockShape } from "../../core/jar-shape.ts";
import { buildAtmosphere, type Atmosphere } from "./atmosphere.ts";
import type { JarModel, TriangleMesh } from "./model.ts";
import type { Sticker } from "../../core/payload.ts";
import { materialMask, renderRgba } from "../../core/render.ts";

const TINT_TOWARD_WHITE = 0.35;
const ART_SHARE = 0.9;

const materialName = (mesh: THREE.Mesh): string =>
  [mesh.material].flat()[0]?.name.toLowerCase() ?? "";

const glassRim = (strength: number) => (shader: THREE.WebGLProgramParametersWithUniforms) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <emissivemap_fragment>",
    `#include <emissivemap_fragment>
    float rim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.4);
    totalEmissiveRadiance += vec3(0.62, 0.84, 0.95) * rim * ${strength.toFixed(2)};
    diffuseColor.a = clamp(diffuseColor.a + rim * ${(strength * 0.55).toFixed(2)}, 0.0, 1.0);`,
  );
};

function woodTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#33241a";
    ctx.fillRect(0, 0, size, size);
    Array.from({ length: 140 }).forEach((_, i) => {
      const y = (i * 37.7) % size;
      const shade = 20 + ((i * 53) % 40);
      ctx.strokeStyle = `rgba(${shade + 30}, ${shade + 12}, ${shade - 8}, ${0.05 + ((i * 7) % 10) / 120})`;
      ctx.lineWidth = 0.6 + ((i * 13) % 5) / 3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(
        size * 0.3,
        y + 6 * Math.sin(i),
        size * 0.7,
        y - 6 * Math.cos(i),
        size,
        y + 3,
      );
      ctx.stroke();
    });
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 4);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function radialDecal(inner: string, outer: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(canvas);
}

function fadeMap(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.9)");
    g.addColorStop(0.7, "rgba(255,255,255,0.25)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  return new THREE.CanvasTexture(canvas);
}

export type Scene3d = {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly spot: THREE.SpotLight;
  readonly jarGroup: THREE.Group;
  readonly collision: readonly TriangleMesh[];
  readonly pieces: readonly Float32Array[];
  readonly spawn: THREE.Vector3;
  readonly lid: THREE.Object3D | null;
  readonly lidPieces: readonly Float32Array[];
  readonly jarHeight: number;
  readonly innerRadiusAt: (y: number) => number;
  readonly contact: THREE.Mesh;
  readonly atmosphere: Atmosphere;
  readonly dispose: () => void;
};

export function buildScene(canvas: HTMLCanvasElement, model: JarModel): Scene3d {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = 0.32;
  room.dispose();
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(JAR3D.vfovDeg, 1, 0.1, 80);

  const spot = new THREE.SpotLight(0xffe9c4, 1500, 0, 0.34, 0.85, 1.6);
  spot.position.set(0.4, 15, 1.6);
  spot.target.position.set(0, 0.6, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.bias = -0.0004;
  spot.shadow.radius = 9;
  spot.shadow.intensity = 0.6;
  scene.add(spot, spot.target);
  const atmosphere = buildAtmosphere(spot.position);
  scene.add(atmosphere.group);
  scene.add(new THREE.HemisphereLight(0x3a4a66, 0x120c08, 0.35));
  const rim = new THREE.DirectionalLight(0x9bbcff, 0.7);
  rim.position.set(-6, 5, -4);
  scene.add(rim);

  const woodMap = woodTexture();
  const fade = fadeMap();
  const woodMaterial = new THREE.MeshStandardMaterial({
    map: woodMap,
    alphaMap: fade,
    transparent: true,
    roughness: 0.52,
    metalness: 0.02,
  });
  if (model.desk) {
    model.desk.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (materialName(mesh) === "wood") mesh.material = woodMaterial;
      mesh.receiveShadow = true;
    });
    scene.add(model.desk);
  }

  const shadowMap = radialDecal("rgba(0,0,0,0.55)", "rgba(0,0,0,0)");
  const contact = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 48),
    new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.012;
  scene.add(contact);

  const backMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xd9eef2,
    transparent: true,
    opacity: 0.1,
    roughness: 0.03,
    clearcoat: 1,
    envMapIntensity: 1.3,
    side: THREE.BackSide,
    depthWrite: false,
  });
  backMaterial.onBeforeCompile = glassRim(0.7);
  const frontMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xe4f4f6,
    transparent: true,
    opacity: 0.1,
    roughness: 0.02,
    clearcoat: 1,
    envMapIntensity: 1.6,
    side: THREE.FrontSide,
    depthWrite: false,
  });
  frontMaterial.onBeforeCompile = glassRim(1.1);
  const jarGroup = new THREE.Group();
  const glassMeshes: THREE.Mesh[] = [];
  model.jar.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && materialName(mesh) === "glass") glassMeshes.push(mesh);
    else if (mesh.isMesh) mesh.castShadow = true;
  });
  glassMeshes.forEach((mesh) => {
    const back = new THREE.Mesh(mesh.geometry, backMaterial);
    back.position.copy(mesh.position);
    back.quaternion.copy(mesh.quaternion);
    back.scale.copy(mesh.scale);
    back.renderOrder = -1;
    mesh.material = frontMaterial;
    mesh.renderOrder = 10;
    mesh.parent?.add(back);
  });
  jarGroup.add(model.jar);
  if (model.lid) {
    const metal = new THREE.MeshStandardMaterial({
      color: 0xb9b4aa,
      metalness: 0.85,
      roughness: 0.32,
    });
    model.lid.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (materialName(mesh) === "lid") mesh.material = metal;
      mesh.castShadow = true;
    });
    model.lid.visible = false;
    jarGroup.add(model.lid);
  }
  scene.add(jarGroup);

  const dispose = () => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      [material].flat().forEach((m) => m?.dispose());
    });
    woodMap.dispose();
    fade.dispose();
    shadowMap.dispose();
    scene.environment?.dispose();
    renderer.dispose();
  };

  return {
    renderer,
    scene,
    camera,
    spot,
    jarGroup,
    collision: model.collision,
    pieces: model.pieces,
    spawn: model.spawn,
    lid: model.lid,
    lidPieces: model.lidPieces,
    jarHeight: model.height,
    innerRadiusAt: model.innerRadiusAt,
    contact,
    atmosphere,
    dispose,
  };
}

export type BlockVisual = {
  readonly group: THREE.Group;
  readonly slab: THREE.Mesh;
  readonly art: THREE.Mesh;
  readonly tint: THREE.MeshPhysicalMaterial;
  readonly dispose: () => void;
};

function averageColour(rgba: Uint8ClampedArray): THREE.Color {
  const sum = { r: 0, g: 0, b: 0, n: 0 };
  rgba.forEach((_, k) => {
    if (k % 4 !== 3 || (rgba[k] ?? 0) < 128) return;
    sum.r += rgba[k - 3] ?? 0;
    sum.g += rgba[k - 2] ?? 0;
    sum.b += rgba[k - 1] ?? 0;
    sum.n++;
  });
  const n = Math.max(1, sum.n) * 255;
  const colour = new THREE.Color(sum.r / n, sum.g / n, sum.b / n);
  return colour.lerp(new THREE.Color(1, 1, 1), TINT_TOWARD_WHITE);
}

function artTexture(rgba: Uint8ClampedArray, size: number): THREE.DataTexture {
  const flipped = new Uint8Array(rgba.length);
  Array.from({ length: size }).forEach((_, row) => {
    flipped.set(rgba.subarray(row * size * 4, (row + 1) * size * 4), (size - 1 - row) * size * 4);
  });
  const texture = new THREE.DataTexture(flipped, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function buildBlock(sticker: Sticker, shape: BlockShape): BlockVisual {
  const { side, thickness } = JAR3D;
  const [cx, cy] = shape.centre;
  const outline = new THREE.Shape(
    shape.outline.map(([x, y]) => new THREE.Vector2((x - cx) * side, -(y - cy) * side)),
  );
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth: thickness - 0.08,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.03,
    bevelSegments: 3,
    curveSegments: 4,
  });
  geometry.translate(0, 0, -(thickness - 0.08) / 2);

  const { size, rgba } = renderRgba(sticker);
  const texture = artTexture(rgba, size);
  const tintColour = averageColour(rgba);
  const tint = new THREE.MeshPhysicalMaterial({
    color: tintColour,
    transparent: true,
    opacity: 0.2,
    roughness: 0.04,
    clearcoat: 1,
    ior: 1.49,
    envMapIntensity: 1.0,
    depthWrite: false,
  });
  tint.onBeforeCompile = glassRim(0.9);
  const slab = new THREE.Mesh(geometry, tint);
  slab.renderOrder = 2;
  slab.castShadow = true;

  const { material: artMaterial, extra } = artMaterialOf(sticker, texture, size);
  const art = new THREE.Mesh(
    new THREE.PlaneGeometry(ART_SHARE * side, ART_SHARE * side),
    artMaterial,
  );
  art.position.set(-cx * side, cy * side, 0);
  art.castShadow = true;

  const group = new THREE.Group();
  group.add(art, slab);
  const dispose = () => {
    geometry.dispose();
    art.geometry.dispose();
    texture.dispose();
    extra?.dispose();
    artMaterial.dispose();
    tint.dispose();
  };
  return { group, slab, art, tint, dispose };
}

// The printed face of a block, made of the sticker's material: a rainbow film, a glossy dome,
// metal on one colour, or art that glows in the dark jar. Clear art needs nothing more: its
// faint base falls under the alpha test and the acrylic shows through.
function artMaterialOf(
  sticker: Sticker,
  texture: THREE.DataTexture,
  size: number,
): { material: THREE.MeshStandardMaterial; extra?: THREE.Texture } {
  const base = {
    map: texture,
    alphaTest: 0.5,
    roughness: 0.7,
    emissive: 0xffffff,
    emissiveMap: texture,
    emissiveIntensity: 0.02,
    side: THREE.DoubleSide,
  };
  switch (sticker.material?.kind) {
    case "holo":
      return {
        material: new THREE.MeshPhysicalMaterial({
          ...base,
          roughness: 0.25,
          metalness: 0.2,
          iridescence: 1,
          iridescenceIOR: 1.8,
          iridescenceThicknessRange: [180, 720],
        }),
      };
    case "puffy":
      return {
        material: new THREE.MeshPhysicalMaterial({
          ...base,
          roughness: 0.35,
          clearcoat: 1,
          clearcoatRoughness: 0.04,
        }),
      };
    case "glitter": {
      const sparks = sparkTexture(size);
      return {
        material: new THREE.MeshPhysicalMaterial({
          ...base,
          roughness: 0.3,
          metalness: 0.55,
          roughnessMap: sparks,
          clearcoat: 0.6,
        }),
        extra: sparks,
      };
    }
    case "foil": {
      const metal = maskTexture(sticker);
      return {
        material: new THREE.MeshStandardMaterial({
          ...base,
          roughness: 0.22,
          metalness: 1,
          metalnessMap: metal,
        }),
        extra: metal,
      };
    }
    case "glow":
      return { material: new THREE.MeshStandardMaterial({ ...base, emissiveIntensity: 0.9 }) };
    default:
      return { material: new THREE.MeshStandardMaterial(base) };
  }
}

// Metalness from the blue channel: 1 on the foil colour, 0 elsewhere.
function maskTexture(sticker: Sticker): THREE.DataTexture {
  const { size, rgba } = materialMask(sticker);
  const rows = Uint8Array.from(rgba, (_, i) => {
    const px = Math.floor(i / 4);
    const row = size - 1 - Math.floor(px / size);
    const alpha = rgba[(row * size + (px % size)) * 4 + 3] ?? 0;
    return i % 4 === 3 ? 255 : alpha;
  });
  const t = new THREE.DataTexture(rows, size, size, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

// Roughness with fine random dots so that tiny facets catch the light one by one.
function sparkTexture(size: number): THREE.DataTexture {
  const n = size * 4;
  const data = new Uint8Array(n * n * 4);
  Array.from({ length: n * n }).forEach((_, i) => {
    const g = Math.random() < 0.12 ? 10 : 200;
    data.set([g, g, g, 255], i * 4);
  });
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
