import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { JAR3D, innerProfile, outerProfile, type Profile } from "../../core/jar3d.ts";
import type { BlockShape } from "../../core/jar-shape.ts";
import type { Sticker } from "../../core/payload.ts";
import { renderRgba } from "../../core/render.ts";

const LATHE_SEGMENTS = 64;
const TINT_TOWARD_WHITE = 0.35;
const ART_SHARE = 0.9;

const lathe = (profile: Profile) =>
  new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    LATHE_SEGMENTS,
  );

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
  readonly jarBack: THREE.Mesh;
  readonly jarFront: THREE.Mesh;
  readonly jarGeometries: readonly THREE.BufferGeometry[];
  readonly dispose: () => void;
};

export function buildScene(canvas: HTMLCanvasElement): Scene3d {
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
  scene.add(new THREE.HemisphereLight(0x3a4a66, 0x120c08, 0.35));
  const rim = new THREE.DirectionalLight(0x9bbcff, 0.7);
  rim.position.set(-6, 5, -4);
  scene.add(rim);

  const woodMap = woodTexture();
  const fade = fadeMap();
  const desk = new THREE.Mesh(
    new THREE.CircleGeometry(10, 96),
    new THREE.MeshStandardMaterial({
      map: woodMap,
      alphaMap: fade,
      transparent: true,
      roughness: 0.52,
      metalness: 0.02,
    }),
  );
  desk.rotation.x = -Math.PI / 2;
  desk.receiveShadow = true;
  scene.add(desk);

  const shadowMap = radialDecal("rgba(0,0,0,0.55)", "rgba(0,0,0,0)");
  const contact = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 48),
    new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.012;
  scene.add(contact);

  const outer = lathe(outerProfile());
  const inner = lathe(innerProfile());
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
  const jarBack = new THREE.Mesh(outer, backMaterial);
  jarBack.renderOrder = -1;
  const jarFront = new THREE.Mesh(outer, frontMaterial);
  jarFront.renderOrder = 10;
  const innerWall = new THREE.Mesh(inner, frontMaterial);
  innerWall.renderOrder = 9;
  scene.add(jarBack, jarFront, innerWall);

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
    jarBack,
    jarFront,
    jarGeometries: [outer, inner],
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

  const artMaterial = new THREE.MeshStandardMaterial({
    map: texture,
    alphaTest: 0.5,
    roughness: 0.7,
    emissive: 0xffffff,
    emissiveMap: texture,
    emissiveIntensity: 0.02,
    side: THREE.DoubleSide,
  });
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
    artMaterial.dispose();
    tint.dispose();
  };
  return { group, slab, art, tint, dispose };
}
