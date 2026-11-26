import type { FlowAt } from "./flows.ts";
import { madeUpSticker } from "./made-up.ts";
import type { MaterialKind } from "./material.ts";
import type { Sticker } from "./payload.ts";

// The first time through, shown by doing (the flows "tutorial.start" and "tutorial.received" in
// flows.ts). Two ways in: opened as it is (the album starts with a few sample stickers to learn
// on), or opened from a sticker someone shared (that sticker is the one to learn on, and the way
// on is to make one to give back).

export type TutorialFlow = "tutorial.start" | "tutorial.received";
export type TutorialState = (FlowAt & { readonly flow: TutorialFlow }) | { readonly done: true };

export const DONE: TutorialState = { done: true };

// Who it is for: someone opening the app for the first time (nothing in it yet, but for the
// sticker that brought them, if a link did). Anyone who already has stickers has no need of it.
export function chooseFlow(input: {
  readonly saved: TutorialState | null;
  readonly stickers: number;
  readonly arrivedByLink: boolean;
}): TutorialState {
  if (input.saved) return input.saved;
  if (input.stickers > (input.arrivedByLink ? 1 : 0)) return DONE;
  return { flow: input.arrivedByLink ? "tutorial.received" : "tutorial.start", at: 0 };
}

// The stickers the album starts with: little creatures in the materials there are to make, so
// the first look shows what a sticker can be.
const SAMPLES: readonly (readonly [seed: number, material: MaterialKind])[] = [
  [101, "puffy"],
  [202, "holo"],
  [303, "glitter"],
];

export function sampleStickers(): readonly Sticker[] {
  return SAMPLES.map(([seed, kind]) => ({
    ...madeUpSticker(seed),
    snsKind: 1,
    snsId: "sticker_notes",
    material: { kind, tone: 0 },
  }));
}
