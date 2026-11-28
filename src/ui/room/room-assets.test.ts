import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { ROOM_ASSETS, parseManifest } from "./room-assets.ts";

const NAMES = Object.keys(ROOM_ASSETS);
const SCENE = readFileSync("src/ui/room/room-scene.ts", "utf8");

test("a manifest names files for known assets", () => {
  expect(parseManifest({ files: { plant: "plant.glb", "desk-wood": "wood/desk.webp" } })).toEqual({
    files: { plant: "plant.glb", "desk-wood": "wood/desk.webp" },
    problems: [],
  });
});

test("wrong entries are left out and told, the rest kept", () => {
  const m = parseManifest({
    files: {
      plant: "plant.png", // a picture for a model
      wall: "../secret.png", // outside public/room
      chair: "chair.glb", // no such asset
      laptop: "laptop.glb",
    },
  });
  expect(m.files).toEqual({ laptop: "laptop.glb" });
  expect(m.problems).toHaveLength(3);
});

test.each([null, [], "plant.glb", { files: ["plant.glb"] }, { files: { plant: 1 } }])(
  "a broken manifest (%j) is no files",
  (json) => {
    const m = parseManifest(json);
    expect(m.files).toEqual({});
    expect(m.problems.length).toBeGreaterThan(0);
  },
);

// every asset has its drawn stand-in, and the scene asks for it by name
test.each(NAMES)("%s is drawn in room-scene.ts and wired through the asset layer", (name) => {
  const spec = ROOM_ASSETS[name as keyof typeof ROOM_ASSETS];
  expect(SCENE).toMatch(new RegExp(`\\b${spec.drawn}\\b`));
  expect(SCENE).toContain(`assets.${spec.kind}("${name}"`);
});

test.each(NAMES)("docs/room-assets.md describes %s", (name) => {
  expect(readFileSync("docs/room-assets.md", "utf8")).toContain(`\`${name}\``);
});

test("the shipped manifest is valid, and lists exactly the files in public/room", () => {
  const dir = "public/room";
  const m = parseManifest(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")));
  expect(m.problems).toEqual([]);
  const listed = Object.values(m.files).toSorted();
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((f) =>
      statSync(join(d, f)).isDirectory() ? walk(join(d, f)).map((x) => `${f}/${x}`) : [f],
    );
  expect(
    walk(dir)
      .filter((f) => f !== "manifest.json" && !f.endsWith(".bin"))
      .toSorted(),
  ).toEqual(listed);
  listed.forEach((f) => {
    expect(existsSync(join(dir, f))).toBe(true);
    // kept small: the files ship with the app
    expect(statSync(join(dir, f)).size).toBeLessThan(2_000_000);
  });
});
