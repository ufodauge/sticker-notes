import type { CSSProperties } from "react";
import type { StoredSticker } from "../../data/sticker-store.ts";
import type { Highlight } from "../feedback.ts";
import { t } from "../messages.ts";
import { StickerView } from "../StickerView.tsx";
import styles from "./Drawer.module.css";
import { jumble } from "./jumble.ts";

type Props = {
  readonly stickers: readonly StoredSticker[];
  readonly highlight: Highlight | null;
  readonly onOpen: () => void;
};

const PEEKING = 3;

// The desk's drawer, pulled open a little at the top left: stickers thrown off the album lie in
// it, the last few showing. Tapped, it opens to take one out. Not there while it is empty.
export function Drawer({ stickers, highlight, onOpen }: Props) {
  if (stickers.length === 0) return null;
  const hit = highlight?.effect === "drawer" ? highlight : null;
  return (
    <button
      type="button"
      className={styles.drawer}
      aria-label={t.drawer.open(stickers.length)}
      title={t.drawer.dialog}
      data-drawer=""
      onClick={onOpen}
    >
      {/* the drawer shakes a little as one goes in */}
      <span key={hit?.nonce ?? 0} className={styles.box} data-in={hit ? "" : undefined}>
        <span className={styles.inside}>
          {stickers.slice(-PEEKING).map((s, i) => (
            <span
              key={s.id}
              className={styles.peek}
              style={{ "--i": i, "--r": `${jumble(s.id, 30)}deg` } as CSSProperties}
            >
              <StickerView sticker={s.sticker} scale={1} label="" decorative />
            </span>
          ))}
        </span>
        <span className={styles.front}>
          <span className={styles.handle} />
        </span>
      </span>
    </button>
  );
}
