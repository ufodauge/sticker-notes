import { ArrowRight, AtSign, Check, Copy, Maximize, Pencil, Share2 } from "lucide-react";
import { useReducer, useRef, useSyncExternalStore } from "react";
import { encodeBody, type Sticker } from "../../core/payload.ts";
import {
  QUIET_ZONE,
  opaqueBox,
  qrDrawing,
  qrForUrl,
  qrPathData,
  stickerUrl,
  type QrMatrix,
} from "../../core/qr.ts";
import { renderRgba } from "../../core/render.ts";
import { nameOf } from "../sticker-name.ts";
import { mySns, withMySns } from "../my-sns.ts";
import { MySnsField } from "../MySnsField.tsx";
import { SnsHandle } from "../SnsIcon.tsx";
import { appBaseUrl, copyText, enterFullscreen } from "../../data/platform.ts";
import type { StoredSticker } from "../../data/sticker-store.ts";
import common from "../common.module.css";
import { Dialog } from "../Dialog.tsx";
import { useCloseDialog } from "../dialog-context.ts";
import { useViewport } from "../effects/useViewport.ts";
import { t } from "../messages.ts";
import { StickerView } from "../StickerView.tsx";
import { holdWakeLock } from "../wake-lock.ts";
import styles from "./QrDialog.module.css";

const MIN_DEVICE_PX_FOR_ROUND_DOTS_THAT_STILL_DECODE = 6;

type Props = {
  readonly initial: StoredSticker;
  // one's own stickers to choose from (none: only `initial` is shown)
  readonly mine: readonly StoredSticker[];
  // given back for this sticker, just received
  readonly to: Sticker | undefined;
  // the first time through: a friend (made up) reads the QR, and it is put away
  readonly friendReads?: boolean;
  readonly onClose: () => void;
};

