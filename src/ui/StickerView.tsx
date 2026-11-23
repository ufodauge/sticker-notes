import type { Sticker } from "../core/payload.ts";
import { renderRgba } from "../core/render.ts";
import styles from "./StickerView.module.css";

type Props = {
  readonly sticker: Sticker;
  readonly scale: number;
  readonly label: string;
  readonly decorative?: boolean;
};

export function StickerView({ sticker, scale, label, decorative }: Props) {
  const { size, rgba } = renderRgba(sticker);
  const draw = (canvas: HTMLCanvasElement | null) => {
    canvas?.getContext("2d")?.putImageData(new ImageData(rgba, size, size), 0, 0);
  };
  const css = size * Math.max(1, Math.round(scale));
  return (
    <canvas
      ref={draw}
      className={styles.sticker}
      width={size}
      height={size}
      style={scale > 0 ? { inlineSize: css, blockSize: css } : undefined}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label })}
    />
  );
}
