import { describe, expect, test } from "vite-plus/test";
import { decodeBody, encodeBody } from "./payload.ts";
import {
  DONE,
  STEPS,
  advance,
  chooseFlow,
  sampleStickers,
  type TutorialState,
} from "./tutorial.ts";

describe("tutorial", () => {
  test("a first visit learns on samples; one brought by a link learns on what it received", () => {
    expect(chooseFlow({ saved: null, stickers: 0, arrivedByLink: false })).toEqual({
      flow: "start",
      step: 0,
    });
    expect(chooseFlow({ saved: null, stickers: 1, arrivedByLink: true })).toEqual({
      flow: "received",
      step: 0,
    });
    expect(chooseFlow({ saved: null, stickers: 0, arrivedByLink: true })).toEqual({
      flow: "received",
      step: 0,
    });
  });

  test("anyone who already has stickers needs none; what was saved carries on", () => {
    expect(chooseFlow({ saved: null, stickers: 3, arrivedByLink: false })).toEqual(DONE);
    expect(chooseFlow({ saved: null, stickers: 2, arrivedByLink: true })).toEqual(DONE);
    const saved: TutorialState = { flow: "start", step: 2 };
    expect(chooseFlow({ saved, stickers: 9, arrivedByLink: true })).toBe(saved);
  });

  test("each step is done by doing it; anything else changes nothing", () => {
    const run = (events: Parameters<typeof advance>[1][]) =>
      events.reduce<TutorialState>((s, e) => advance(s, e), { flow: "start", step: 0 });
    expect(run(["placed"])).toEqual({ flow: "start", step: 0 });
    expect(run(["peeled"])).toEqual({ flow: "start", step: 1 });
    expect(run(["peeled", "turned"])).toEqual({ flow: "start", step: 1 });
    expect(run(["peeled", "placed", "turned"])).toEqual({ flow: "start", step: 3 });
    expect(run(STEPS.start.slice())).toEqual(DONE);
    expect(advance(DONE, "peeled")).toBe(DONE);
  });

  test("the received way: stick it, then make one to give back", () => {
    const s0: TutorialState = { flow: "received", step: 0 };
    const s1 = advance(s0, "placed");
    expect(s1).toEqual({ flow: "received", step: 1 });
    expect(advance(s1, "create")).toEqual(s1);
    expect(advance(s1, "created")).toEqual(DONE);
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
