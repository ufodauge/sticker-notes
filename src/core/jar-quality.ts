export type JarQuality = {
  readonly stepHz: 60 | 30;
  readonly pixelRatioCap: 2 | 1;
  // collision parts (a block has 1 to 6) beyond this many, counted from the top of the pile, stay as a static pile
  readonly activeParts: number;
};

export const JAR_QUALITY_TIERS: readonly JarQuality[] = [
  { stepHz: 60, pixelRatioCap: 2, activeParts: Number.POSITIVE_INFINITY },
  { stepHz: 30, pixelRatioCap: 2, activeParts: Number.POSITIVE_INFINITY },
  { stepHz: 30, pixelRatioCap: 1, activeParts: Number.POSITIVE_INFINITY },
  { stepHz: 30, pixelRatioCap: 1, activeParts: 160 },
];

const LAST_TIER = JAR_QUALITY_TIERS.length - 1;
// average per-frame work (physics + paint) above which the next tier is taken
export const DEGRADE_MS = 10;
// average below which a calm period starts counting toward the previous tier
export const RECOVER_MS = 3;
const SMOOTHING = 0.08;
// one long frame (a GC pause, a tab switch) must not look like sustained load
const MAX_SAMPLE_MS = 30;
const WARMUP_FRAMES = 30;
const CALM_FRAMES = 240;
const MAX_CALM_FRAMES = CALM_FRAMES * 16;

export type QualityState = {
  readonly tier: number;
  readonly average: number;
  readonly samples: number;
  readonly calm: number;
  // frames of calm needed before going back up; doubles when a recovery is undone
  readonly calmNeeded: number;
  readonly recovered: boolean;
};

export type FrameInput = {
  readonly workMs: number;
  readonly visible: boolean;
  readonly reducedMotion: boolean;
};

export const INITIAL_QUALITY: QualityState = {
  tier: 0,
  average: 0,
  samples: 0,
  calm: 0,
  calmNeeded: CALM_FRAMES,
  recovered: false,
};

const moveTo = (s: QualityState, tier: number, recovered: boolean): QualityState => ({
  ...INITIAL_QUALITY,
  tier,
  calmNeeded: s.calmNeeded,
  recovered,
});

export function nextQuality(s: QualityState, input: FrameInput): QualityState {
  if (input.reducedMotion) return INITIAL_QUALITY;
  if (!input.visible) return s;

  const sample = Math.min(MAX_SAMPLE_MS, input.workMs);
  const average = s.samples === 0 ? sample : s.average + (sample - s.average) * SMOOTHING;
  const measured = { ...s, average, samples: s.samples + 1 };
  if (measured.samples < WARMUP_FRAMES) return measured;

  if (average > DEGRADE_MS && s.tier < LAST_TIER) {
    const next = moveTo(s, s.tier + 1, false);
    return s.recovered
      ? { ...next, calmNeeded: Math.min(MAX_CALM_FRAMES, s.calmNeeded * 2) }
      : next;
  }
  if (average < RECOVER_MS && s.tier > 0) {
    const calm = s.calm + 1;
    return calm >= s.calmNeeded ? moveTo(s, s.tier - 1, true) : { ...measured, calm };
  }
  return { ...measured, calm: 0 };
}

export const qualityOf = (s: QualityState): JarQuality => {
  const tier = JAR_QUALITY_TIERS[s.tier];
  if (!tier) throw new Error("no quality tier");
  return tier;
};
