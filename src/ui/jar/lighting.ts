import { lightAt, LIGHT_FLOOR, type Beam } from "../../core/jar-light.ts";

// The lamp's grading of the blocks, as one picture drawn over them once per frame with
// `source-atop`: dark where the light has faded, a warm veil in the pool under the mouth.
// It is built per size only, at half resolution (it is all smooth gradient).
const SCALE = 0.5;
const MAX_SHADE = 0.62;
const MAX_VEIL = 0.16;
const MID = 0.6;

export function makeGrade(beam: Beam, width: number, height: number, k: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const w = Math.max(1, Math.round(width * k * SCALE));
  const h = Math.max(1, Math.round(height * k * SCALE));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const image = ctx.createImageData(w, h);
  const { data } = image;
  Array.from({ length: h }, (_, py) => {
    Array.from({ length: w }, (_, px) => {
      const level = lightAt(beam, (px + 0.5) / (k * SCALE), (py + 0.5) / (k * SCALE));
      const at = (py * w + px) * 4;
      const lit = level >= MID;
      const alpha = lit
        ? ((level - MID) / (1 - MID)) * MAX_VEIL
        : ((MID - level) / (MID - LIGHT_FLOOR)) * MAX_SHADE;
      const tone = lit ? 255 : 0;
      data[at] = tone;
      data[at + 1] = lit ? 244 : 0;
      data[at + 2] = lit ? 220 : 0;
      data[at + 3] = Math.round(alpha * 255);
    });
  });
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// A soft four-pointed spark, drawn once, scaled per block.
export function makeGlint(): HTMLCanvasElement {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const half = size / 2;
  ctx.translate(half, half);
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, half);
  halo.addColorStop(0, "rgb(255 250 235 / 0.9)");
  halo.addColorStop(0.18, "rgb(255 244 220 / 0.35)");
  halo.addColorStop(1, "rgb(255 244 220 / 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(-half, -half, size, size);
  ctx.globalCompositeOperation = "lighter";
  [0, Math.PI / 2].forEach((angle) => {
    ctx.save();
    ctx.rotate(angle);
    const ray = ctx.createLinearGradient(-half, 0, half, 0);
    ray.addColorStop(0, "rgb(255 250 235 / 0)");
    ray.addColorStop(0.5, "rgb(255 250 235 / 0.8)");
    ray.addColorStop(1, "rgb(255 250 235 / 0)");
    ctx.fillStyle = ray;
    ctx.fillRect(-half, -1, size, 2);
    ctx.restore();
  });
  return canvas;
}
