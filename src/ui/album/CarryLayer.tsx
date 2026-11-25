import { useSyncExternalStore, type CSSProperties } from "react";
import { StickerView } from "../StickerView.tsx";
import { carry } from "./carry.ts";
import styles from "./CarryLayer.module.css";

const attachLayer = (el: HTMLDivElement | null) => carry.attach(el);
const attachPeel = (el: HTMLCanvasElement | null) => carry.attachPeel(el);

// The sticker in the hand, above everything.
export function CarryLayer() {
  const held = useSyncExternalStore(carry.subscribe, carry.held);
  return (
    <div ref={attachLayer} className={styles.layer} aria-hidden="true">
      <canvas ref={attachPeel} className={styles.peel} />
      {held && (
        <span
          key={held.stickerId}
          className={styles.held}
          data-tipped={held.tipped ? "" : undefined}
          style={
            {
              "--size": `${held.size}px`,
              "--r": `${held.rotation}deg`,
              "--tip-x": held.tipped?.x ?? 0,
              "--tip-y": held.tipped?.y ?? 0,
            } as CSSProperties
          }
        >
          <StickerView sticker={held.sticker} scale={0} label="" decorative />
        </span>
      )}
    </div>
  );
}
