import { create, type QRCodeSegment } from "qrcode";
import { FRAGMENT_PREFIX, encodeFragment } from "./payload.ts";

export type QrMatrix = {
  readonly size: number;
  readonly version: number;
  readonly modules: Uint8Array;
};

export function stickerUrl(appBase: string, body: Uint8Array): string {
  return `${stripHash(appBase)}#${encodeFragment(body)}`;
}

const stripHash = (url: string): string => {
  const i = url.indexOf("#");
  return i < 0 ? url : url.slice(0, i);
};

export function qrForUrl(url: string): QrMatrix {
  const marker = `#${FRAGMENT_PREFIX}`;
  const at = url.indexOf(marker);
  const head = at < 0 ? url : url.slice(0, at + marker.length);
  const tail = at < 0 ? "" : url.slice(at + marker.length);
  const segments: QRCodeSegment[] =
    tail === ""
      ? [{ data: new TextEncoder().encode(head), mode: "byte" as const }]
      : [
          { data: new TextEncoder().encode(head), mode: "byte" as const },
          { data: tail, mode: "alphanumeric" as const },
        ];
  const qr = create(segments, { errorCorrectionLevel: "H" });
  const size = qr.modules.size;
  return {
    size,
    version: qr.version,
    modules: Uint8Array.from(qr.modules.data, (v) => (v ? 1 : 0)),
  };
}

export type CenterArea = {
  readonly hole: { readonly start: number; readonly side: number };
  readonly art: { readonly start: number; readonly side: number };
};

export function centerArea(size: number): CenterArea {
  const raw = Math.round(size * 0.22);
  const art = raw + ((size - raw) % 2);
  const holeSide = art + 2;
  const start = (size - holeSide) / 2;
  return { hole: { start, side: holeSide }, art: { start: start + 1, side: art } };
}

export function isFinderModule(size: number, x: number, y: number): boolean {
  const near = (v: number) => v < 8;
  const far = (v: number) => v >= size - 8;
  return (near(x) && near(y)) || (far(x) && near(y)) || (near(x) && far(y));
}
