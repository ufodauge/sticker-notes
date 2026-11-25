import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import jarGltf from "./models/jar.gltf?raw";

export type TriangleMesh = { readonly positions: Float32Array; readonly indices: Uint32Array };

export type JarModel = {
  readonly jar: THREE.Object3D;
  readonly desk: THREE.Object3D | null;
  readonly collision: readonly TriangleMesh[];
  readonly pieces: readonly Float32Array[];
  readonly lid: THREE.Object3D | null;
  readonly lidPieces: readonly Float32Array[];
  readonly spawn: THREE.Vector3;
  readonly height: number;
  readonly innerRadiusAt: (y: number) => number;
};

const RADIUS_BANDS = 24;

// The inner wall's radius per height band, read from the collision mesh: in each band the inner
// surface is the closest wall vertex to the axis (vertices near the axis belong to the base).
function innerProfile(collision: readonly TriangleMesh[]): {
  height: number;
  innerRadiusAt: (y: number) => number;
} {
  const points = collision.flatMap((m) =>
    Array.from({ length: m.positions.length / 3 }, (_, i) => ({
      r: Math.hypot(m.positions[i * 3] ?? 0, m.positions[i * 3 + 2] ?? 0),
      y: m.positions[i * 3 + 1] ?? 0,
    })),
  );
  const height = Math.max(...points.map((p) => p.y));
  const maxR = Math.max(...points.map((p) => p.r));
  const bands = Array.from({ length: RADIUS_BANDS }, (_, b) => {
    const lo = (b / RADIUS_BANDS) * height;
    const hi = ((b + 1) / RADIUS_BANDS) * height;
    const wall = points.filter((p) => p.y >= lo && p.y <= hi && p.r > maxR * 0.4);
    return wall.length > 0 ? Math.min(...wall.map((p) => p.r)) : maxR;
  });
  return {
    height,
    innerRadiusAt: (y) =>
      bands[Math.min(RADIUS_BANDS - 1, Math.max(0, Math.floor((y / height) * RADIUS_BANDS)))] ??
      maxR,
  };
}

const meshesUnder = (root: THREE.Object3D | undefined): THREE.Mesh[] => {
  const found: THREE.Mesh[] = [];
  root?.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) found.push(o as THREE.Mesh);
  });
  return found;
};

const worldPositions = (mesh: THREE.Mesh): Float32Array => {
  const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  const positions = new Float32Array(geometry.getAttribute("position").array);
  geometry.dispose();
  return positions;
};

const triangles = (mesh: THREE.Mesh): TriangleMesh => {
  const positions = worldPositions(mesh);
  const index = mesh.geometry.getIndex();
  return {
    positions,
    indices: index
      ? Uint32Array.from(index.array)
      : Uint32Array.from({ length: positions.length / 3 }, (_, i) => i),
  };
};

export async function loadJarModel(): Promise<JarModel> {
  const gltf = await new GLTFLoader().parseAsync(jarGltf, "");
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const jar = root.getObjectByName("jar");
  if (!jar) throw new Error('jar.gltf has no node named "jar"');
  const collisionMeshes = meshesUnder(root.getObjectByName("jar_collision"));
  const collision = (collisionMeshes.length > 0 ? collisionMeshes : meshesUnder(jar)).map(
    triangles,
  );
  const pieces = meshesUnder(root.getObjectByName("jar_pieces")).map(worldPositions);
  const spawn = root.getObjectByName("spawn")?.getWorldPosition(new THREE.Vector3());
  const lid = root.getObjectByName("lid") ?? null;
  return {
    jar,
    desk: root.getObjectByName("desk") ?? null,
    collision,
    pieces,
    lid,
    lidPieces: meshesUnder(root.getObjectByName("lid_collision")).map(worldPositions),
    spawn: spawn ?? new THREE.Vector3(0, 6.6, 0),
    ...innerProfile(collision),
  };
}
