import type { Light } from "../../core/daylight.ts";
import styles from "./Room.module.css";

// The room the album lies in: a wooden desk under it, and over everything the light of the hour
// (the window's sun and its frame's shadow, a houseplant's shadow, the desk lamp at night). The
// light is laid over the desk, so pages, a page being turned and the stickers on them are all lit
// alike. It takes no touches.
//
// Blended layers over the whole screen cost every repaint under them, so only the light there is
// gets drawn: one layer that darkens and tints (multiply), one that brightens (screen), and the
// plant's shadow while the sun is out. At midday nothing is laid over the desk at all.

const SOME = 0.02;

export function Desk() {
  return <div className={styles.desk} aria-hidden="true" />;
}

export function DaylightLayer({ light }: { readonly light: Light }) {
  const shade = light.dim > SOME || light.warm > SOME;
  const glow = light.sun > SOME || light.lamp > SOME;
  if (!shade && !glow) return null;
  return (
    <div
      className={styles.light}
      aria-hidden="true"
      data-sun-side={light.sunX < 0 ? "left" : "right"}
    >
      {glow && <div className={styles.glow} />}
      {light.sun > SOME && <div className={styles.roomShade} />}
      {light.sun > SOME && (
        <div className={styles.window}>
          <div className={styles.pane} />
        </div>
      )}
      {light.sun > SOME && <Plant />}
      {shade && <div className={styles.shade} />}
    </div>
  );
}

// A pothos by the window, seen only as its shadow (the shape is src/assets/scene/plant.svg).
function Plant() {
  return (
    <div className={styles.plant}>
      <div className={styles.leaves} />
    </div>
  );
}
