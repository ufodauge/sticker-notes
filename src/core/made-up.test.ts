import { describe, expect, test } from "vite-plus/test";
import { madeUpSticker } from "./made-up.ts";
import { decodeBody, encodeBody } from "./payload.ts";
import { isValidSnsId } from "./sns.ts";

describe("madeUpSticker", () => {
  const seeds = Array.from({ length: 200 }, (_, i) => i * 7919 + 1);

  test("every one is a valid sticker that survives the trip through a link", () => {
    for (const seed of seeds) {
      const s = madeUpSticker(seed);
      expect(isValidSnsId(s.snsKind, s.snsId)).toBe(true);
      const r = decodeBody(encodeBody(s));
      expect(r.ok && r.sticker).toEqual(s);
    }
  });

  test("a creature in the middle, clear around it; the same seed makes the same one", () => {
    const s = madeUpSticker(42);
    expect(s.pixels[0]).toBe(s.transparentIndex);
    expect(s.pixels[16 * 32 + 16]).not.toBe(s.transparentIndex);
    expect(madeUpSticker(42)).toEqual(s);
    expect(madeUpSticker(43)).not.toEqual(s);
  });

  test("people and looks vary", () => {
    const all = seeds.map(madeUpSticker);
    expect(new Set(all.map((s) => s.snsId)).size).toBeGreaterThan(150);
    expect(new Set(all.map((s) => s.snsKind)).size).toBe(4);
    expect(new Set(all.map((s) => s.paletteId)).size).toBeGreaterThan(20);
    expect(all.some((s) => s.material)).toBe(true);
    expect(all.some((s) => !s.material)).toBe(true);
  });
});
