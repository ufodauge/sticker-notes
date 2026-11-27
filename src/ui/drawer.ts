import { stickerStore } from "../data/sticker-store.ts";
import { feedback } from "./feedback.ts";
import { t } from "./messages.ts";

// Thrown off the album, a sticker goes into the desk's drawer (album/Drawer.tsx): kept, to be
// taken out again. Nothing to undo, then: what is thrown away is not gone.
export async function putInDrawer(stickerId: string): Promise<void> {
  if (await stickerStore.toDrawer(stickerId)) {
    feedback.landed(stickerId, "drawer", { text: t.feedback.discarded });
  }
}

// Out of the drawer, into the pocket.
export async function takeOut(stickerId: string): Promise<void> {
  await stickerStore.fromDrawer(stickerId);
  feedback.landed(stickerId, "pocket", null);
}
