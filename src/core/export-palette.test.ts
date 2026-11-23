import { expect, test } from "vite-plus/test";
import { paletteFileBase, paletteGpl, paletteRgba } from "./export-palette.ts";
import { PALETTES } from "./palette.ts";

const pico = PALETTES[0];
if (!pico) throw new Error("palette");

test("16×1 pixels hold the palette colours in order", () => {
  const img = paletteRgba(pico);
  expect([img.width, img.height]).toEqual([16, 1]);
  expect(Array.from(img.data.subarray(8 * 4, 8 * 4 + 4))).toEqual([0xff, 0x00, 0x4d, 255]);
});

test("gpl lists 16 colours", () => {
  const gpl = paletteGpl(pico);
  expect(gpl.startsWith("GIMP Palette\n")).toBe(true);
  expect(gpl.trim().split("\n").slice(4)).toHaveLength(16);
  expect(gpl).toContain("255   0  77\tff004d");
});

test("file names are ascii", () => {
  expect(paletteFileBase(pico)).toBe("sticker-palette-00-pico-8");
});

test("file names collapse every run of non-alphanumerics into one hyphen", () => {
  expect(paletteFileBase({ ...pico, id: 5, name: "Foo  Bar/Baz" })).toBe(
    "sticker-palette-05-foo-bar-baz",
  );
});

test("gpl header names the palette", () => {
  expect(paletteGpl(pico)).toContain("Name: sticker-notes 0 PICO-8\nColumns: 16\n#\n");
});
