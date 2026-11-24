export type JarProbe = {
  readonly stats: { frames: number; workMs: number; worstMs: number; steps: number };
  readonly reset: () => void;
  readonly blocks: () => readonly { x: number; y: number; side: number; id: string }[];
  readonly size: () => { width: number; height: number };
  readonly parts: () => number;
  readonly rescued: () => number;
  readonly awake: () => readonly { x: number; y: number; speed: number; spin: number }[];
  readonly tier: () => number;
  readonly pinTier: (tier: number | null) => void;
  readonly frozen: () => number;
};

// Only called behind `import.meta.env.VITE_JAR_PROBE`, which the e2e build sets: production
// builds drop the call and this module.
export function publishProbe(probe: JarProbe): void {
  (window as unknown as { __jarProbe?: JarProbe }).__jarProbe = probe;
}

// Perf stress: shows every sticker in the jar at once (the app caps it at JAR_MAX_COUNT).
export function publishStress(showAll: () => void): void {
  (window as unknown as { __jarStress?: () => void }).__jarStress = showAll;
}
