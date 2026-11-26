import type { Light } from "../../core/daylight.ts";
import styles from "./Room.module.css";

// The room the album lies in: a wooden desk under it, and over everything the light of the hour
// (the window's sun, a houseplant's shadow, the blind's stripes, the desk lamp at night). The
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
  const glow = light.sun > SOME || light.blinds > SOME || light.lamp > SOME;
  if (!shade && !glow) return null;
  return (
    <div
      className={styles.light}
      aria-hidden="true"
      data-sun-side={light.sunX < 0 ? "left" : "right"}
    >
      {glow && <div className={styles.glow} />}
      {light.sun > SOME && <Plant mirrored={light.sunX > 0} />}
      {shade && <div className={styles.shade} />}
    </div>
  );
}

// A pothos by the window, seen only as its shadow: leaves on trailing stems.
function Plant({ mirrored }: { readonly mirrored: boolean }) {
  const leaves: readonly (readonly [x: number, y: number, r: number, s: number])[] = [
    [40, 30, -30, 1],
    [70, 55, 20, 0.9],
    [38, 90, -50, 1.1],
    [92, 100, 35, 0.85],
    [60, 135, -20, 1],
    [110, 150, 50, 0.9],
    [48, 185, -40, 0.95],
    [95, 205, 15, 1.05],
    [130, 200, 60, 0.8],
    [70, 240, -10, 0.9],
  ];
  return (
    <div className={styles.plant}>
      <svg viewBox="0 0 200 280">
        <g transform={mirrored ? "matrix(-1 0 0 1 200 0)" : undefined}>
          <path
            d="M10 0 C 40 60, 30 120, 60 170 S 90 250, 80 280 M10 0 C 70 50, 100 120, 120 200"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
          {leaves.map(([x, y, r, s]) => (
            <path
              key={`${x}-${y}`}
              transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}
              d="M0 0 C 18 -6, 30 8, 26 26 C 22 38, 8 42, 0 52 C -8 42, -22 38, -26 26 C -30 8, -18 -6, 0 0 Z"
              fill="currentColor"
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
