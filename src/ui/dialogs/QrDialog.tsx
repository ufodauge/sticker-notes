import { Check, Copy, Maximize, Share2 } from "lucide-react";
import { useReducer, useRef } from "react";
import { encodeBody, type Sticker } from "../../core/payload.ts";
import { centerArea, isFinderModule, qrForUrl, stickerUrl, type QrMatrix } from "../../core/qr.ts";
import { renderRgba } from "../../core/render.ts";
import { snsDisplay } from "../../core/sns.ts";
import { SnsIcon } from "../SnsIcon.tsx";
import { appBaseUrl, copyText, enterFullscreen } from "../../data/platform.ts";
import common from "../common.module.css";
import { Dialog } from "../Dialog.tsx";
import { useViewport } from "../effects/useViewport.ts";
import { StickerView } from "../StickerView.tsx";
import { holdWakeLock } from "../wake-lock.ts";
import styles from "./QrDialog.module.css";

const QUIET_ZONE = 4;
const TOUCHING_DOT_RADIUS = 0.5;
const MIN_DEVICE_PX_FOR_ROUND_DOTS_THAT_STILL_DECODE = 6;

type Props = { readonly sticker: Sticker; readonly onClose: () => void };

export function QrDialog({ sticker, onClose }: Props) {
  return (
    <Dialog label="交換用のQR" variant="full" onClose={onClose}>
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
        aria-label={`${snsDisplay(sticker.snsKind, sticker.snsId)} のQRコード`}
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
            aria-label="全画面"
            title="全画面"
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
    ? "リンクを共有"
    : state === "copied"
      ? "コピーした"
      : state === "failed"
        ? "コピーできなかった"
        : "リンクをコピー";
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
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  const { hole, art } = centerArea(qr.size);
  const inHole = (x: number, y: number) =>
    x >= hole.start && x < hole.start + hole.side && y >= hole.start && y < hole.start + hole.side;
  qr.modules.forEach((dark, i) => {
    const mx = i % qr.size;
    const my = Math.floor(i / qr.size);
    if (!dark || inHole(mx, my)) return;
    const x = (mx + QUIET_ZONE) * scale;
    const y = (my + QUIET_ZONE) * scale;
    if (scale < MIN_DEVICE_PX_FOR_ROUND_DOTS_THAT_STILL_DECODE || isFinderModule(qr.size, mx, my)) {
      ctx.fillRect(x, y, scale, scale);
      return;
    }
    ctx.beginPath();
    ctx.arc(x + scale / 2, y + scale / 2, scale * TOUCHING_DOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  });
  const { size, rgba } = renderRgba(sticker);
  const tmp = document.createElement("canvas");
  tmp.width = size;
  tmp.height = size;
  tmp.getContext("2d")?.putImageData(new ImageData(rgba, size, size), 0, 0);
  const box = { x0: size, y0: size, x1: -1, y1: -1 };
  rgba.forEach((_, k) => {
    if (k % 4 !== 3 || !rgba[k]) return;
    const i = (k - 3) / 4;
    Object.assign(box, {
      x0: Math.min(box.x0, i % size),
      y0: Math.min(box.y0, Math.floor(i / size)),
      x1: Math.max(box.x1, i % size),
      y1: Math.max(box.y1, Math.floor(i / size)),
    });
  });
  if (box.x1 < 0) return;
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  const px = Math.max(1, Math.floor((art.side * scale) / Math.max(bw, bh)));
  const side = art.side * scale;
  const left = (art.start + QUIET_ZONE) * scale + Math.floor((side - bw * px) / 2);
  const top = (art.start + QUIET_ZONE) * scale + Math.floor((side - bh * px) / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, box.x0, box.y0, bw, bh, left, top, bw * px, bh * px);
}
