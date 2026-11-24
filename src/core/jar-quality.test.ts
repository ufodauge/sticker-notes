import { describe, expect, test } from "vite-plus/test";
import {
  DEGRADE_MS,
  INITIAL_QUALITY,
  JAR_QUALITY_TIERS,
  nextQuality,
  qualityOf,
  RECOVER_MS,
  type QualityState,
} from "./jar-quality.ts";

const run = (s: QualityState, workMs: number, frames: number, visible = true): QualityState =>
  Array.from({ length: frames }).reduce<QualityState>(
    (acc) => nextQuality(acc, { workMs, visible, reducedMotion: false }),
    s,
  );

describe("quality tiers", () => {
  test("get cheaper step by step", () => {
    const [full, ...rest] = JAR_QUALITY_TIERS;
    expect(full?.stepHz).toBe(60);
    expect(full?.pixelRatioCap).toBe(2);
    expect(rest.at(-1)?.activeCap).toBeLessThan(Number.POSITIVE_INFINITY);
    expect(rest.every((t) => t.stepHz <= 60 && t.pixelRatioCap <= 2)).toBe(true);
  });
});

describe("nextQuality", () => {
  test("stays at full quality while the work is cheap", () => {
    expect(run(INITIAL_QUALITY, 2, 2000).tier).toBe(0);
  });

  test("a single spike does not degrade", () => {
    const s = nextQuality(run(INITIAL_QUALITY, 2, 100), {
      workMs: 120,
      visible: true,
      reducedMotion: false,
    });
    expect(s.tier).toBe(0);
  });

  test("sustained heavy work walks down one tier at a time to the last", () => {
    const first = run(INITIAL_QUALITY, DEGRADE_MS + 5, 200);
    expect(first.tier).toBeGreaterThanOrEqual(1);
    expect(run(INITIAL_QUALITY, DEGRADE_MS + 5, 5000).tier).toBe(JAR_QUALITY_TIERS.length - 1);
    const tiers = Array.from({ length: 400 }).reduce<{ s: QualityState; seen: number[] }>(
      ({ s, seen }) => {
        const n = nextQuality(s, { workMs: 30, visible: true, reducedMotion: false });
        return { s: n, seen: n.tier === s.tier ? seen : [...seen, n.tier] };
      },
      { s: INITIAL_QUALITY, seen: [] },
    ).seen;
    expect(tiers).toEqual(tiers.toSorted().filter((t, i, a) => a.indexOf(t) === i));
    expect(tiers[0]).toBe(1);
  });

  test("recovers only after a long calm period", () => {
    const heavy = run(INITIAL_QUALITY, DEGRADE_MS + 5, 100);
    expect(heavy.tier).toBeGreaterThan(0);
    const warm = run(heavy, RECOVER_MS - 1, 100);
    expect(warm.tier).toBe(heavy.tier);
    expect(run(heavy, RECOVER_MS - 1, 2000).tier).toBeLessThan(heavy.tier);
  });

  test("a work level between the thresholds neither degrades nor recovers", () => {
    const heavy = run(INITIAL_QUALITY, DEGRADE_MS + 5, 100);
    expect(run(heavy, (DEGRADE_MS + RECOVER_MS) / 2, 5000).tier).toBe(heavy.tier);
  });

  test("a recovery that gets undone makes the next recovery wait longer", () => {
    const heavy = run(INITIAL_QUALITY, 15, 100);
    const calm = run(heavy, 1, 400);
    expect(calm.tier).toBe(heavy.tier - 1);
    const again = run(calm, 15, 100);
    expect(again.tier).toBe(heavy.tier);
    expect(again.calmNeeded).toBeGreaterThan(heavy.calmNeeded);
    expect(run(again, 1, 400).tier).toBe(again.tier);
  });

  test("hidden frames are ignored", () => {
    expect(run(INITIAL_QUALITY, 500, 1000, false)).toEqual(INITIAL_QUALITY);
  });

  test("reduced motion goes back to full quality", () => {
    const heavy = run(INITIAL_QUALITY, 30, 200);
    expect(nextQuality(heavy, { workMs: 30, visible: true, reducedMotion: true })).toEqual(
      INITIAL_QUALITY,
    );
    expect(qualityOf(INITIAL_QUALITY).stepHz).toBe(60);
  });
});
