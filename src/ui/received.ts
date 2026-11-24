import { snsDisplay } from "../core/sns.ts";
import type { Received } from "../data/receive.ts";
import { feedback } from "./feedback.ts";
import { t } from "./messages.ts";

export function reportReceived(r: Received): void {
  switch (r.kind) {
    case "invalid":
      feedback.toast({ text: t.feedback.receivedInvalid, undo: null });
      return;
    case "added":
      feedback.landed(r.stickerId, "arrive", {
        text: t.feedback.receivedAdded(snsDisplay(r.sticker.snsKind, r.sticker.snsId)),
        undo: { kind: "unreceive", stickerId: r.stickerId },
      });
      return;
    case "duplicate":
      feedback.landed(r.stickerId, "wiggle", { text: t.feedback.receivedDuplicate, undo: null });
      return;
  }
}
