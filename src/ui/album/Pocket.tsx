import type { CSSProperties } from "react";
import type { StoredSticker } from "../../data/sticker-store.ts";
import type { Highlight } from "../feedback.ts";
import { t } from "../messages.ts";
import { StickerView } from "../StickerView.tsx";
import { jumble } from "./jumble.ts";
import styles from "./Pocket.module.css";

type Props = {
  readonly stickers: readonly StoredSticker[];
  readonly highlight: Highlight | null;
  readonly onOpen: () => void;
};

const PEEKING = 3;

export function Pocket({ stickers, highlight, onOpen }: Props) {
  if (stickers.length === 0) return null;
  const hit = highlight && stickers.some((s) => s.id === highlight.stickerId) ? highlight : null;
  return (
    <button
      type="button"
      className={styles.pocket}
      aria-label={t.pocket.open(stickers.length)}
      title={t.pocket.dialog}
      onClick={onOpen}
    >
      <span key={hit?.nonce ?? 0} className={styles.body} data-effect={hit?.effect}>
        {stickers.slice(0, PEEKING).map((s, i) => (
          <span
            key={s.id}
            className={styles.peek}
            style={
              {
                "--i": i,
                "--r": `${jumble(s.id, 50)}deg`,
                "--dx": `${jumble(s.id, 16, 10)}px`,
              } as CSSProperties
            }
          >
            <StickerView sticker={s.sticker} scale={0} label="" decorative />
          </span>
        ))}
        <span className={styles.film} />
      </span>
      <span className={styles.count} aria-hidden="true">
        {stickers.length}
      </span>
    </button>
  );
}
