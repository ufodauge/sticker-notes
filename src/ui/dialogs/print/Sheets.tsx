import { createPortal } from "react-dom";
import {
  A4,
  CUT_STROKE_MM,
  albumPageBox,
  stickerGeometry,
  type Sheet,
  type StickerGeometry,
} from "../../../core/print.ts";
import type { StoredSticker } from "../../../data/sticker-store.ts";
import styles from "./Sheets.module.css";

const geometryCache = new Map<string, StickerGeometry>();
function geometryOf(s: StoredSticker): StickerGeometry {
  const hit = geometryCache.get(s.id);
  if (hit) return hit;
  const g = stickerGeometry(s.sticker);
  geometryCache.set(s.id, g);
  return g;
}

function usedStickers(
  sheets: readonly Sheet[],
  stickers: readonly StoredSticker[],
): readonly StoredSticker[] {
  const used = new Set(sheets.flatMap((s) => s.items.map((i) => i.stickerId)));
  return stickers.filter((s) => used.has(s.id));
}

export function Symbols({
  prefix,
  sheets,
  stickers,
}: {
  readonly prefix: string;
  readonly sheets: readonly Sheet[];
  readonly stickers: readonly StoredSticker[];
}) {
  return (
    <svg className={styles.defs} aria-hidden="true">
      <defs>
        {usedStickers(sheets, stickers).map((s) => {
          const g = geometryOf(s);
          const box = `0 0 ${g.size} ${g.size}`;
          return [
            <symbol key={`a${s.id}`} id={`${prefix}a-${s.id}`} viewBox={box}>
              <g shapeRendering="crispEdges">
                {g.fills.map((f) => (
                  <path key={f.fill} d={f.d} fill={f.fill} />
                ))}
              </g>
            </symbol>,
            <symbol key={`c${s.id}`} id={`${prefix}c-${s.id}`} viewBox={box}>
              <path d={g.cutPath} fill="none" stroke="#8a8a8a" strokeLinejoin="round" />
            </symbol>,
          ];
        })}
      </defs>
    </svg>
  );
}

export function SheetSvg({
  sheet,
  prefix,
  cutLine,
  frame,
  label,
}: {
  readonly sheet: Sheet;
  readonly prefix: string;
  readonly cutLine: boolean;
  readonly frame: boolean;
  readonly label: string | null;
}) {
  const page = albumPageBox();
  return (
    <svg
      className={label === null ? styles.sheetPrint : styles.sheet}
      xmlns="http://www.w3.org/2000/svg"
      width={`${A4.width}mm`}
      height={`${A4.height}mm`}
      viewBox={`0 0 ${A4.width} ${A4.height}`}
      role={label === null ? undefined : "img"}
      aria-hidden={label === null || undefined}
      aria-label={label ?? undefined}
    >
      <rect width={A4.width} height={A4.height} fill="#ffffff" />
      {frame && (
        <rect
          x={page.x}
          y={page.y}
          width={page.w}
          height={page.h}
          fill="none"
          stroke="#d6d6d6"
          strokeWidth={0.4}
        />
      )}
      {sheet.items.map((item) => (
        <g
          key={item.key}
          transform={`translate(${item.x} ${item.y}) rotate(${item.rotation} ${item.size / 2} ${item.size / 2})`}
        >
          <use href={`#${prefix}a-${item.stickerId}`} width={item.size} height={item.size} />
          {cutLine && (
            <use
              href={`#${prefix}c-${item.stickerId}`}
              width={item.size}
              height={item.size}
              // stroke width is in the symbol's dot units: keep it CUT_STROKE_MM on paper
              strokeWidth={CUT_STROKE_MM / item.dotMm}
            />
          )}
        </g>
      ))}
    </svg>
  );
}

export function PrinterCopy({
  sheets,
  stickers,
  cutLine,
}: {
  readonly sheets: readonly Sheet[];
  readonly stickers: readonly StoredSticker[];
  readonly cutLine: boolean;
}) {
  return createPortal(
    <div className={`${styles.printOnly} printOnly`}>
      <Symbols prefix="x" sheets={sheets} stickers={stickers} />
      {sheets.map((sheet, i) => (
        <SheetSvg key={i} sheet={sheet} prefix="x" cutLine={cutLine} frame={false} label={null} />
      ))}
    </div>,
    document.body,
  );
}
