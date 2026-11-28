import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

// A sample model for the 3D desk (`?room`), made from code the way a designer's file would be:
// public/room/plant.glb, following docs/room-assets.md (metres, y up, origin at the bottom of the
// pot). Run with `vp run gen:room`; the file is listed in public/room/manifest.json.

// GLTFExporter reads its buffers with the browser's FileReader; Node has Blob but no FileReader
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((b) => {
      this.result = `data:${blob.type};base64,${Buffer.from(b).toString("base64")}`;
      this.onloadend?.();
    });
  }
}
Object.assign(globalThis, { FileReader: NodeFileReader });

function plant(): THREE.Group {
  const g = new THREE.Group();
  g.name = "plant";
  const clay = new THREE.MeshStandardMaterial({ name: "clay", color: "#b5643c", roughness: 0.9 });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.4, 24), clay);
  pot.name = "pot";
  pot.position.y = 0.2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.235, 0.05, 24), clay);
  rim.name = "rim";
  rim.position.y = 0.4;
  const soil = new THREE.Mesh(
    new THREE.CircleGeometry(0.215, 24),
    new THREE.MeshStandardMaterial({ name: "soil", color: "#4a3326", roughness: 1 }),
  );
  soil.name = "soil";
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.41;
  g.add(pot, rim, soil);
  // long leaves on short stems, leaning out and up in two rings
  const leafGeo = new THREE.SphereGeometry(1, 10, 6);
  const leafMat = new THREE.MeshStandardMaterial({
    name: "leaf",
    color: "#3e7d3a",
    roughness: 0.7,
  });
  Array.from({ length: 18 }, (_, i) => i).forEach((i) => {
    const ring = i % 2;
    const a = (i / 18) * Math.PI * 2 + ring * 0.4;
    const lean = ring ? 0.5 : 0.9;
    const length = ring ? 0.3 : 0.24;
    const pivot = new THREE.Group();
    pivot.name = `leaf-${i}`;
    pivot.position.set(Math.cos(a) * 0.05, 0.42, Math.sin(a) * 0.05);
    pivot.rotation.set(0, -a, 0);
    const tilt = new THREE.Group();
    tilt.rotation.z = -lean;
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.scale.set(0.045, length, 0.012);
    leaf.position.y = length;
    tilt.add(leaf);
    pivot.add(tilt);
    g.add(pivot);
  });
  return g;
}

const out = new URL("../public/room/plant.glb", import.meta.url);
const glb = await new GLTFExporter().parseAsync(plant(), { binary: true });
if (!(glb instanceof ArrayBuffer)) throw new Error("expected a binary glTF");
writeFileSync(out, new Uint8Array(glb));
console.log(`wrote ${fileURLToPath(out)} (${glb.byteLength} bytes)`);
