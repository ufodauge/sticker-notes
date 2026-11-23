import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { detectGrid, toNative } from "../src/core/pixelart.ts";
import { decodeRgba, encodeRgba } from "../test/png.ts";

const BG: readonly [number, number, number] = [0xf6, 0xf4, 0xef];

function png(w: number, h: number, rgb: Uint8Array): Uint8Array {
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++)
    rgba.set([rgb[i * 3] ?? 0, rgb[i * 3 + 1] ?? 0, rgb[i * 3 + 2] ?? 0, 255], i * 4);
  return encodeRgba(w, h, rgba);
}

const sample = decodeRgba(readFileSync(new URL("../public/sample.png", import.meta.url)));
const grid = detectGrid(sample);
if (!grid) throw new Error("sample.png is not pixel art");
const native = toNative(sample, grid);
const { width: size, height: rows, data: rgba } = native;

function icon(side: number, safe: number): Uint8Array {
  const alpha = (x: number, y: number) => rgba[(y * size + x) * 4 + 3] ?? 0;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < size; x++)
      if (alpha(x, y)) {
        xs.push(x);
        ys.push(y);
      }
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const scale = Math.floor((side * safe) / Math.max(bw, bh));
  const ox = Math.floor((side - bw * scale) / 2);
  const oy = Math.floor((side - bh * scale) / 2);
  const out = new Uint8Array(side * side * 3);
  for (let i = 0; i < side * side; i++) out.set(BG, i * 3);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const o = ((y + y0) * size + x + x0) * 4;
      if (!rgba[o + 3]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          out.set(
            rgba.subarray(o, o + 3),
            ((oy + y * scale + dy) * side + ox + x * scale + dx) * 3,
          );
        }
      }
    }
  }
  return png(side, side, out);
}

const dir = new URL("../public/icons/", import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL("icon-192.png", dir), icon(192, 0.8));
writeFileSync(new URL("icon-512.png", dir), icon(512, 0.8));
writeFileSync(new URL("maskable-512.png", dir), icon(512, 0.6));
writeFileSync(new URL("apple-touch-icon.png", dir), icon(180, 0.75));
writeFileSync(new URL("favicon-64.png", dir), icon(64, 0.95));
console.log("icons written");
