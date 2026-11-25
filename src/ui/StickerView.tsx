import type { CSSProperties } from "react";
import type { Sticker } from "../core/payload.ts";
import { getPalette } from "../core/palette.ts";
import { materialMask, renderRgba } from "../core/render.ts";
import styles from "./StickerView.module.css";

type Props = {
  readonly sticker: Sticker;
  readonly scale: number;
  readonly label: string;
  readonly decorative?: boolean;
  // without the material's sheen (the art alone)
  readonly plain?: boolean;
};

export function StickerView({ sticker, scale, label, decorative, plain }: Props) {
  const { size, rgba } = renderRgba(sticker);
  const draw = (canvas: HTMLCanvasElement | null) => {
    canvas?.getContext("2d")?.putImageData(new ImageData(rgba, size, size), 0, 0);
  };
  const css = size * Math.max(1, Math.round(scale));
  const art = (
    <canvas
      ref={draw}
      className={styles.sticker}
      width={size}
      height={size}
      style={scale > 0 ? { inlineSize: css, blockSize: css } : undefined}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label })}
    />
  );
  const material = sticker.material;
  if (plain || !material || material.kind === "matte") return art;
  return (
    <span className={styles.finished} data-finished={material.kind}>
      {art}
      <span
        className={styles.finish}
        data-material={material.kind}
        data-metal={material.kind === "foil" ? metalOf(sticker, material.tone) : undefined}
        style={{ "--mask": `url(${maskUrl(sticker)})` } as CSSProperties}
      />
    </span>
  );
}

const MASK_SCALE = 8;
const masks = new Map<string, string>();

const maskKey = (s: Sticker) =>
  `${s.paletteId}.${s.transparentIndex}.${s.material?.kind}.${s.material?.tone}.${s.pixels.join("")}`;

// The material's shape as an image the browser can mask with, drawn large so its edges stay sharp.
function maskUrl(s: Sticker): string {
  const key = maskKey(s);
  const known = masks.get(key);
  if (known) return known;
  const { size, rgba } = materialMask(s);
  const small = document.createElement("canvas");
  small.width = size;
  small.height = size;
  small.getContext("2d")?.putImageData(new ImageData(rgba, size, size), 0, 0);
  const big = document.createElement("canvas");
  big.width = size * MASK_SCALE;
  big.height = size * MASK_SCALE;
  const ctx = big.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, big.width, big.height);
  }
  const url = big.toDataURL();
  masks.set(key, url);
  return url;
}

// Gold for warm colours, silver for the rest.
function metalOf(s: Sticker, tone: number): "gold" | "silver" {
  const [r, g, b] = getPalette(s.paletteId)?.rgb[tone] ?? [0, 0, 0];
  return r > b + 24 && g > b ? "gold" : "silver";
}
