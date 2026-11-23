import { stickerStore } from "../data/sticker-store.ts";
import { feedback, type Undo } from "./feedback.ts";

export async function undo(u: Undo): Promise<void> {
  feedback.toast(null);
  if (u.kind === "unreceive") {
    await stickerStore.discard(u.stickerId);
    return;
  }
  await stickerStore.restore(u.discarded);
  feedback.landed(u.discarded.sticker.id, "arrive", null);
}

export async function discardSticker(stickerId: string): Promise<void> {
  const discarded = await stickerStore.discard(stickerId);
  if (discarded) {
    feedback.toast({
      text: "ポイした",
      undo: {
        kind: "restore",
        discarded,
      },
    });
  }
}
