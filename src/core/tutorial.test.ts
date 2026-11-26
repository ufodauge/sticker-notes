import { describe, expect, test } from "vite-plus/test";
import { decodeBody, encodeBody } from "./payload.ts";
import { DONE, chooseFlow, sampleStickers, type TutorialState } from "./tutorial.ts";

describe("tutorial", () => {
  test("a first visit learns on samples; one brought by a link learns on what it received", () => {
    expect(chooseFlow({ saved: null, stickers: 0, arrivedByLink: false })).toEqual({
      flow: "tutorial.start",
      at: 0,
    });
    expect(chooseFlow({ saved: null, stickers: 1, arrivedByLink: true })).toEqual({
      flow: "tutorial.received",
      at: 0,
    });
    expect(chooseFlow({ saved: null, stickers: 0, arrivedByLink: true })).toEqual({
      flow: "tutorial.received",
      at: 0,
    });
  });

  test("anyone who already has stickers needs none; what was saved carries on", () => {
    expect(chooseFlow({ saved: null, stickers: 3, arrivedByLink: false })).toEqual(DONE);
    expect(chooseFlow({ saved: null, stickers: 2, arrivedByLink: true })).toEqual(DONE);
    const saved: TutorialState = { flow: "tutorial.start", at: 2 };
    expect(chooseFlow({ saved, stickers: 9, arrivedByLink: true })).toBe(saved);
  });

  test("the samples are real stickers, each in another material, from no one", () => {
    const samples = sampleStickers();
    expect(samples.map((s) => s.material?.kind)).toEqual(["puffy", "holo", "glitter"]);
    for (const s of samples) {
      const r = decodeBody(encodeBody(s));
      expect(r.ok && r.sticker).toEqual(s);
    }
  });
});
