import { describe, expect, test } from "vite-plus/test";
import { capSpeed, isCalm, JAR_FEEL, shakeKick } from "./jar-feel.ts";

describe("shakeKick", () => {
  test("is gentle: always upward, never past the speed limit", () => {
    const side = 60;
    const corners = [0, 0.999] as const;
    for (const a of corners) {
      for (const b of corners) {
        for (const c of corners) {
          const k = shakeKick(1, side, [a, b, c]);
          expect(k.vy).toBeLessThan(0);
          expect(Math.hypot(k.vx, k.vy)).toBeLessThanOrEqual(JAR_FEEL.maxSpeed * side);
        }
      }
    }
  });
  test("scales with the pulse strength and the block size", () => {
    const r = [0.9, 0.9, 0.9] as const;
    expect(Math.abs(shakeKick(0.5, 60, r).vy)).toBeCloseTo(Math.abs(shakeKick(1, 60, r).vy) / 2);
    expect(Math.abs(shakeKick(1, 30, r).vy)).toBeCloseTo(Math.abs(shakeKick(1, 60, r).vy) / 2);
  });
  test("the pulses ease off", () => {
    const amps = JAR_FEEL.shake.pulses.map((p) => p.amp);
    expect(amps).toEqual(amps.toSorted((a, b) => b - a));
    const times = JAR_FEEL.shake.pulses.map((p) => p.at);
    expect(times).toEqual(times.toSorted((a, b) => a - b));
  });
});

describe("capSpeed", () => {
  test("keeps slow motion and scales fast motion to the limit, direction intact", () => {
    expect(capSpeed(1, 1, 60)).toEqual({ vx: 1, vy: 1 });
    const v = capSpeed(30, -40, 60);
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(JAR_FEEL.maxSpeed * 60);
    expect(v.vx / v.vy).toBeCloseTo(-0.75);
  });
});

describe("isCalm", () => {
  test("a block is calm when it is slow and not spinning, relative to its size", () => {
    expect(isCalm(0.1, 0.001, 40)).toBe(true);
    expect(isCalm(2, 0.001, 40)).toBe(false);
    expect(isCalm(0.1, 0.05, 40)).toBe(false);
    expect(isCalm(0.4, 0, 20)).toBe(false);
    expect(isCalm(0.4, 0, 80)).toBe(true);
  });
});
