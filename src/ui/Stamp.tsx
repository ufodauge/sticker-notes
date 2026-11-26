import type { Stamp as StampData } from "./feedback.ts";
import { t } from "./messages.ts";
import styles from "./Stamp.module.css";

// Pressed over the desk when a sticker comes from someone new, like a rubber stamp in a passport:
// the count of people met. It thumps down, holds a moment and fades. (The toast says it in words.)
export function Stamp({
  stamp,
  onDone,
}: {
  readonly stamp: StampData;
  readonly onDone: () => void;
}) {
  return (
    <div
      className={styles.stamp}
      aria-hidden="true"
      onAnimationEnd={(e) => {
        if (e.animationName.includes("fade")) onDone();
      }}
    >
      <span className={styles.ring}>{t.feedback.nthPerson(stamp.n)}</span>
    </div>
  );
}
