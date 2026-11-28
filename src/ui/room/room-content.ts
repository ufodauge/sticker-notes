import { sortedPages } from "../../core/album.ts";
import type { Ready, StoredSticker } from "../../data/sticker-store.ts";
import { spreadsOf } from "../album/book.ts";
import type { FaceArt } from "../album/page-paint.ts";
import type { RoomContent } from "./room-things.ts";

// What the desk shows of the album's data: the spread lying open, the drawer, the pocket.

// in the pocket: received and not stuck anywhere yet, the latest first (as the 2D pocket has it)
export const pocketOf = (snap: Ready): readonly StoredSticker[] => {
  const placed = new Set(snap.placements.map((p) => p.stickerId));
  return snap.stickers.filter((s) => !placed.has(s.id)).toReversed();
};

export function contentOf(snap: Ready, spread: number): RoomContent {
  const open = spreadsOf(sortedPages(snap.pages))[spread];
  const stickers = new Map(snap.stickers.map((s) => [s.id, s.sticker]));
  const half = (h: 0 | 1): FaceArt =>
    open?.kind === "page"
      ? {
          kind: "page",
          half: h,
          placements: snap.placements.filter((p) => p.pageId === open.page.id),
          stickers,
        }
      : { kind: "blank" };
  return { left: half(0), right: half(1), drawer: snap.drawer, pocket: pocketOf(snap) };
}
