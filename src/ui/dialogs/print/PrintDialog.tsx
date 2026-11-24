import { BookOpen, LayoutGrid, Minus, Plus, Printer, QrCode, Scissors } from "lucide-react";
import { useReducer } from "react";
import {
  DEFAULT_DOT_MM,
  DEFAULT_QR_MM,
  MAX_DOT_MM,
  MIN_DOT_MM,
  QR_SIZES_MM,
  layoutAlbum,
  layoutGrid,
  qrModuleMm,
  type QrBlock,
  type QrSizeMm,
} from "../../../core/print.ts";
import { snsDisplay } from "../../../core/sns.ts";
import { SnsIcon } from "../../SnsIcon.tsx";
import type { Ready, StoredSticker } from "../../../data/sticker-store.ts";
import common from "../../common.module.css";
import { Dialog } from "../../Dialog.tsx";
import { t } from "../../messages.ts";
import { StickerView } from "../../StickerView.tsx";
import styles from "./PrintDialog.module.css";
import { qrArtworkOf } from "./qr-artwork.ts";
import { PrinterCopy, SheetSvg, Symbols } from "./Sheets.tsx";

const MODES = {
  album: { Icon: BookOpen },
  grid: { Icon: LayoutGrid },
} as const;
type Mode = keyof typeof MODES;

const MAX_COPIES = 99;
const RISKY_MODULE_MM = 0.4;

type QrChoice = {
  readonly on: boolean;
  readonly stickerId: string | null;
  readonly sizeMm: QrSizeMm;
};

type PrintState = {
  readonly mode: Mode;
  readonly copies: Readonly<Record<string, number>>;
  readonly dotMm: number;
  readonly cutLine: boolean;
  readonly qr: QrChoice;
};

type PrintAction =
  | { readonly type: "mode"; readonly mode: Mode }
  | { readonly type: "copies"; readonly id: string; readonly copies: number }
  | { readonly type: "dot"; readonly dotMm: number }
  | { readonly type: "cut"; readonly on: boolean }
  | { readonly type: "qr"; readonly qr: Partial<QrChoice> };

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
    case "qr":
      return { ...s, qr: { ...s.qr, ...a.qr } };
  }
}

type Props = { readonly album: Ready; readonly onClose: () => void };

export function PrintDialog({ album, onClose }: Props) {
  const [state, dispatch] = useReducer(reducer, {
    mode: "album",
    copies: {},
    dotMm: DEFAULT_DOT_MM,
    cutLine: false,
    qr: { on: false, stickerId: null, sizeMm: DEFAULT_QR_MM },
  });
  const mine = album.stickers.filter((s) => s.origin === "mine");
  const qrSticker = mine.find((s) => s.id === state.qr.stickerId) ?? mine[0];
  const qrBlock: QrBlock | null =
    state.qr.on && qrSticker
      ? {
          stickerId: qrSticker.id,
          sizeMm: state.qr.sizeMm,
          matrixSize: qrArtworkOf(qrSticker).matrixSize,
        }
      : null;
  const sheets =
    state.mode === "album"
      ? layoutAlbum(album.pages, album.placements)
      : layoutGrid(
          Object.entries(state.copies).map(([stickerId, copies]) => ({ stickerId, copies })),
          state.dotMm,
          qrBlock,
        );

  return (
    <Dialog label={t.print.dialog} onClose={onClose}>
      <div className={styles.body}>
        <div className={styles.headers}>
          <div className={styles.modes} role="radiogroup" aria-label={t.print.modeGroup}>
            {(Object.keys(MODES) as Mode[]).map((m) => {
              const { Icon } = MODES[m];
              const label = t.print.mode[m];
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

          <label
            className={styles.cut}
            title={t.print.cutLine}
            data-on={state.cutLine || undefined}
          >
            <input
              type="checkbox"
              className={common.visuallyHidden}
              checked={state.cutLine}
              onChange={(e) => dispatch({ type: "cut", on: e.currentTarget.checked })}
            />
            <Scissors aria-hidden="true" size={20} strokeWidth={1.5} />
            <span className={common.visuallyHidden}>{t.print.cutLine}</span>
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
                label={t.print.sheet(i + 1)}
              />
            ))}
          </div>
          {state.mode === "grid" && (
            <GridOptions
              stickers={album.stickers}
              mine={mine}
              qrSticker={qrSticker}
              state={state}
              dispatch={dispatch}
            />
          )}
        </div>

        <button
          type="button"
          className={common.primary}
          disabled={sheets.every((sheet) => sheet.items.length === 0)}
          onClick={() => window.print()}
        >
          <Printer aria-hidden="true" size={18} strokeWidth={1.5} />
          {t.print.submit}
        </button>
      </div>
      <PrinterCopy sheets={sheets} stickers={album.stickers} cutLine={state.cutLine} />
    </Dialog>
  );
}

