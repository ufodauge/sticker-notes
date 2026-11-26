import type { CSSProperties } from "react";
import { lightAt, phaseOf } from "../../core/daylight.ts";
import { madeUpSticker } from "../../core/made-up.ts";
import { MATERIAL_KINDS, type MaterialKind } from "../../core/material.ts";
import type { Sticker } from "../../core/payload.ts";
import { debugText, t } from "../messages.ts";
import { lightStyle } from "../scene/light-style.ts";
import { DaylightLayer, Desk } from "../scene/Room.tsx";
import { StickerView } from "../StickerView.tsx";
import styles from "./Samples.module.css";

// Debug builds only (`?samples`): the scene's look laid out on one page for a design review, with
// nothing to set up: the desk at four hours, every material under each light, and the felt mat
// and the laptop with stickers on them. Values come from src/styles/scene.css as in the app.

const HOURS = [7, 12, 17.5, 21] as const;

function withMaterial(seed: number, kind: MaterialKind): Sticker {
  const s = madeUpSticker(seed);
  if (kind === "matte") return { ...s, material: undefined };
  // foil turns one of the art's own colours to metal (never the transparent one)
  const tone = [...s.pixels].find((p) => p !== s.transparentIndex) ?? 1;
  return { ...s, material: { kind, tone: kind === "foil" ? tone : 0 } };
}

export function Samples() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{debugText.samples}</h1>
      <section className={styles.grid}>
        {HOURS.map((hour) => {
          const light = lightAt(hour * 60);
          // the shine stickers catch (in the app these sit on the root, from the clock)
          const shine = {
            ...lightStyle(light),
            "--light-x": (light.sunX * light.sun).toFixed(3),
            "--glint": Math.max(light.sun, light.lamp * 0.8).toFixed(3),
          } as CSSProperties;
          return (
            <figure key={hour} className={styles.scene} style={shine}>
              <Desk />
              <div className={styles.paper}>
                {MATERIAL_KINDS.map((kind, i) => (
                  <span key={kind} className={styles.sample}>
                    <StickerView
                      sticker={withMaterial(11 + i * 7, kind)}
                      scale={2}
                      label=""
                      decorative
                    />
                    <span className={styles.caption}>{t.create.materials[kind]}</span>
                  </span>
                ))}
              </div>
              <div className={styles.surfaces}>
                <div className={styles.mat}>
                  {[3, 5].map((seed) => (
                    <StickerView
                      key={seed}
                      sticker={madeUpSticker(seed)}
                      scale={1}
                      label=""
                      decorative
                    />
                  ))}
                </div>
                <div className={styles.laptop}>
                  {[8, 13, 21].map((seed) => (
                    <StickerView
                      key={seed}
                      sticker={madeUpSticker(seed)}
                      scale={1}
                      label=""
                      decorative
                    />
                  ))}
                </div>
              </div>
              <DaylightLayer light={light} />
              <figcaption className={styles.hour}>
                {debugText.samplesAt(Math.floor(hour), Math.round((hour % 1) * 60))} ·{" "}
                {phaseOf(light, hour * 60)}
              </figcaption>
            </figure>
          );
        })}
      </section>
    </main>
  );
}
