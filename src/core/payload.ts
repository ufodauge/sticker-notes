import { Inflate, deflateSync } from "fflate";
import { decodeAlnum43, encodeAlnum43 } from "./alnum43.ts";
import { PALETTE_COUNT } from "./palette.ts";
import { MAX_ID_BYTES, isSnsKind, isValidSnsId, type SnsKind } from "./sns.ts";

export const STICKER_SIZE = 32;
export const PIXEL_COUNT = STICKER_SIZE * STICKER_SIZE;
const PIXEL_BYTES = PIXEL_COUNT / 2;
export const FRAGMENT_PREFIX = "v1.";
const MAX_INFLATED_BYTES = 1024;

export type Sticker = {
  readonly paletteId: number;
  readonly transparentIndex: number | null;
  readonly snsKind: SnsKind;
  readonly snsId: string;
  readonly pixels: Uint8Array;
};

export type DecodeResult =
  | { readonly ok: true; readonly sticker: Sticker; readonly body: Uint8Array }
  | { readonly ok: false; readonly reason: DecodeError };

type DecodeError =
  | "bad-prefix"
  | "bad-text"
  | "bad-deflate"
  | "too-large"
  | "bad-length"
  | "bad-palette"
  | "bad-transparent"
  | "bad-sns-kind"
  | "bad-sns-id";

const fail = (reason: DecodeError): DecodeResult => ({ ok: false, reason });

function isValidSticker(s: Sticker): boolean {
  return (
    Number.isInteger(s.paletteId) &&
    s.paletteId >= 0 &&
    s.paletteId < PALETTE_COUNT &&
    (s.transparentIndex === null ||
      (Number.isInteger(s.transparentIndex) &&
        s.transparentIndex >= 0 &&
        s.transparentIndex < 16)) &&
    isSnsKind(s.snsKind) &&
    isValidSnsId(s.snsKind, s.snsId) &&
    s.pixels.length === PIXEL_COUNT &&
    s.pixels.every((p) => p < 16)
  );
}

export function encodeBody(s: Sticker): Uint8Array {
  if (!isValidSticker(s)) throw new Error("invalid sticker");
  const id = new TextEncoder().encode(s.snsId);
  const header =
    (s.paletteId << 11) |
    ((s.transparentIndex === null ? 0 : 1) << 10) |
    ((s.transparentIndex ?? 0) << 6) |
    s.snsKind;
  const body = new Uint8Array(3 + id.length + PIXEL_BYTES);
  body[0] = header >> 8;
  body[1] = header & 0xff;
  body[2] = id.length;
  body.set(id, 3);
  const base = 3 + id.length;
  for (let i = 0; i < PIXEL_BYTES; i++) {
    body[base + i] = ((s.pixels[i * 2] ?? 0) << 4) | (s.pixels[i * 2 + 1] ?? 0);
  }
  return body;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

export function decodeBody(body: Uint8Array): DecodeResult {
  if (body.length < 3) return fail("bad-length");
  const n = body[2] ?? 0;
  if (n < 1 || n > MAX_ID_BYTES || body.length !== 3 + n + PIXEL_BYTES) return fail("bad-length");
  const header = ((body[0] ?? 0) << 8) | (body[1] ?? 0);
  const paletteId = header >> 11;
  const hasTransparent = (header >> 10) & 1;
  const tIndex = (header >> 6) & 0xf;
  const kind = header & 0x3f;
  if (paletteId >= PALETTE_COUNT) return fail("bad-palette");
  if (!hasTransparent && tIndex !== 0) return fail("bad-transparent");
  if (!isSnsKind(kind)) return fail("bad-sns-kind");
  const snsId = decodeUtf8(body.subarray(3, 3 + n));
  if (snsId === undefined || !isValidSnsId(kind, snsId)) return fail("bad-sns-id");
  const pixels = new Uint8Array(PIXEL_COUNT);
  const base = 3 + n;
  for (let i = 0; i < PIXEL_BYTES; i++) {
    const b = body[base + i] ?? 0;
    pixels[i * 2] = b >> 4;
    pixels[i * 2 + 1] = b & 0xf;
  }
  return {
    ok: true,
    body: body.slice(),
    sticker: {
      paletteId,
      transparentIndex: hasTransparent ? tIndex : null,
      snsKind: kind,
      snsId,
      pixels,
    },
  };
}

function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return utf8.decode(bytes);
  } catch {
    return undefined;
  }
}

function compressBody(body: Uint8Array): Uint8Array {
  return deflateSync(body, { level: 9, mem: 8 });
}

function inflateLimited(
  data: Uint8Array,
  limit = MAX_INFLATED_BYTES,
): Uint8Array | "too-large" | "bad-deflate" {
  const chunks: Uint8Array[] = [];
  const total = { bytes: 0, overflow: false, done: false };
  const inflater = new Inflate((chunk, final) => {
    total.bytes += chunk.length;
    if (total.bytes > limit) {
      total.overflow = true;
      throw new RangeError("inflate limit");
    }
    chunks.push(chunk);
    if (final) total.done = true;
  });
  try {
    inflater.push(data, true);
  } catch {
    return total.overflow ? "too-large" : "bad-deflate";
  }
  if (!total.done) return "bad-deflate";
  const out = new Uint8Array(total.bytes);
  chunks.reduce((offset, c) => {
    out.set(c, offset);
    return offset + c.length;
  }, 0);
  return out;
}

export function encodeFragment(body: Uint8Array): string {
  return FRAGMENT_PREFIX + encodeAlnum43(compressBody(body));
}

export function decodeFragment(fragment: string): DecodeResult {
  const f = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  if (!f.startsWith(FRAGMENT_PREFIX)) return fail("bad-prefix");
  const text = f.slice(FRAGMENT_PREFIX.length);
  if (text.length > MAX_INFLATED_BYTES * 2) return fail("too-large");
  const compressed = decodeAlnum43(text);
  if (compressed === undefined) return fail("bad-text");
  const body = inflateLimited(compressed);
  if (typeof body === "string") return fail(body);
  return decodeBody(body);
}

export async function stickerIdOf(body: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", body.slice()));
  return Array.from(digest.subarray(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}
