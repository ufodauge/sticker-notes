import { peopleOf } from "../core/people.ts";
import { snsHandle } from "../core/sns.ts";
import { giveBack } from "./give-back.ts";
import { vibrateReceived } from "../data/platform.ts";
import type { Received } from "../data/receive.ts";
import { events } from "../data/events.ts";
import { stickerStore } from "../data/sticker-store.ts";
import { feedback } from "./feedback.ts";
import { t } from "./messages.ts";

// The number of the person this sticker came from, if it is the first from them (so they are met
// just now); undefined for someone already met.
function newPerson(stickerId: string): number | undefined {
  const snap = stickerStore.getSnapshot();
  if (snap.status !== "ready") return undefined;
  const people = peopleOf(snap.stickers);
  const i = people.findIndex((p) => p.stickerIds.includes(stickerId));
  return i >= 0 && people[i]?.stickerIds.length === 1 ? people.length : undefined;
}

async function announceAdded(r: Exclude<Received, { kind: "invalid" }>): Promise<void> {
  vibrateReceived();
  const met = newPerson(r.stickerId);
  events.emit({
    type: "sticker.received",
    stickerId: r.stickerId,
    ...(met === undefined ? {} : { met }),
  });
  // one thing to do next: make one back (the create button beats; giveBack)
  giveBack.set(r.stickerId);
  const who = snsHandle(r.sticker.snsKind, r.sticker.snsId);
  feedback.landed(r.stickerId, "pocket", {
    text: who ? t.feedback.receivedFrom(who) : t.feedback.receivedSome,
  });
}

export function reportReceived(r: Received): void {
  switch (r.kind) {
    case "invalid":
      feedback.toast({ text: t.feedback.receivedInvalid });
      return;
    case "added":
      void announceAdded(r);
      return;
    case "duplicate":
      feedback.landed(r.stickerId, "wiggle", { text: t.feedback.receivedDuplicate });
      return;
  }
}
