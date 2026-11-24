import * as v from "valibot";
import { mulberry32 } from "./prng.ts";

export const JAR_DEFAULT_COUNT = 40;
export const JAR_MAX_COUNT = 120;

export const JarSelectionSchema = v.variant("kind", [
  v.object({ kind: v.literal("auto"), seed: v.pipe(v.number(), v.integer(), v.minValue(0)) }),
  v.object({
    kind: v.literal("manual"),
    ids: v.pipe(v.array(v.string()), v.maxLength(JAR_MAX_COUNT)),
  }),
]);

export type JarSelection = v.InferOutput<typeof JarSelectionSchema>;

export const DEFAULT_JAR_SELECTION: JarSelection = { kind: "auto", seed: 1 };

const hashId = (id: string): number =>
  Array.from(id).reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261) >>> 0;

// Each sticker's rank depends only on the seed and its own id, so deleting or adding a sticker
// changes the jar by at most that one block.
const rank = (seed: number, id: string): number => mulberry32((seed + hashId(id)) >>> 0)();

export function pickJarIds(selection: JarSelection, allIds: readonly string[]): string[] {
  if (selection.kind === "auto") {
    return allIds
      .map((id) => ({ id, key: rank(selection.seed, id) }))
      .toSorted((a, b) => a.key - b.key || (a.id < b.id ? -1 : 1))
      .slice(0, JAR_DEFAULT_COUNT)
      .map((e) => e.id);
  }
  const existing = new Set(allIds);
  return [...new Set(selection.ids)].filter((id) => existing.has(id)).slice(0, JAR_MAX_COUNT);
}

export function toggleJarId(ids: readonly string[], id: string): readonly string[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  return ids.length >= JAR_MAX_COUNT ? ids : [...ids, id];
}
