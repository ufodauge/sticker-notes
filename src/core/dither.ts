import type { Oklab } from "./palette.ts";
import { STICKER_SIZE } from "./payload.ts";

const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

const thresholdAt = (pixel: number): number => {
  const x = pixel % STICKER_SIZE;
  const y = Math.floor(pixel / STICKER_SIZE);
  return ((BAYER_4[(y % 4) * 4 + (x % 4)] ?? 0) + 0.5) / 16;
};

export function prefersSecond(target: Oklab, first: Oklab, second: Oklab, pixel: number): boolean {
  const axis = [second[0] - first[0], second[1] - first[1], second[2] - first[2]] as const;
  const lengthSq = axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2;
  if (lengthSq === 0) return false;
  const along =
    ((target[0] - first[0]) * axis[0] +
      (target[1] - first[1]) * axis[1] +
      (target[2] - first[2]) * axis[2]) /
    lengthSq;
  return along > thresholdAt(pixel);
}
