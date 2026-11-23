import { PALETTE_DEFS, type PaletteDef } from "./palette-data.ts";

export type Rgb = readonly [r: number, g: number, b: number];
export type Oklab = readonly [L: number, a: number, b: number];

export type Palette = PaletteDef & {
  readonly rgb: readonly Rgb[];
  readonly oklab: readonly Oklab[];
};

export const PALETTE_COUNT = 32;

function hexToRgb(hex: string): Rgb {
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

const srgbToLinear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export function rgbToOklab([r8, g8, b8]: Rgb): Oklab {
  const r = srgbToLinear(r8);
  const g = srgbToLinear(g8);
  const b = srgbToLinear(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabDistanceSq(x: Oklab, y: Oklab): number {
  const dL = x[0] - y[0];
  const da = x[1] - y[1];
  const db = x[2] - y[2];
  return dL * dL + da * da + db * db;
}

export const PALETTES: readonly Palette[] = PALETTE_DEFS.map((def) => {
  const rgb = def.colors.map(hexToRgb);
  return { ...def, rgb, oklab: rgb.map(rgbToOklab) };
});

export function getPalette(id: number): Palette | undefined {
  return Number.isInteger(id) ? PALETTES[id] : undefined;
}
