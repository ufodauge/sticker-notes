import { Smartphone, Vibrate } from "lucide-react";
import { useReducer, useRef, useSyncExternalStore } from "react";
import { snsDisplay } from "../../core/sns.ts";
import type { StoredSticker } from "../../data/sticker-store.ts";
import common from "../common.module.css";
import { t } from "../messages.ts";
import { askTilt, reducedMotion, tiltAvailable } from "./device.ts";
import { createJar, type JarHandle } from "./engine.ts";
import styles from "./Jar.module.css";
import { makeBlockSprite } from "./sprite.ts";

// Backing-store cap: 2x is plenty for blocks this small, and the fill cost grows with dpr^2.
const MAX_PIXEL_RATIO = 2;

type Props = { readonly stickers: readonly StoredSticker[] };

export function Jar({ stickers }: Props) {
  const reduced = useSyncExternalStore(reducedMotion.subscribe, reducedMotion.get);
  const handle = useRef<JarHandle | null>(null);
  const [tilting, setTilting] = useReducer((_: boolean, next: boolean) => next, false);

  // The canvas is sized by CSS; every size change rebuilds the simulation (resize is rare).
  const attach = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const build = (width: number, height: number) => {
      handle.current?.dispose();
      handle.current = createJar({
        canvas,
        width,
        height,
        pixelRatio: Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1),
        count: stickers.length,
        sprite: (i, slab) => {
          const s = stickers[i];
          if (!s) throw new Error("no sticker");
          return makeBlockSprite(s.sticker, slab);
        },
        still: reduced,
      });
    };
    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect;
      if (box && box.width > 0 && box.height > 0) build(box.width, box.height);
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      handle.current?.dispose();
      handle.current = null;
      setTilting(false);
    };
  };

  const toggleTilt = async () => {
    const on = !tilting && (await askTilt());
    handle.current?.setTilt(on);
    setTilting(on);
  };

  return (
    <section className={styles.stage} aria-label={t.jar.label}>
      <div className={styles.jar}>
        <canvas ref={attach} className={styles.canvas} aria-hidden="true" />
      </div>
      {!reduced && (
        <div className={styles.tools}>
          <button
            type="button"
            className={common.icon}
            aria-label={t.jar.shake}
            title={t.jar.shake}
            onClick={() => handle.current?.shake()}
          >
            <Vibrate aria-hidden="true" size={22} strokeWidth={1.5} />
          </button>
          {tiltAvailable() && (
            <button
              type="button"
              className={common.icon}
              aria-label={t.jar.tilt}
              title={t.jar.tilt}
              aria-pressed={tilting}
              onClick={() => void toggleTilt()}
            >
              <Smartphone aria-hidden="true" size={22} strokeWidth={1.5} />
            </button>
          )}
        </div>
      )}
      <ul className={common.visuallyHidden} aria-label={t.jar.list}>
        {stickers.map((s) => (
          <li key={s.id}>{snsDisplay(s.sticker.snsKind, s.sticker.snsId)}</li>
        ))}
      </ul>
    </section>
  );
}
