import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as v from "valibot";

// The 3D desk's things, each one either a file a designer made (under `public/room/`, listed in
// `public/room/manifest.json`) or, without one, the shape drawn from code in `room-scene.ts`.
// The scene starts at once with the drawn shapes; a file takes a shape's place when it has
// loaded. A missing or broken file leaves the drawn shape (a quiet warning, nothing breaks).
// The conventions for the files (units, axes, sizes, node names) are in `docs/room-assets.md`.

type ModelSpec = {
  readonly kind: "model";
  // where room-scene.ts draws it without a file
  readonly drawn: string;
  // nodes the scene moves, by name: true when the file must have it (else it is kept drawn)
  readonly nodes: Readonly<Record<string, boolean>>;
};
type TextureSpec = {
  readonly kind: "texture";
  readonly drawn: string;
  // times the picture repeats across a face (else as the drawn texture repeats)
  readonly repeat?: readonly [number, number];
};

export const ROOM_ASSETS = {
  desk: { kind: "model", drawn: "deskParts", nodes: {} },
  laptop: { kind: "model", drawn: "makeLaptop", nodes: { lid: true, screen: false } },
  plant: { kind: "model", drawn: "makePlant", nodes: {} },
  lamp: { kind: "model", drawn: "lampGroup", nodes: { light: false } },
  "book-stand": { kind: "model", drawn: "standParts", nodes: {} },
  "window-frame": { kind: "model", drawn: "frameParts", nodes: {} },
  "desk-wood": { kind: "texture", drawn: "deskTex" },
  "floor-wood": { kind: "texture", drawn: "floorMat", repeat: [6, 3] },
  wall: { kind: "texture", drawn: "wallMat", repeat: [3, 3] },
} as const satisfies Readonly<Record<string, ModelSpec | TextureSpec>>;

type AssetName = keyof typeof ROOM_ASSETS;
type Assets = typeof ROOM_ASSETS;
type ModelName = { [K in AssetName]: Assets[K] extends ModelSpec ? K : never }[AssetName];
type TextureName = Exclude<AssetName, ModelName>;
type NodeOf<N extends ModelName> = keyof Assets[N]["nodes"] & string;

const NAMES = Object.keys(ROOM_ASSETS) as AssetName[];

// a file name under public/room/ (sub-folders allowed, no "..")
const fileOf = (ext: string) =>
  v.pipe(v.string(), v.regex(new RegExp(`^[\\w-]+(?:/[\\w-]+)*\\.(?:${ext})$`, "i")));
const FILE = { model: fileOf("glb|gltf"), texture: fileOf("png|jpe?g|webp") } as const;

const ManifestSchema = v.object({ files: v.record(v.string(), v.string()) });

export type Manifest = Readonly<Partial<Record<AssetName, string>>>;

// The manifest designers edit: `{ "files": { "<asset name>": "<file>" } }`. Entries that are not
// right are left out (and told), so one mistake does not stop the other files.
export function parseManifest(json: unknown): {
  readonly files: Manifest;
  readonly problems: readonly string[];
} {
  const m = v.safeParse(ManifestSchema, json);
  if (!m.success) return { files: {}, problems: ['manifest.json: expected { "files": { … } }'] };
  return Object.entries(m.output.files).reduce<{ files: Manifest; problems: readonly string[] }>(
    (acc, [name, file]) =>
      !v.is(v.picklist(NAMES), name)
        ? { ...acc, problems: [...acc.problems, `"${name}" is not one of: ${NAMES.join(", ")}`] }
        : !v.is(FILE[ROOM_ASSETS[name].kind], file)
          ? {
              ...acc,
              problems: [
                ...acc.problems,
                `"${name}": "${file}" is not a ${ROOM_ASSETS[name].kind} file`,
              ],
            }
          : { ...acc, files: { ...acc.files, [name]: file } },
    { files: {}, problems: [] },
  );
}

