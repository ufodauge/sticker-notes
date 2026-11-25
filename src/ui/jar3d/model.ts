import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import jarGltf from "./models/jar.gltf?raw";

export type TriangleMesh = { readonly positions: Float32Array; readonly indices: Uint32Array };

export type JarModel = {
  readonly jar: THREE.Object3D;
  readonly desk: THREE.Object3D | null;
  readonly collision: readonly TriangleMesh[];
  readonly pieces: readonly Float32Array[];
  readonly spawn: THREE.Vector3;
};

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
  return {
    jar,
    desk: root.getObjectByName("desk") ?? null,
    collision,
    pieces,
    spawn: spawn ?? new THREE.Vector3(0, 6.6, 0),
  };
}
