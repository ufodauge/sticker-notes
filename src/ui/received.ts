import { peopleOf } from "../core/people.ts";
import { planReceiveToast } from "../core/receive-toast.ts";
import { snsDisplay } from "../core/sns.ts";
import { vibrateReceived } from "../data/platform.ts";
import type { Received } from "../data/receive.ts";
import { events } from "../data/events.ts";
import { settings, stickerStore } from "../data/sticker-store.ts";
import { feedback } from "./feedback.ts";
import { t } from "./messages.ts";

function ownStickerCount(): number {
  const snap = stickerStore.getSnapshot();
  return snap.status === "ready" ? snap.stickers.filter((s) => s.origin === "mine").length : 0;
}

async function invitationShown(): Promise<boolean> {
  try {
    return (await settings.get("invitationShown")) === true;
  } catch {
    return true;
  }
}

const markInvitationShown = (): Promise<void> =>
  settings.set("invitationShown", true).catch(() => undefined);

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
  const ownCount = ownStickerCount();
  const plan = planReceiveToast({
    outcome: "added",
    ownCount,
    invitationShown: ownCount > 0 || (await invitationShown()),
  });
  // saved before it shows: a reload right after must not invite again
  if (plan.persistent) await markInvitationShown();
  feedback.landed(r.stickerId, "pocket", {
    text:
      t.feedback.receivedAdded(snsDisplay(r.sticker.snsKind, r.sticker.snsId)) +
      (met === undefined ? "" : `・${t.feedback.nthPerson(met)}`),
    undo: { kind: "unreceive", stickerId: r.stickerId },
    action: { kind: plan.invite ? "create" : "return", from: r.stickerId },
    persistent: plan.persistent,
  });
}

export function reportReceived(r: Received): void {
  switch (r.kind) {
    case "invalid":
      feedback.toast({ text: t.feedback.receivedInvalid, undo: null });
      return;
    case "added":
      void announceAdded(r);
      return;
    case "duplicate":
      feedback.landed(r.stickerId, "wiggle", { text: t.feedback.receivedDuplicate, undo: null });
      return;
  }
}
