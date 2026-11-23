import { decode, encode } from "fast-png";

export type RgbaImage = { width: number; height: number; data: Uint8ClampedArray };

export function decodeRgba(png: Uint8Array): RgbaImage {
  const img = decode(png);
  const { width, height, channels } = img;
  const src = img.data;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const gray = channels < 3;
    data[i * 4] = Number(src[i * channels]);
    data[i * 4 + 1] = Number(src[i * channels + (gray ? 0 : 1)]);
    data[i * 4 + 2] = Number(src[i * channels + (gray ? 0 : 2)]);
    data[i * 4 + 3] =
      channels === 4 || channels === 2 ? Number(src[i * channels + channels - 1]) : 255;
  }
  return { width, height, data };
}

export function encodeRgba(
  width: number,
  height: number,
  rgba: Uint8Array | Uint8ClampedArray,
): Uint8Array {
  return encode({ width, height, data: new Uint8Array(rgba), channels: 4, depth: 8 });
}
