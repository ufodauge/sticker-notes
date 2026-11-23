import type { Palette } from "./palette.ts";

export function paletteRgba(p: Palette): {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray<ArrayBuffer>;
} {
  const data = new Uint8ClampedArray(16 * 4);
  p.rgb.forEach(([r, g, b], i) => data.set([r, g, b, 255], i * 4));
  return { width: 16, height: 1, data };
}

export function paletteGpl(p: Palette): string {
  const lines = p.rgb.map(
    ([r, g, b], i) =>
      `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${p.colors[i] ?? ""}`,
  );
  return `GIMP Palette\nName: sticker-notes ${p.id} ${p.name}\nColumns: 16\n#\n${lines.join("\n")}\n`;
}

export function paletteFileBase(p: Palette): string {
  return `sticker-palette-${String(p.id).padStart(2, "0")}-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
