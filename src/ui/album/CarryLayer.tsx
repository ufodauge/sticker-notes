import { useSyncExternalStore, type CSSProperties } from "react";
import { StickerView } from "../StickerView.tsx";
import { carry } from "./carry.ts";
import styles from "./CarryLayer.module.css";

const attachLayer = (el: HTMLDivElement | null) => carry.attach(el);

// The sticker in the hand, above everything.
export function CarryLayer() {
  const held = useSyncExternalStore(carry.subscribe, carry.held);
  return (
    <div ref={attachLayer} className={styles.layer} aria-hidden="true">
      {held && (
        <span
          key={held.stickerId}
          className={styles.held}
          style={{ "--size": `${held.size}px`, "--r": `${held.rotation}deg` } as CSSProperties}
        >
          <StickerView sticker={held.sticker} scale={0} label="" decorative />
        </span>
      )}
    </div>
  );
}