export function QrDialog({ initial, mine, to, friendReads, onClose }: Props) {
  const [id, choose] = useReducer((_: string, next: string) => next, initial.id);
  const shown = mine.find((s) => s.id === id) ?? initial;
  const sns = useSyncExternalStore(mySns.subscribe, mySns.get);
  const [editing, toggleEditing] = useReducer((on: boolean) => !on, false);
  return (
    <Dialog label={t.qr.dialog} variant="full" onClose={onClose}>
      <div className={styles.frame}>
        {to && (
          <p className={styles.giveBack}>
            <StickerView sticker={shown.sticker} scale={1} label="" decorative />
            <ArrowRight aria-hidden="true" size={18} strokeWidth={1.5} />
            <StickerView sticker={to} scale={1} label="" decorative />
            <span>{t.qr.giveBackTo(nameOf(to))}</span>
          </p>
        )}
        <QrBody
          key={shown.id}
          sticker={withMySns(shown.sticker, sns)}
          friendReads={!!friendReads}
          editing={editing}
          onEdit={toggleEditing}
        />
        {/* the SNS the QR carries, written here when the tag above is tapped */}
        {editing && !friendReads && (
          <div className={styles.mySns}>
            <MySnsField />
          </div>
        )}
        {mine.length > 1 && (
          <div className={styles.pick} role="group" aria-label={t.qr.pick}>
            {mine.map((s) => (
              <button
                key={s.id}
                type="button"
                className={styles.choice}
                aria-pressed={s.id === shown.id}
                aria-label={nameOf(s.sticker)}
                title={nameOf(s.sticker)}
                onClick={() => choose(s.id)}
              >
                <StickerView sticker={s.sticker} scale={1} label="" decorative />
              </button>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function QrBody({
  sticker,
  friendReads,
  editing,
  onEdit,
}: {
  readonly sticker: Sticker;
  readonly friendReads: boolean;
  readonly editing: boolean;
  readonly onEdit: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const viewport = useViewport();
  const url = stickerUrl(appBaseUrl(), encodeBody(sticker));
  const qr = qrForUrl(url);

  const total = qr.size + QUIET_ZONE * 2;
  const availCss = Math.min(viewport.width - 48, viewport.height * 0.6);
  const devicePerModule = Math.max(1, Math.floor((availCss * viewport.dpr) / total));
  const canvasPx = total * devicePerModule;

  return (
    <div ref={root} className={styles.body}>
      <span ref={holdWakeLock} hidden />
      <canvas
        ref={(c) => {
          if (c) paintQr(c, qr, devicePerModule, sticker);
        }}
        className={styles.qr}
        width={canvasPx}
        height={canvasPx}
        style={{ inlineSize: canvasPx / viewport.dpr, blockSize: canvasPx / viewport.dpr }}
        role="img"
        aria-label={t.qr.code(nameOf(sticker))}
      />
      {friendReads && <FriendReads />}
      {/* who the QR says it is from: a label, not a button to look at (the sticker and the maker's
          SNS, nothing when none); a little pencil says it can be written */}
      <button
        type="button"
        className={styles.who}
        aria-expanded={editing}
        aria-label={t.qr.from(nameOf(sticker))}
        title={t.qr.from(nameOf(sticker))}
        disabled={friendReads}
        onClick={onEdit}
      >
        <StickerView sticker={sticker} scale={1} label="" decorative />
        <span className={styles.sns}>
          <SnsHandle kind={sticker.snsKind} id={sticker.snsId} size={16} />
        </span>
        {/* with an SNS, a pencil to change it; without, the @ that one can be written here */}
        {!friendReads &&
          (sticker.snsKind === 0 ? (
            <AtSign aria-hidden="true" className={styles.pencil} size={16} strokeWidth={1.5} />
          ) : (
            <Pencil aria-hidden="true" className={styles.pencil} size={14} strokeWidth={1.5} />
          ))}
      </button>
      <div className={common.row}>
        <ShareLink url={url} title={nameOf(sticker)} />
        {document.fullscreenEnabled && (
          <button
            type="button"
            className={common.icon}
            aria-label={t.qr.fullscreen}
            title={t.qr.fullscreen}
            onClick={() => root.current && void enterFullscreen(root.current)}
          >
            <Maximize aria-hidden="true" size={20} strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  );
}

type ShareState = "idle" | "copied" | "failed";

function ShareLink({ url, title }: { readonly url: string; readonly title: string }) {
  const [state, set] = useReducer((_: ShareState, next: ShareState) => next, "idle");
  const canShare = typeof navigator.share === "function";
  const onClick = async () => {
    if (canShare) {
      await navigator.share({ title, url }).catch(() => undefined);
      return;
    }
    set((await copyText(url)) ? "copied" : "failed");
  };
  const label = canShare
    ? t.qr.share
    : state === "copied"
      ? t.qr.copied
      : state === "failed"
        ? t.qr.copyFailed
        : t.qr.copy;
  const Icon = canShare ? Share2 : state === "copied" ? Check : Copy;
  return (
    <button
      type="button"
      className={common.icon}
      aria-label={label}
      title={label}
      onClick={() => void onClick()}
    >
      <Icon aria-hidden="true" size={18} strokeWidth={1.5} />
    </button>
  );
}

function paintQr(canvas: HTMLCanvasElement, qr: QrMatrix, scale: number, sticker: Sticker): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { size, rgba } = renderRgba(sticker);
  const drawing = qrDrawing(
    qr,
    scale,
    scale >= MIN_DEVICE_PX_FOR_ROUND_DOTS_THAT_STILL_DECODE,
    opaqueBox(rgba, size),
  );
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  ctx.fill(new Path2D(qrPathData(drawing, scale)));
  const { art } = drawing;
  if (!art) return;
  const tmp = document.createElement("canvas");
  tmp.width = size;
  tmp.height = size;
  tmp.getContext("2d")?.putImageData(new ImageData(rgba, size, size), 0, 0);
  const { crop, pixel } = art;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, crop.x, crop.y, crop.w, crop.h, art.x, art.y, crop.w * pixel, crop.h * pixel);
}

// The tutorial's friend reading the QR: a while to look at it, a line sweeping across it as a
// camera would, the mark of it read, and the QR put away (the friend's sticker comes back after).
function FriendReads() {
  const close = useCloseDialog();
  const run = (el: HTMLElement | null) => {
    if (!el) return undefined;
    const timers = [
      setTimeout(() => el.setAttribute("data-phase", "reading"), 2200),
      setTimeout(() => el.setAttribute("data-phase", "read"), 3600),
      setTimeout(close, 5000),
    ];
    return () => timers.forEach(clearTimeout);
  };
  return (
    <span ref={run} className={styles.reader} aria-hidden="true">
      <span className={styles.scanLine} />
      <span className={styles.readMark}>{t.qr.read}</span>
    </span>
  );
}
