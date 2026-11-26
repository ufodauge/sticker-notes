import { madeUpSticker } from "./made-up.ts";
import type { MaterialKind } from "./material.ts";
import type { Sticker } from "./payload.ts";

// The first time through, shown by doing. Two ways in: opened as it is (the album starts with a
// few sample stickers to learn on), or opened from a sticker someone shared (that sticker is the
// one to learn on, and the way on is to make one to give back). Each step is done by doing it.

export type Flow = "start" | "received";
export type TutorialEvent = "peeled" | "placed" | "turned" | "create" | "created";

export const STEPS: Readonly<Record<Flow, readonly TutorialEvent[]>> = {
  // peel one off by its edge, put it down anywhere, turn a page, start making one's own
  start: ["peeled", "placed", "turned", "create"],
  // take the one received out of the pocket and stick it, then make one to give back
  received: ["placed", "created"],
};

export type TutorialState =
  | { readonly flow: Flow; readonly step: number }
  | { readonly done: true };

export const DONE: TutorialState = { done: true };

// What happened moves the tutorial on only when it is what the step asks for.
export function advance(s: TutorialState, e: TutorialEvent): TutorialState {
  if ("done" in s) return s;
  if (STEPS[s.flow][s.step] !== e) return s;
  const step = s.step + 1;
  return step >= STEPS[s.flow].length ? DONE : { ...s, step };
}

// Who it is for: someone opening the app for the first time (nothing in it yet, but for the
// sticker that brought them, if a link did). Anyone who already has stickers has no need of it.
export function chooseFlow(input: {
  readonly saved: TutorialState | null;
  readonly stickers: number;
  readonly arrivedByLink: boolean;
}): TutorialState {
  if (input.saved) return input.saved;
  if (input.stickers > (input.arrivedByLink ? 1 : 0)) return DONE;
  return { flow: input.arrivedByLink ? "received" : "start", step: 0 };
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
