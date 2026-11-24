import { Check, Copy, Maximize, Share2 } from "lucide-react";
import { useReducer, useRef } from "react";
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
import { snsDisplay } from "../../core/sns.ts";
import { SnsIcon } from "../SnsIcon.tsx";
import { appBaseUrl, copyText, enterFullscreen } from "../../data/platform.ts";
import common from "../common.module.css";
import { Dialog } from "../Dialog.tsx";
import { useViewport } from "../effects/useViewport.ts";
import { t } from "../messages.ts";
import { StickerView } from "../StickerView.tsx";
import { holdWakeLock } from "../wake-lock.ts";
import styles from "./QrDialog.module.css";

const MIN_DEVICE_PX_FOR_ROUND_DOTS_THAT_STILL_DECODE = 6;

type Props = { readonly sticker: Sticker; readonly onClose: () => void };

export function QrDialog({ sticker, onClose }: Props) {
  return (
    <Dialog label={t.qr.dialog} variant="full" onClose={onClose}>
      <QrBody sticker={sticker} />
    </Dialog>
  );
}

function QrBody({ sticker }: { readonly sticker: Sticker }) {
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
        aria-label={t.qr.code(snsDisplay(sticker.snsKind, sticker.snsId))}
      />
      <div className={styles.who}>
        <StickerView sticker={sticker} scale={1} label="" decorative />
        <span className={styles.sns}>
          <SnsIcon kind={sticker.snsKind} size={16} />
          {sticker.snsKind === 3 ? sticker.snsId : `@${sticker.snsId}`}
        </span>
      </div>
      <div className={common.row}>
        <ShareLink url={url} title={snsDisplay(sticker.snsKind, sticker.snsId)} />
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
