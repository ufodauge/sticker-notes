// The sound of the jar as pure numbers: an impact (speed, size, surface) becomes the parameters of
// one synthesized voice. The Web Audio side (`ui/jar/sound.ts`) only plays what this returns.
// Speeds are in block sides per physics step, like `JAR_FEEL`.

export type Surface = "block" | "glass" | "base";
export type VoiceClass = "clack" | "tonk" | "thud" | "plop" | "tick";

export type Voice = {
  readonly cls: VoiceClass;
  // peak level of the whole voice, 0..1, before the master gain
  readonly gain: number;
  // partial frequencies in Hz
  readonly freqs: readonly number[];
  readonly wave: "sine" | "triangle";
  // seconds until the partials have decayed
  readonly duration: number;
  // pitch at the end of the decay as a share of the start (1 = steady)
  readonly drop: number;
  // the noise burst at the start: level, length in seconds, band centre in Hz
  readonly noise: number;
  readonly noiseSec: number;
  readonly noiseHz: number;
};

export const JAR_SOUND = {
  maxVoices: 12,
  // slower impacts than this make no sound; at `fullSpeed` they are at full level
  minSpeed: 0.03,
  fullSpeed: 0.14,
  masterDb: -12,
  // least time between two voices of the same class
  gapMs: { clack: 20, tonk: 30, thud: 40, plop: 60, tick: 0 } as Readonly<
    Record<VoiceClass, number>
  >,
  rattle: { spanSec: 0.12 },
} as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const dbToGain = (db: number): number => 10 ** (db / 20);

export const SURFACE_CLASS: Readonly<Record<Surface, VoiceClass>> = {
  block: "clack",
  glass: "tonk",
  base: "thud",
};

// What a body hit: another block, a side wall of the jar, or the floor (a wall hit from above).
export function surfaceOf(hitsWall: boolean, normalY: number): Surface {
  if (!hitsWall) return "block";
  return Math.abs(normalY) > 0.75 ? "base" : "glass";
}

// 0 for the smallest block, 1 for the largest: bigger blocks sound lower
const sizeOf = (side: number) => clamp01((side - 24) / 66);

export type Impact = {
  readonly surface: Surface;
  readonly speed: number;
  // the block's side in CSS px
  readonly side: number;
  // a random number in [0, 1), so that no two hits sound the same
  readonly jitter: number;
};

export function impactVoice({ surface, speed, side, jitter }: Impact): Voice | null {
  if (speed < JAR_SOUND.minSpeed) return null;
  const power = clamp01((speed - JAR_SOUND.minSpeed) / (JAR_SOUND.fullSpeed - JAR_SOUND.minSpeed));
  const loud = power ** 0.8;
  const size = sizeOf(side);
  const detune = 0.92 + 0.16 * jitter;
  const parts = (ratios: readonly number[], base: number, many: number) =>
    ratios.slice(0, many).map((r, i) => base * r * (1 + 0.012 * jitter * (i + 1)));
  if (surface === "block") {
    const base = lerp(1500, 850, size) * detune;
    return {
      cls: "clack",
      gain: 0.16 + 0.5 * loud,
      freqs: parts([1, 1.83], base, power < 0.5 ? 1 : 2),
      wave: "sine",
      duration: 0.018 + 0.014 * power,
      drop: 0.9,
      noise: 0.75 + 0.2 * power,
      noiseSec: 0.006 + 0.006 * power,
      noiseHz: 1300 + 700 * power,
    };
  }
  if (surface === "glass") {
    const base = lerp(330, 210, size) * detune;
    return {
      cls: "tonk",
      gain: 0.16 + 0.5 * loud,
      freqs: parts([1, 2.76, 5.4], base, power < 0.5 ? 2 : 3),
      wave: "sine",
      duration: 0.07 + 0.09 * power,
      drop: 0.95,
      noise: 0.18,
      noiseSec: 0.004,
      noiseHz: 700,
    };
  }
  return {
    cls: "thud",
    gain: 0.2 + 0.55 * loud,
    freqs: parts([1], lerp(190, 130, size) * detune, 1),
    wave: "sine",
    duration: 0.05 + 0.04 * power,
    drop: 0.8,
    noise: 0.4,
    noiseSec: 0.006,
    noiseHz: 500,
  };
}

// A new block dropping in: a soft, round plop.
export function plopVoice(side: number, jitter: number): Voice {
  return {
    cls: "plop",
    gain: 0.16,
    freqs: [lerp(420, 260, sizeOf(side)) * (0.9 + 0.2 * jitter)],
    wave: "sine",
    duration: 0.09,
    drop: 0.55,
    noise: 0.04,
    noiseSec: 0.004,
    noiseHz: 900,
  };
}

export type Tick = { readonly at: number; readonly voice: Voice };

// One shake pulse of strength `amp` (0..1] as a dense run of quick ticks. `jitters` are random
// numbers in [0, 1), two per tick: when it falls within the pulse and what it sounds like.
export function rattleTicks(amp: number, jitters: readonly number[]): Tick[] {
  const count = Math.min(Math.round(4 + 8 * amp), Math.floor(jitters.length / 2));
  return Array.from({ length: count }, (_, i): Tick => {
    const when = jitters[2 * i] ?? 0;
    const tone = jitters[2 * i + 1] ?? 0;
    return {
      at: when * JAR_SOUND.rattle.spanSec,
      voice: {
        cls: "tick",
        gain: 0.07 + 0.1 * amp * (0.6 + 0.4 * tone),
        freqs: [lerp(900, 1600, tone)],
        wave: "sine",
        duration: 0.025 + 0.015 * tone,
        drop: 0.97,
        noise: 0.2,
        noiseSec: 0.002,
        noiseHz: 2200,
      },
    };
  }).toSorted((a, b) => a.at - b.at);
}

// May another voice of this class start now? (`lastMs` is when the previous one did.)
export function voiceAllowed(
  cls: VoiceClass,
  lastMs: number,
  nowMs: number,
  active: number,
): boolean {
  return active < JAR_SOUND.maxVoices && nowMs - lastMs >= JAR_SOUND.gapMs[cls];
}
