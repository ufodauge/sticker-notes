import { expect, test } from "vite-plus/test";
import { PALETTES, PALETTE_COUNT, getPalette, oklabDistanceSq, rgbToOklab } from "./palette.ts";

test("32 palettes × 16 distinct colors, ids match positions", () => {
  expect(PALETTES).toHaveLength(PALETTE_COUNT);
  PALETTES.forEach((p, i) => {
    expect(p.id).toBe(i);
    expect(p.colors).toHaveLength(16);
    expect(new Set(p.colors).size).toBe(16);
    p.colors.forEach((c) => expect(c).toMatch(/^[0-9a-f]{6}$/));
    expect(p.transparentDefault).toBeGreaterThanOrEqual(0);
    expect(p.transparentDefault).toBeLessThan(16);
  });
});

test("palette contents are frozen (payload v1 compatibility)", async () => {
  const text = PALETTES.map((p) => `${p.id}:${p.colors.join(",")}:${p.transparentDefault}`).join(
    "\n",
  );
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const digest = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
  expect(digest).toMatchSnapshot();
});

test("oklab sanity", () => {
  const [Lw, aw, bw] = rgbToOklab([255, 255, 255]);
  expect(Lw).toBeCloseTo(1, 4);
  expect(aw).toBeCloseTo(0, 4);
  expect(bw).toBeCloseTo(0, 4);
  expect(rgbToOklab([0, 0, 0])[0]).toBeCloseTo(0, 6);
});

test("getPalette bounds", () => {
  expect(getPalette(0)?.name).toBe("PICO-8");
  expect(getPalette(32)).toBeUndefined();
  expect(getPalette(1.5)).toBeUndefined();
});

test("dark colours use the linear segment of the sRGB curve", () => {
  const [L] = rgbToOklab([5, 5, 5]);
  expect(L).toBeCloseTo(Math.cbrt(5 / 255 / 12.92), 4);
  const [L2] = rgbToOklab([128, 128, 128]);
  expect(L2).toBeCloseTo(Math.cbrt(((128 / 255 + 0.055) / 1.055) ** 2.4), 4);
});

test("oklabDistanceSq is the squared euclidean distance", () => {
  expect(oklabDistanceSq([1, 2, 3], [4, 6, 3])).toBe(25);
});