type ModelSlot<N extends ModelName> = {
  // put this in the scene: it holds the drawn shape until the file has loaded
  readonly object: THREE.Group;
  // a named node of what is shown now (the file's, or the drawn shape's)
  readonly node: (name: NodeOf<N>) => THREE.Object3D | undefined;
};

export type RoomAssets = {
  // `carry`: a thing of the scene's (the lamp's light) that goes to the file's node of that name
  readonly model: <N extends ModelName>(
    name: N,
    drawn: THREE.Object3D,
    carry?: { readonly node: NodeOf<N>; readonly object: THREE.Object3D },
  ) => ModelSlot<N>;
  // the material keeps its drawn texture (or plain colour) until the file has loaded
  readonly texture: (name: TextureName, material: THREE.MeshStandardMaterial) => void;
  readonly dispose: () => void;
};

// `mark`: the names of the files in use are written to its `data-room-assets` (for tests)
export function roomAssets(mark: HTMLElement): RoomAssets {
  const stop = new AbortController();
  const base = `${import.meta.env.BASE_URL}room/`;
  // no manifest (or a broken one) is no files: everything stays drawn
  const manifest: Promise<Manifest> = fetch(`${base}manifest.json`, { signal: stop.signal })
    .then((r) => (r.ok ? r.json() : { files: {} }))
    .then((json: unknown) => {
      const m = parseManifest(json);
      if (m.problems.length > 0) console.warn("room assets:", ...m.problems);
      return m.files;
    })
    .catch(() => ({}));
  const gltf = new GLTFLoader();
  const images = new THREE.TextureLoader();
  const used = (name: AssetName) => {
    mark.dataset.roomAssets = [mark.dataset.roomAssets, name].filter(Boolean).join(" ");
  };
  const failed = (name: AssetName, file: string) => (e: unknown) => {
    if (!stop.signal.aborted) console.warn(`room assets: "${name}" (${file}) is drawn instead`, e);
  };
  // the file's path, once the manifest is in (and the room still open)
  const fileFor = (name: AssetName): Promise<string | null> =>
    manifest.then((files) => (stop.signal.aborted ? null : (files[name] ?? null)));

  return {
    model: (name, drawn, carry) => {
      const object = new THREE.Group();
      object.add(drawn);
      const shown = { content: drawn };
      void fileFor(name).then((file) => {
        if (file === null) return;
        gltf
          .loadAsync(base + file)
          .then(({ scene }) => {
            if (stop.signal.aborted) return;
            const missing = Object.entries<boolean>(ROOM_ASSETS[name].nodes)
              .filter(([node, needed]) => needed && !scene.getObjectByName(node))
              .map(([node]) => node);
            if (missing.length > 0) throw new Error(`no node named ${missing.join(", ")}`);
            scene.traverse((o) => {
              if (o instanceof THREE.Mesh) {
                o.castShadow = true;
                o.receiveShadow = true;
              }
            });
            object.remove(shown.content);
            object.add(scene);
            shown.content = scene;
            if (carry) {
              const anchor = scene.getObjectByName(carry.node);
              if (anchor) {
                anchor.add(carry.object);
                carry.object.position.set(0, 0, 0);
              } else object.add(carry.object);
            }
            used(name);
          })
          .catch(failed(name, file));
      });
      return { object, node: (n) => shown.content.getObjectByName(n) };
    },
    texture: (name, material) => {
      void fileFor(name).then((file) => {
        if (file === null) return;
        images
          .loadAsync(base + file)
          .then((t) => {
            if (stop.signal.aborted) return;
            const spec: TextureSpec = ROOM_ASSETS[name];
            t.colorSpace = THREE.SRGBColorSpace;
            t.wrapS = THREE.RepeatWrapping;
            t.wrapT = THREE.RepeatWrapping;
            if (spec.repeat) t.repeat.set(...spec.repeat);
            else if (material.map) t.repeat.copy(material.map.repeat);
            material.map = t;
            // the picture is the colour: no tint from the drawn material
            material.color.set("#ffffff");
            material.needsUpdate = true;
            used(name);
          })
          .catch(failed(name, file));
      });
    },
    dispose: () => stop.abort(),
  };
}
