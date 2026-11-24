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

function isFinderModule(size: number, x: number, y: number): boolean {
  const near = (v: number) => v < 8;
  const far = (v: number) => v >= size - 8;
  return (near(x) && near(y)) || (far(x) && near(y)) || (near(x) && far(y));
}

export const QUIET_ZONE = 4;
const TOUCHING_DOT_RADIUS = 0.5;

type Box = { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };
type Corner = readonly [x: number, y: number];

type QrArt = {
  readonly crop: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly pixel: number;
  readonly x: number;
  readonly y: number;
};

export type QrDrawing = {
  readonly side: number;
  readonly squares: readonly Corner[];
  readonly dots: readonly Corner[];
  readonly art: QrArt | null;
};

export function opaqueBox(rgba: ArrayLike<number>, size: number): Box | null {
  const filled = Array.from({ length: size * size }, (_, i) => i).filter((i) => rgba[i * 4 + 3]);
  if (filled.length === 0) return null;
  const xs = filled.map((i) => i % size);
  const ys = filled.map((i) => Math.floor(i / size));
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export function qrDrawing(
  qr: QrMatrix,
  scale: number,
  roundDots: boolean,
  content: Box | null,
): QrDrawing {
  const { hole, art } = centerArea(qr.size);
  const inHole = (x: number, y: number) =>
    x >= hole.start && x < hole.start + hole.side && y >= hole.start && y < hole.start + hole.side;
  const lit = Array.from(qr.modules, (dark, i) => ({
    mx: i % qr.size,
    my: Math.floor(i / qr.size),
    dark,
  })).filter(({ mx, my, dark }) => dark && !inHole(mx, my));
  const corner = ({ mx, my }: { mx: number; my: number }): Corner => [
    (mx + QUIET_ZONE) * scale,
    (my + QUIET_ZONE) * scale,
  ];
  const isDot = ({ mx, my }: { mx: number; my: number }) =>
    roundDots && !isFinderModule(qr.size, mx, my);
  return {
    side: (qr.size + QUIET_ZONE * 2) * scale,
    squares: lit.filter((m) => !isDot(m)).map(corner),
    dots: lit.filter(isDot).map(corner),
    art: content && fitArt(content, art, scale),
  };
}

function fitArt(content: Box, art: CenterArea["art"], scale: number): QrArt {
  const w = content.x1 - content.x0 + 1;
  const h = content.y1 - content.y0 + 1;
  const room = art.side * scale;
  const pixel = Math.max(1, Math.floor(room / Math.max(w, h)));
  const origin = (art.start + QUIET_ZONE) * scale;
  return {
    crop: { x: content.x0, y: content.y0, w, h },
    pixel,
    x: origin + Math.floor((room - w * pixel) / 2),
    y: origin + Math.floor((room - h * pixel) / 2),
  };
}

export function qrPathData(drawing: QrDrawing, scale: number): string {
  const r = scale * TOUCHING_DOT_RADIUS;
  const square = ([x, y]: Corner) => `M${x} ${y}h${scale}v${scale}h${-scale}z`;
  const dot = ([x, y]: Corner) =>
    `M${x} ${y + r}a${r} ${r} 0 1 0 ${scale} 0a${r} ${r} 0 1 0 ${-scale} 0z`;
  return drawing.squares.map(square).join("") + drawing.dots.map(dot).join("");
}
