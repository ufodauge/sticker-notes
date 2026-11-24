import { encodeBody } from "../../../core/payload.ts";
import { opaqueBox, qrDrawing, qrForUrl, qrPathData, stickerUrl } from "../../../core/qr.ts";
import { renderRgba } from "../../../core/render.ts";
import { appBaseUrl } from "../../../data/platform.ts";
import type { StoredSticker } from "../../../data/sticker-store.ts";

const UNITS_PER_MODULE = 16;

type QrArtwork = {
  readonly matrixSize: number;
  readonly side: number;
  readonly d: string;
  readonly art: {
    readonly x: number;
    readonly y: number;
    readonly size: number;
  } | null;
};

const qrCache = new Map<string, QrArtwork>();
export function qrArtworkOf(s: StoredSticker): QrArtwork {
  const hit = qrCache.get(s.id);
  if (hit) return hit;
  const qr = qrForUrl(stickerUrl(appBaseUrl(), encodeBody(s.sticker)));
  const { size, rgba } = renderRgba(s.sticker);
  const drawing = qrDrawing(qr, UNITS_PER_MODULE, true, opaqueBox(rgba, size));
  const { art } = drawing;
  const made: QrArtwork = {
    matrixSize: qr.size,
    side: drawing.side,
    d: qrPathData(drawing, UNITS_PER_MODULE),
    art: art && {
      x: art.x - art.crop.x * art.pixel,
      y: art.y - art.crop.y * art.pixel,
      size: size * art.pixel,
    },
  };
  qrCache.set(s.id, made);
  return made;
}
