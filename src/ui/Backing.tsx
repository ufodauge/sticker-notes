import type { ReactNode } from "react";
import type { StoredSticker } from "../data/sticker-store.ts";
import styles from "./Backing.module.css";
import { t } from "./messages.ts";
import { SnsIcon } from "./SnsIcon.tsx";
import { StickerView } from "./StickerView.tsx";

type Props = {
  readonly sticker: StoredSticker;
  readonly small?: boolean;
  readonly className?: string;
  // what sits on the paper; the sticker itself when left out
  readonly children?: ReactNode;
};

// The glossy backing paper a sticker comes on, with who it came from and when written on it.
export function Backing({ sticker, small, className, children }: Props) {
  const s = sticker.sticker;
  return (
    <span className={`${styles.backing} ${className ?? ""}`} data-small={small || undefined}>
      {children ?? (
        <span className={styles.art}>
          <StickerView sticker={s} scale={0} label="" decorative />
        </span>
      )}
      <span className={styles.note}>
        {sticker.origin === "mine" ? (
          <span>{t.pocket.made}</span>
        ) : sticker.origin === "sample" ? (
          <span>{t.pocket.sample}</span>
        ) : s.snsKind === 0 ? (
          <span>{t.pocket.friend}</span>
        ) : (
          <span className={styles.from}>
            <span className={styles.fromWord}>{t.pocket.from}</span>
            <SnsIcon kind={s.snsKind} size={12} />
            <span className={styles.id}>{s.snsId}</span>
          </span>
        )}
        {sticker.receivedAt && <span>{t.pocket.date(sticker.receivedAt)}</span>}
        {s.material && s.material.kind !== "matte" && (
          <span>{t.create.materials[s.material.kind]}</span>
        )}
      </span>
    </span>
  );
}
