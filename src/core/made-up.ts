import { MATERIAL_KINDS, type Material } from "./material.ts";
import { PALETTE_COUNT, PALETTES } from "./palette.ts";
import { PIXEL_COUNT, STICKER_SIZE, type Sticker } from "./payload.ts";
import { mulberry32 } from "./prng.ts";
import { SNS_KINDS } from "./sns.ts";

// A sticker someone else might have made, for trying an exchange without a second phone: a
// round little creature (mirrored, so it looks drawn on purpose) with eyes, in one of the
// palettes, from a made-up person, sometimes in a material. The same seed makes the same one.

const NAMES = ["mochi", "kumo", "hoshi", "sora", "tanuki", "pippa", "nori", "yuzu", "ame", "koko"];

export function madeUpSticker(seed: number): Sticker {
  const rand = mulberry32(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  const paletteId = Math.floor(rand() * PALETTE_COUNT);
  const palette = PALETTES[paletteId];
  // colours by lightness: the darkest draws the outline and eyes, the lightest the shine
  const byLight = (palette?.oklab ?? [])
    .map((lab, i) => ({ i, L: lab[0] }))
    .toSorted((a, b) => a.L - b.L)
    .map((c) => c.i);
  const dark = byLight[0] ?? 1;
  const light = byLight.at(-1) ?? 2;
  const middle = byLight.slice(4, -3);
  const body = pick(middle.length > 0 ? middle : [2]);
  const spot = pick(middle.filter((i) => i !== body).concat(light));
  // index 0 stays clear around the creature
  const transparent = byLight.find((i) => i !== dark && i !== light && i !== body && i !== spot);

  const half = STICKER_SIZE / 2;
  const rx = 9 + rand() * 4;
  const ry = 8 + rand() * 5;
  const cy = half + 1;
  const spots = Array.from({ length: 64 }, () => rand() < 0.22);
  const inside = (x: number, y: number) => ((x - half + 0.5) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const eyeY = Math.round(cy - ry * 0.15);
  const eyeX = Math.round(rx * 0.4);
  const pixels = Uint8Array.from({ length: PIXEL_COUNT }, (_, i) => {
    const x = i % STICKER_SIZE;
    const y = Math.floor(i / STICKER_SIZE);
    if (!inside(x, y)) return transparent ?? 0;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    if (edge) return dark;
    const mx = x < half ? half - 1 - x : x - half;
    if ((mx === eyeX || mx === eyeX - 1) && (y === eyeY || y === eyeY + 1)) return dark;
    if (mx === eyeX - 1 && y === eyeY - 1) return light;
    if (spots[(mx >> 1) * 8 + ((y - 8) >> 2)] && y > eyeY + 2) return spot;
    return body;
  });
  const material: Material | undefined =
    rand() < 0.5
      ? undefined
      : { kind: pick(MATERIAL_KINDS.filter((k) => k !== "matte" && k !== "foil")), tone: 0 };
  const snsKind = pick(SNS_KINDS);
  const name = `${pick(NAMES)}${Math.floor(rand() * 9000 + 1000)}`;
  return {
    paletteId,
    transparentIndex: transparent ?? null,
    snsKind,
    // a Bluesky handle is a domain
    snsId: snsKind === 3 ? `${name}.bsky.social` : name,
    pixels,
    ...(material ? { material } : {}),
  };
}
