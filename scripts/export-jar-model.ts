// Writes the default jar scene as a glTF file that people can open and edit in Blender.
// The app reads this file; docs/jar-model.md describes the node names it looks for.
//   node scripts/export-jar-model.ts
import { writeFileSync } from "node:fs";
import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import {
  JAR3D,
  innerProfile,
  jarCollisionPieces,
  outerProfile,
  type Profile,
} from "../src/core/jar3d.ts";

const LATHE_SEGMENTS = 64;
const DESK_RADIUS = 10;

type Accessor = {
  bufferView: number;
  componentType: number;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
};

const doc = {
  asset: { version: "2.0", generator: "sticker-notes scripts/export-jar-model.ts" },
  scene: 0,
  scenes: [{ nodes: [] as number[] }],
  nodes: [] as Record<string, unknown>[],
  meshes: [] as Record<string, unknown>[],
  materials: [] as Record<string, unknown>[],
  accessors: [] as Accessor[],
  bufferViews: [] as { buffer: number; byteOffset: number; byteLength: number; target?: number }[],
  buffers: [] as { byteLength: number; uri: string }[],
};
const chunks: Uint8Array[] = [];
const offset = { bytes: 0 };

function addView(bytes: Uint8Array, target: number): number {
  const pad = (4 - (offset.bytes % 4)) % 4;
  if (pad > 0) {
    chunks.push(new Uint8Array(pad));
    offset.bytes += pad;
  }
  doc.bufferViews.push({
    buffer: 0,
    byteOffset: offset.bytes,
    byteLength: bytes.byteLength,
    target,
  });
  chunks.push(bytes);
  offset.bytes += bytes.byteLength;
  return doc.bufferViews.length - 1;
}

function addFloats(values: Float32Array, size: number, withBounds: boolean): number {
  const view = addView(new Uint8Array(values.buffer.slice(0)), 34962);
  const count = values.length / size;
  const accessor: Accessor = {
    bufferView: view,
    componentType: 5126,
    count,
    type: size === 3 ? "VEC3" : "VEC2",
  };
  if (withBounds) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    Array.from({ length: count }).forEach((_, i) => {
      [0, 1, 2].forEach((k) => {
        const v = values[i * 3 + k] ?? 0;
        min[k] = Math.min(min[k] ?? v, v);
        max[k] = Math.max(max[k] ?? v, v);
      });
    });
    accessor.min = min;
    accessor.max = max;
  }
  doc.accessors.push(accessor);
  return doc.accessors.length - 1;
}

function addIndices(values: Uint32Array): number {
  const view = addView(new Uint8Array(values.buffer.slice(0)), 34963);
  doc.accessors.push({
    bufferView: view,
    componentType: 5125,
    count: values.length,
    type: "SCALAR",
  });
  return doc.accessors.length - 1;
}

function material(name: string, colour: readonly [number, number, number, number]): number {
  doc.materials.push({
    name,
    pbrMetallicRoughness: { baseColorFactor: colour, metallicFactor: 0, roughnessFactor: 0.5 },
    ...(colour[3] < 1 ? { alphaMode: "BLEND" } : {}),
  });
  return doc.materials.length - 1;
}

function mesh(name: string, geometry: THREE.BufferGeometry, materialIndex: number): number {
  const g = geometry;
  const attributes: Record<string, number> = {
    POSITION: addFloats(g.getAttribute("position").array as Float32Array, 3, true),
  };
  const normal = g.getAttribute("normal");
  if (normal) attributes["NORMAL"] = addFloats(normal.array as Float32Array, 3, false);
  const uv = g.getAttribute("uv");
  if (uv) attributes["TEXCOORD_0"] = addFloats(uv.array as Float32Array, 2, false);
  const index = g.getIndex();
  doc.meshes.push({
    name,
    primitives: [
      {
        attributes,
        ...(index ? { indices: addIndices(Uint32Array.from(index.array)) } : {}),
        material: materialIndex,
      },
    ],
  });
  return doc.meshes.length - 1;
}

function node(name: string, extra: Record<string, unknown>): number {
  doc.nodes.push({ name, ...extra });
  return doc.nodes.length - 1;
}

const lathe = (profile: Profile) =>
  new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    LATHE_SEGMENTS,
  );

const glass = material("glass", [0.89, 0.96, 0.97, 0.1]);
const wood = material("wood", [0.2, 0.14, 0.1, 1]);
const hidden = material("collision", [1, 0, 1, 1]);

const outer = lathe(outerProfile());
const inner = lathe(innerProfile());
const outerMesh = mesh("jar_glass_outer", outer, glass);
const innerMesh = mesh("jar_glass_inner", inner, glass);
const jar = node("jar", {
  children: [
    node("jar_glass_outer", { mesh: outerMesh }),
    node("jar_glass_inner", { mesh: innerMesh }),
  ],
});
const collision = node("jar_collision", {
  children: [
    node("jar_collision_outer", { mesh: outerMesh }),
    node("jar_collision_inner", { mesh: innerMesh }),
  ],
});
const pieces = node("jar_pieces", {
  children: jarCollisionPieces().map((points, i) => {
    const vectors = Array.from(
      { length: points.length / 3 },
      (_, k) => new THREE.Vector3(points[k * 3], points[k * 3 + 1], points[k * 3 + 2]),
    );
    const hull = new ConvexGeometry(vectors);
    hull.deleteAttribute("uv");
    return node(`jar_piece_${i}`, { mesh: mesh(`jar_piece_${i}`, hull, hidden) });
  }),
});
const deskGeometry = new THREE.CircleGeometry(DESK_RADIUS, 96).rotateX(-Math.PI / 2);
const desk = node("desk", { mesh: mesh("desk", deskGeometry, wood) });
const spawn = node("spawn", { translation: [0, JAR3D.height + 1.4, 0] });
doc.scenes[0]?.nodes.push(jar, collision, pieces, desk, spawn);

const all = new Uint8Array(offset.bytes);
chunks.reduce((at, chunk) => {
  all.set(chunk, at);
  return at + chunk.byteLength;
}, 0);
doc.buffers.push({
  byteLength: all.byteLength,
  uri: `data:application/octet-stream;base64,${Buffer.from(all).toString("base64")}`,
});

const out = new URL("../src/ui/jar3d/models/jar.gltf", import.meta.url);
writeFileSync(out, `${JSON.stringify(doc)}\n`);
console.log(`wrote ${out.pathname} (${(all.byteLength / 1024).toFixed(0)} KiB of geometry)`);
