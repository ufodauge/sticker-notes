import { snsDisplay } from "../core/sns.ts";
import type { Received } from "../data/receive.ts";
import { feedback } from "./feedback.ts";

export function reportReceived(r: Received): void {
  switch (r.kind) {
    case "invalid":
      feedback.toast({ text: "読み込めないステッカー", undo: null });
      return;
    case "added":
      feedback.landed(r.stickerId, "arrive", {
        text: `${snsDisplay(r.sticker.snsKind, r.sticker.snsId)} を貼った`,
        undo: { kind: "unreceive", stickerId: r.stickerId },
      });
      return;
    case "duplicate":
      feedback.landed(r.stickerId, "wiggle", { text: "もう貼ってある", undo: null });
      return;
  }
}
