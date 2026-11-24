import { expect, test } from "vite-plus/test";
import {
  JAR_SOUND,
  SURFACE_CLASS,
  dbToGain,
  impactVoice,
  plopVoice,
  rattleTicks,
  surfaceOf,
  voiceAllowed,
  type Surface,
} from "./jar-sound.ts";

const SURFACES: readonly Surface[] = ["block", "glass", "base"];
const hit = (surface: Surface, speed: number, side = 50, jitter = 0.5) =>
  impactVoice({ surface, speed, side, jitter });

test("slow impacts make no sound", () => {
  for (const s of SURFACES) {
    expect(hit(s, JAR_SOUND.minSpeed * 0.99)).toBeNull();
    expect(hit(s, 0)).toBeNull();
    expect(hit(s, JAR_SOUND.minSpeed)).not.toBeNull();
  }
});

test("harder impacts are louder and richer, up to a ceiling", () => {
  for (const s of SURFACES) {
    const voices = [0.03, 0.06, 0.1, 0.14, 0.5].map((v) => hit(s, v));
    const gains = voices.map((v) => v?.gain ?? 0);
    expect(gains).toEqual(gains.toSorted((a, b) => a - b));
    expect(gains.at(-1)).toBe(gains.at(-2));
    expect(Math.max(...gains)).toBeLessThanOrEqual(1);
    const lens = voices.map((v) => v?.freqs.length ?? 0);
    expect(lens).toEqual(lens.toSorted((a, b) => a - b));
  }
  expect(hit("block", 0.14)?.freqs).toHaveLength(3);
  expect(hit("block", 0.031)?.freqs).toHaveLength(1);
});

test("each surface has its own voice class and register", () => {
  const clack = hit("block", 0.1);
  const tonk = hit("glass", 0.1);
  const thud = hit("base", 0.1);
  expect([clack?.cls, tonk?.cls, thud?.cls]).toEqual(["clack", "tonk", "thud"]);
  expect(SURFACE_CLASS).toEqual({ block: "clack", glass: "tonk", base: "thud" });
  const lowest = (v: typeof clack) => Math.min(...(v?.freqs ?? [0]));
  expect(lowest(clack)).toBeGreaterThan(1000);
  expect(lowest(clack)).toBeLessThan(4000);
  expect(lowest(tonk)).toBeGreaterThan(300);
  expect(lowest(tonk)).toBeLessThan(800);
  expect(lowest(thud)).toBeLessThan(200);
  expect(tonk?.duration).toBeGreaterThan(clack?.duration ?? 1);
});

test("bigger blocks sound lower; jitter only detunes a little", () => {
  for (const s of SURFACES) {
    const small = hit(s, 0.1, 30)?.freqs[0] ?? 0;
    const big = hit(s, 0.1, 80)?.freqs[0] ?? 0;
    expect(big).toBeLessThan(small);
    const lo = hit(s, 0.1, 50, 0)?.freqs[0] ?? 0;
    const hi = hit(s, 0.1, 50, 0.999)?.freqs[0] ?? 0;
    expect(hi / lo).toBeGreaterThan(1.1);
    expect(hi / lo).toBeLessThan(1.25);
  }
});

test("the same input gives the same voice", () => {
  expect(hit("block", 0.09, 44, 0.3)).toEqual(hit("block", 0.09, 44, 0.3));
  expect(plopVoice(40, 0.2)).toEqual(plopVoice(40, 0.2));
});

test("surfaces: the floor is a wall hit from above, the sides are glass", () => {
  expect(surfaceOf(false, 1)).toBe("block");
  expect(surfaceOf(true, 0.95)).toBe("base");
  expect(surfaceOf(true, -1)).toBe("base");
  expect(surfaceOf(true, 0.2)).toBe("glass");
});

test("a rattle is many quick ticks inside one short span, in time order", () => {
  const jitters = Array.from({ length: 40 }, (_, i) => ((i * 0.37) % 1) * 0.999);
  const strong = rattleTicks(1, jitters);
  const weak = rattleTicks(0.45, jitters);
  expect(strong.length).toBeGreaterThan(weak.length);
  expect(strong.length).toBeGreaterThanOrEqual(10);
  expect(strong.map((t) => t.at)).toEqual(strong.map((t) => t.at).toSorted((a, b) => a - b));
  for (const t of strong) {
    expect(t.at).toBeGreaterThanOrEqual(0);
    expect(t.at).toBeLessThan(JAR_SOUND.rattle.spanSec);
    expect(t.voice.cls).toBe("tick");
  }
  expect(rattleTicks(1, [0.1, 0.2])).toHaveLength(1);
  expect(rattleTicks(1, [])).toHaveLength(0);
});

test("voice limits: a gap per class and a ceiling on simultaneous voices", () => {
  expect(voiceAllowed("clack", 100, 110, 0)).toBe(false);
  expect(voiceAllowed("clack", 100, 120, 0)).toBe(true);
  expect(voiceAllowed("tick", 100, 100, 0)).toBe(true);
  expect(voiceAllowed("clack", 0, 1000, JAR_SOUND.maxVoices)).toBe(false);
  expect(voiceAllowed("clack", 0, 1000, JAR_SOUND.maxVoices - 1)).toBe(true);
});

test("the master level leaves 12 dB of headroom", () => {
  expect(dbToGain(JAR_SOUND.masterDb)).toBeCloseTo(0.251, 3);
});
