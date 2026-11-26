// The light on the desk at a time of day, from the device's clock alone (no setting overrides it:
// the album looks as the hour makes it look). Values between the keyframes are eased across, so
// the light drifts through the day rather than switching.

export type Light = {
  // direct sun through the window: how strong (0..1), and from which side (-1 left .. 1 right)
  readonly sun: number;
  readonly sunX: number;
  // how long the shadows fall (0 short, 1 long: a low sun)
  readonly length: number;
  // an orange cast (0..1)
  readonly warm: number;
  // how dark the room is around the light (0..1)
  readonly dim: number;
  // the desk lamp's pool of light (0..1)
  readonly lamp: number;
  // light falling in stripes through the blind (0..1)
  readonly blinds: number;
};

export type Phase = "morning" | "day" | "evening" | "night";

const NIGHT: Light = { sun: 0, sunX: 0, length: 0, warm: 0.45, dim: 0.5, lamp: 1, blinds: 0 };

// minutes after midnight → the light then
const KEYS: readonly (readonly [number, Light])[] = [
  [0, NIGHT],
  [5 * 60, NIGHT],
  [6 * 60 + 30, { sun: 1, sunX: -1, length: 0.9, warm: 0.15, dim: 0.1, lamp: 0, blinds: 0 }],
  [10 * 60, { sun: 0.35, sunX: -0.3, length: 0.3, warm: 0, dim: 0, lamp: 0, blinds: 0 }],
  [15 * 60, { sun: 0.35, sunX: 0.3, length: 0.3, warm: 0, dim: 0, lamp: 0, blinds: 0 }],
  [17 * 60 + 30, { sun: 1, sunX: 1, length: 1, warm: 1, dim: 0.18, lamp: 0, blinds: 1 }],
  [19 * 60, NIGHT],
  [24 * 60, NIGHT],
];

const ease = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

const MINUTES_PER_DAY = 24 * 60;

export function lightAt(minutes: number): Light {
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const i = KEYS.findIndex(([at], k) => m >= at && m < (KEYS[k + 1]?.[0] ?? Infinity));
  const [a, from] = KEYS[i] ?? KEYS[0] ?? [0, NIGHT];
  const [b, to] = KEYS[i + 1] ?? [MINUTES_PER_DAY, NIGHT];
  const t = ease(b > a ? (m - a) / (b - a) : 0);
  return {
    sun: mix(from.sun, to.sun, t),
    sunX: mix(from.sunX, to.sunX, t),
    length: mix(from.length, to.length, t),
    warm: mix(from.warm, to.warm, t),
    dim: mix(from.dim, to.dim, t),
    lamp: mix(from.lamp, to.lamp, t),
    blinds: mix(from.blinds, to.blinds, t),
  };
}

// The part of the day the light mostly belongs to.
export function phaseOf(light: Light, minutes: number): Phase {
  if (light.lamp >= 0.5) return "night";
  if (light.warm >= 0.5) return "evening";
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return m < 12 * 60 && light.sun >= 0.5 ? "morning" : "day";
}
