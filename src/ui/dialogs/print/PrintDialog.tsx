import { BookOpen, LayoutGrid, Minus, Plus, Printer, Scissors } from "lucide-react";
import { useReducer } from "react";
import {
  DEFAULT_DOT_MM,
  MAX_DOT_MM,
  MIN_DOT_MM,
  layoutAlbum,
  layoutGrid,
} from "../../../core/print.ts";
import { snsDisplay } from "../../../core/sns.ts";
import { SnsIcon } from "../../SnsIcon.tsx";
import type { Ready, StoredSticker } from "../../../data/sticker-store.ts";
import common from "../../common.module.css";
import { Dialog } from "../../Dialog.tsx";
import { StickerView } from "../../StickerView.tsx";
import styles from "./PrintDialog.module.css";
import { PrinterCopy, SheetSvg, Symbols } from "./Sheets.tsx";

const MODES = {
  album: { label: "シール帳", Icon: BookOpen },
  grid: { label: "ならべる", Icon: LayoutGrid },
} as const;
type Mode = keyof typeof MODES;

const MAX_COPIES = 99;

type PrintState = {
  readonly mode: Mode;
  readonly copies: Readonly<Record<string, number>>;
  readonly dotMm: number;
  readonly cutLine: boolean;
};

type PrintAction =
  | { readonly type: "mode"; readonly mode: Mode }
  | { readonly type: "copies"; readonly id: string; readonly copies: number }
  | { readonly type: "dot"; readonly dotMm: number }
  | { readonly type: "cut"; readonly on: boolean };

function reducer(s: PrintState, a: PrintAction): PrintState {
  switch (a.type) {
    case "mode":
      return { ...s, mode: a.mode };
    case "copies": {
      const n = Number.isFinite(a.copies)
        ? Math.max(0, Math.min(MAX_COPIES, Math.floor(a.copies)))
        : 0;
      const { [a.id]: _, ...rest } = s.copies;
      return { ...s, copies: n === 0 ? rest : { ...rest, [a.id]: n } };
    }
    case "dot":
      return Number.isFinite(a.dotMm) ? { ...s, dotMm: a.dotMm } : s;
    case "cut":
      return { ...s, cutLine: a.on };
  }
}

type Props = { readonly album: Ready; readonly onClose: () => void };

export function PrintDialog({ album, onClose }: Props) {
  const [state, dispatch] = useReducer(reducer, {
    mode: "album",
    copies: {},
    dotMm: DEFAULT_DOT_MM,
    cutLine: false,
  });
  const sheets =
    state.mode === "album"
      ? layoutAlbum(album.pages, album.placements)
      : layoutGrid(
          Object.entries(state.copies).map(([stickerId, copies]) => ({ stickerId, copies })),
          state.dotMm,
        );

  return (
    <Dialog label="印刷" onClose={onClose}>
      <div className={styles.body}>
        <div className={styles.headers}>
          <div className={styles.modes} role="radiogroup" aria-label="印刷のしかた">
            {(Object.keys(MODES) as Mode[]).map((m) => {
              const { label, Icon } = MODES[m];
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={state.mode === m}
                  className={styles.mode}
                  title={label}
                  onClick={() => dispatch({ type: "mode", mode: m })}
                >
                  <Icon aria-hidden="true" size={18} strokeWidth={1.5} />
                </button>
              );
            })}
          </div>

          <label className={styles.cut} title="カットライン" data-on={state.cutLine || undefined}>
            <input
              type="checkbox"
              className={common.visuallyHidden}
              checked={state.cutLine}
              onChange={(e) => dispatch({ type: "cut", on: e.currentTarget.checked })}
            />
            <Scissors aria-hidden="true" size={20} strokeWidth={1.5} />
            <span className={common.visuallyHidden}>カットライン</span>
          </label>
        </div>

        <div className={styles.main} data-split={state.mode === "grid" || undefined}>
          <div className={styles.previews}>
            <Symbols prefix="p" sheets={sheets} stickers={album.stickers} />
            {sheets.map((sheet, i) => (
              <SheetSvg
                key={i}
                sheet={sheet}
                prefix="p"
                cutLine={state.cutLine}
                frame={state.mode === "album"}
                label={`印刷シート ${i + 1}`}
              />
            ))}
          </div>
          {state.mode === "grid" && (
            <GridOptions stickers={album.stickers} state={state} dispatch={dispatch} />
          )}
        </div>

        <button
          type="button"
          className={common.primary}
          disabled={sheets.every((sheet) => sheet.items.length === 0)}
          onClick={() => window.print()}
        >
          <Printer aria-hidden="true" size={18} strokeWidth={1.5} />
          印刷
        </button>
      </div>
      <PrinterCopy sheets={sheets} stickers={album.stickers} cutLine={state.cutLine} />
    </Dialog>
  );
}

function GridOptions({
  stickers,
  state,
  dispatch,
}: {
  readonly stickers: readonly StoredSticker[];
  readonly state: PrintState;
  readonly dispatch: (a: PrintAction) => void;
}) {
  const sizeMm = Math.round(36 * Math.min(MAX_DOT_MM, Math.max(MIN_DOT_MM, state.dotMm)));
  return (
    <>
      <ul className={styles.list} aria-label="印刷するステッカー">
        {stickers.map((s) => {
          const n = state.copies[s.id] ?? 0;
          const name = snsDisplay(s.sticker.snsKind, s.sticker.snsId);
          return (
            <li key={s.id} className={styles.row} data-on={n > 0 || undefined}>
              <StickerView sticker={s.sticker} scale={1} label="" decorative />
              <span className={styles.name} aria-hidden="true">
                <SnsIcon kind={s.sticker.snsKind} size={16} />{" "}
                {s.sticker.snsKind === 3 ? s.sticker.snsId : `@${s.sticker.snsId}`}
              </span>
              <button
                type="button"
                className={common.icon}
                aria-label={`${name} を減らす`}
                disabled={n === 0}
                onClick={() => dispatch({ type: "copies", id: s.id, copies: n - 1 })}
              >
                <Minus aria-hidden="true" size={18} strokeWidth={1.5} />
              </button>
              <input
                className={`${common.input} ${styles.count}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_COPIES}
                step={1}
                value={n}
                aria-label={`${name} の枚数`}
                onChange={(e) =>
                  dispatch({ type: "copies", id: s.id, copies: e.currentTarget.valueAsNumber })
                }
              />
              <button
                type="button"
                className={common.icon}
                aria-label={`${name} を増やす`}
                onClick={() =>
                  dispatch({ type: "copies", id: s.id, copies: Math.min(MAX_COPIES, n + 1) })
                }
              >
                <Plus aria-hidden="true" size={18} strokeWidth={1.5} />
              </button>
            </li>
          );
        })}
      </ul>
      <label className={styles.option}>
        <input
          className={common.input}
          type="number"
          inputMode="decimal"
          min={MIN_DOT_MM}
          max={MAX_DOT_MM}
          step={0.1}
          value={state.dotMm}
          aria-label="1ドットの大きさ(mm)"
          onChange={(e) => dispatch({ type: "dot", dotMm: e.currentTarget.valueAsNumber })}
        />
        <span className={common.muted}>mm/ドット・約{sizeMm}mm角</span>
      </label>
    </>
  );
}
