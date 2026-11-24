// How the blocks move: every tunable of the jar's physics feel in one place.
// Speeds are in block sides per physics step (60Hz), so they scale with the block size.

export const JAR_FEEL = {
  restitution: 0.04,
  wallRestitution: 0.02,
  friction: 0.5,
  frictionStatic: 0.7,
  // air drag: lets a pile lose its last motion sooner
  frictionAir: 0.022,
  // angular velocity kept per step (a little rolling resistance)
  spinKept: 0.985,
  // idle steps before a body falls asleep (Matter's default is 60)
  sleepSteps: 40,
  // no block ever moves faster than this, whatever pushed it
  maxSpeed: 0.16,
  // below this speed (and spin) a block counts as still; if all awake blocks stay still this many
  // steps in a row, the pile is put to sleep
  calmSpeed: 0.012,
  calmSpin: 0.004,
  calmSteps: 90,
  shake: {
    // three eased pulses instead of one kick: when (ms after the press) and how strong
    pulses: [
      { at: 0, amp: 1 },
      { at: 150, amp: 0.7 },
      { at: 310, amp: 0.45 },
    ],
    lift: 0.1,
    sway: 0.05,
    spin: 0.05,
  },
} as const;

export type Kick = { readonly vx: number; readonly vy: number; readonly spin: number };

// One block's share of a shake pulse. `r` are three random numbers in [0, 1).
export function shakeKick(amp: number, side: number, r: readonly [number, number, number]): Kick {
  const { lift, sway, spin } = JAR_FEEL.shake;
  return {
    vx: (r[0] - 0.5) * 2 * sway * side * amp,
    vy: -side * lift * (0.4 + 0.6 * r[1]) * amp,
    spin: (r[2] - 0.5) * 2 * spin * amp,
  };
}

// Scales a velocity down to the speed limit (unchanged when slower).
export function capSpeed(vx: number, vy: number, side: number): { vx: number; vy: number } {
  const limit = JAR_FEEL.maxSpeed * side;
  const speed = Math.hypot(vx, vy);
  return speed <= limit ? { vx, vy } : { vx: (vx / speed) * limit, vy: (vy / speed) * limit };
}

export const isCalm = (speed: number, spin: number, side: number): boolean =>
  speed < JAR_FEEL.calmSpeed * side && Math.abs(spin) < JAR_FEEL.calmSpin;
