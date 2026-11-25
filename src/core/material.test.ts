import { describe, expect, test } from "vite-plus/test";
import { MATERIALS, MATERIAL_KINDS, materialOfCode, peopleToUnlock } from "./material.ts";

describe("materials", () => {
  test("codes are distinct and fit the high nibble; matte is 0", () => {
    const codes = MATERIAL_KINDS.map((k) => MATERIALS[k].code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((c) => c >= 0 && c < 16)).toBe(true);
    expect(materialOfCode(0)).toBe("matte");
    expect(materialOfCode(15)).toBeUndefined();
  });

  test("matte and holo are there from the start; the rest open up with people", () => {
    expect(peopleToUnlock("matte", 0)).toBe(0);
    expect(peopleToUnlock("holo", 0)).toBe(0);
    expect(peopleToUnlock("puffy", 0)).toBe(1);
    expect(peopleToUnlock("glow", 3)).toBe(5);
    expect(peopleToUnlock("glow", 20)).toBe(0);
  });
});
