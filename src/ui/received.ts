import { planReceiveToast } from "../core/receive-toast.ts";
import { snsDisplay } from "../core/sns.ts";
import { vibrateReceived } from "../data/platform.ts";
import type { Received } from "../data/receive.ts";
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

async function announceAdded(r: Exclude<Received, { kind: "invalid" }>): Promise<void> {
  vibrateReceived();
  const ownCount = ownStickerCount();
  const plan = planReceiveToast({
    outcome: "added",
    ownCount,
    invitationShown: ownCount > 0 || (await invitationShown()),
  });
  feedback.landed(r.stickerId, "pocket", {
    text: t.feedback.receivedAdded(snsDisplay(r.sticker.snsKind, r.sticker.snsId)),
    undo: { kind: "unreceive", stickerId: r.stickerId },
    action: plan.invite ? { kind: "create" } : undefined,
    persistent: plan.persistent,
  });
  if (plan.persistent) await markInvitationShown();
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