function GridOptions({
  stickers,
  mine,
  qrSticker,
  state,
  dispatch,
}: {
  readonly stickers: readonly StoredSticker[];
  readonly mine: readonly StoredSticker[];
  readonly qrSticker: StoredSticker | undefined;
  readonly state: PrintState;
  readonly dispatch: (a: PrintAction) => void;
}) {
  const sizeMm = Math.round(36 * Math.min(MAX_DOT_MM, Math.max(MIN_DOT_MM, state.dotMm)));
  return (
    <>
      {qrSticker && (
        <QrOption mine={mine} qrSticker={qrSticker} state={state} dispatch={dispatch} />
      )}
      <ul className={styles.list} aria-label={t.print.stickers}>
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
              <span className={styles.stepper}>
                <button
                  type="button"
                  className={common.icon}
                  aria-label={t.print.fewer(name)}
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
                  aria-label={t.print.count(name)}
                  onChange={(e) =>
                    dispatch({ type: "copies", id: s.id, copies: e.currentTarget.valueAsNumber })
                  }
                />
                <button
                  type="button"
                  className={common.icon}
                  aria-label={t.print.more(name)}
                  onClick={() =>
                    dispatch({ type: "copies", id: s.id, copies: Math.min(MAX_COPIES, n + 1) })
                  }
                >
                  <Plus aria-hidden="true" size={18} strokeWidth={1.5} />
                </button>
              </span>
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
          aria-label={t.print.dotSize}
          onChange={(e) => dispatch({ type: "dot", dotMm: e.currentTarget.valueAsNumber })}
        />
        <span className={common.muted}>{t.print.dotSummary(sizeMm)}</span>
      </label>
    </>
  );
}

function QrOption({
  mine,
  qrSticker,
  state,
  dispatch,
}: {
  readonly mine: readonly StoredSticker[];
  readonly qrSticker: StoredSticker;
  readonly state: PrintState;
  readonly dispatch: (a: PrintAction) => void;
}) {
  const moduleMm = qrModuleMm(state.qr.sizeMm, qrArtworkOf(qrSticker).matrixSize);
  return (
    <div className={styles.options}>
      <label className={styles.option}>
        <input
          type="checkbox"
          checked={state.qr.on}
          onChange={(e) => dispatch({ type: "qr", qr: { on: e.currentTarget.checked } })}
        />
        <QrCode aria-hidden="true" size={18} strokeWidth={1.5} />
        <span>{t.print.qr.own}</span>
      </label>
      {state.qr.on && (
        <>
          {mine.length > 1 && (
            <select
              className={common.input}
              aria-label={t.print.qr.sticker}
              value={qrSticker.id}
              onChange={(e) => dispatch({ type: "qr", qr: { stickerId: e.currentTarget.value } })}
            >
              {mine.map((s) => (
                <option key={s.id} value={s.id}>
                  {snsDisplay(s.sticker.snsKind, s.sticker.snsId)}
                </option>
              ))}
            </select>
          )}
          <select
            className={common.input}
            aria-label={t.print.qr.size}
            value={state.qr.sizeMm}
            onChange={(e) => {
              const sizeMm = QR_SIZES_MM.find((mm) => String(mm) === e.currentTarget.value);
              if (sizeMm) dispatch({ type: "qr", qr: { sizeMm } });
            }}
          >
            {QR_SIZES_MM.map((mm) => (
              <option key={mm} value={mm}>
                {t.print.qr.sideMm(mm)}
              </option>
            ))}
          </select>
          <span className={moduleMm < RISKY_MODULE_MM ? common.warn : common.muted}>
            {t.print.qr.moduleMm(moduleMm)}
            {moduleMm < RISKY_MODULE_MM && t.print.qr.risky}
          </span>
        </>
      )}
    </div>
  );
}
