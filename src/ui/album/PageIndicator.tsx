import { useSyncExternalStore, type CSSProperties, type PointerEvent } from "react";
import { t } from "../messages.ts";
import styles from "./PageIndicator.module.css";
import { pagePosition, showPage } from "./page-position.ts";

export function PageIndicator({ count }: { readonly count: number }) {
  const index = useSyncExternalStore(pagePosition.subscribe, pagePosition.get);
  if (count < 1) return null;
  const current = Math.min(index, count - 1);
  const jump = (e: PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const at = Math.floor(((e.clientX - r.left) / r.width) * count);
    showPage(Math.min(count - 1, Math.max(0, at)));
  };
  return (
    <div className={styles.indicator}>
      <span className={styles.count} aria-live="polite">
        {current + 1} / {count}
      </span>
      <button
        type="button"
        className={styles.track}
        aria-label={t.album.pageJump}
        onPointerDown={jump}
        style={{ "--n": count, "--i": current } as CSSProperties}
      >
        <span className={styles.thumb} />
      </button>
    </div>
  );
}
