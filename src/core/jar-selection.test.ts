import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import {
  JAR_DEFAULT_COUNT,
  JAR_MAX_COUNT,
  JarSelectionSchema,
  pickJarIds,
  toggleJarId,
} from "./jar-selection.ts";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `sticker-${i}`);

describe("pickJarIds auto", () => {
  test("shows everything when there are few stickers", () => {
    expect(pickJarIds({ kind: "auto", seed: 7 }, ids(5)).toSorted()).toEqual(ids(5).toSorted());
  });

  test("caps at the default count with no duplicates", () => {
    const picked = pickJarIds({ kind: "auto", seed: 7 }, ids(300));
    expect(picked).toHaveLength(JAR_DEFAULT_COUNT);
    expect(new Set(picked).size).toBe(JAR_DEFAULT_COUNT);
  });

  test("the same seed gives the same jar regardless of input order", () => {
    const a = pickJarIds({ kind: "auto", seed: 42 }, ids(200));
    const b = pickJarIds({ kind: "auto", seed: 42 }, ids(200).toReversed());
    expect(b).toEqual(a);
  });

  test("a different seed gives a different jar", () => {
    const a = pickJarIds({ kind: "auto", seed: 1 }, ids(200));
    const b = pickJarIds({ kind: "auto", seed: 2 }, ids(200));
    expect(b).not.toEqual(a);
  });

  test("deleting one sticker changes the jar by at most one block", () => {
    const all = ids(200);
    const before = pickJarIds({ kind: "auto", seed: 9 }, all);
    const gone = before[3] ?? "";
    const after = pickJarIds(
      { kind: "auto", seed: 9 },
      all.filter((id) => id !== gone),
    );
    expect(after.filter((id) => !before.includes(id))).toHaveLength(1);
    expect(after).not.toContain(gone);
  });

  test("an empty album gives an empty jar", () => {
    expect(pickJarIds({ kind: "auto", seed: 1 }, [])).toEqual([]);
  });
});

describe("pickJarIds manual", () => {
  test("keeps the chosen order", () => {
    expect(pickJarIds({ kind: "manual", ids: ["sticker-3", "sticker-1"] }, ids(5))).toEqual([
      "sticker-3",
      "sticker-1",
    ]);
  });

  test("silently drops ids that are no longer in the album", () => {
    expect(pickJarIds({ kind: "manual", ids: ["sticker-1", "gone", "sticker-2"] }, ids(5))).toEqual(
      ["sticker-1", "sticker-2"],
    );
  });

  test("ignores duplicates and never exceeds the cap", () => {
    expect(pickJarIds({ kind: "manual", ids: ["sticker-1", "sticker-1"] }, ids(5))).toEqual([
      "sticker-1",
    ]);
    const many = ids(JAR_MAX_COUNT + 20);
    expect(pickJarIds({ kind: "manual", ids: many }, many)).toHaveLength(JAR_MAX_COUNT);
  });
});

describe("toggleJarId", () => {
  test("adds, removes, and stops adding at the cap", () => {
    expect(toggleJarId(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleJarId(["a", "b"], "a")).toEqual(["b"]);
    const full = ids(JAR_MAX_COUNT);
    expect(toggleJarId(full, "extra")).toBe(full);
    expect(toggleJarId(full, "sticker-0")).toHaveLength(JAR_MAX_COUNT - 1);
  });
});

describe("JarSelectionSchema", () => {
  test("accepts both kinds and rejects malformed values", () => {
    expect(v.safeParse(JarSelectionSchema, { kind: "auto", seed: 5 }).success).toBe(true);
    expect(v.safeParse(JarSelectionSchema, { kind: "manual", ids: ["a"] }).success).toBe(true);
    expect(v.safeParse(JarSelectionSchema, { kind: "auto", seed: 1.5 }).success).toBe(false);
    expect(v.safeParse(JarSelectionSchema, { kind: "manual", ids: ids(121) }).success).toBe(false);
    expect(v.safeParse(JarSelectionSchema, { kind: "other" }).success).toBe(false);
  });
});
