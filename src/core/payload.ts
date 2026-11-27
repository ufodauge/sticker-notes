import { Inflate, deflateSync } from "fflate";
import { decodeAlnum43, encodeAlnum43 } from "./alnum43.ts";
import { MATERIALS, materialOfCode, type Material } from "./material.ts";
import { PALETTE_COUNT } from "./palette.ts";
import {
  MAX_ID_BYTES,
  NO_SNS,
  isSnsKind,
  isValidSns,
  isValidSnsId,
  type SnsOrNone,
} from "./sns.ts";

export const STICKER_SIZE = 32;
export const PIXEL_COUNT = STICKER_SIZE * STICKER_SIZE;
const PIXEL_BYTES = PIXEL_COUNT / 2;
export const FRAGMENT_PREFIX = "v1.";
const MAX_INFLATED_BYTES = 1024;

export type Sticker = {
  readonly paletteId: number;
  readonly transparentIndex: number | null;
  // NO_SNS (0) with an empty ID: the sticker names no one (one's own, until its QR is made)
  readonly snsKind: SnsOrNone;
  readonly snsId: string;
  readonly pixels: Uint8Array;
  // absent: matte (the v1 body exactly, without the material byte)
  readonly material?: Material;
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
  | "bad-sns-id"
  | "bad-material";

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
    isValidSns(s.snsKind, s.snsId) &&
    s.pixels.length === PIXEL_COUNT &&
    s.pixels.every((p) => p < 16) &&
    (s.material === undefined || isValidMaterial(s.material, s.transparentIndex))
  );
}

function isValidMaterial(m: Material, transparentIndex: number | null): boolean {
  if (!Object.hasOwn(MATERIALS, m.kind) || !Number.isInteger(m.tone)) return false;
  if (m.kind !== "foil") return m.tone === 0;
  return m.tone >= 0 && m.tone < 16 && m.tone !== transparentIndex;
}

// The byte after the pixels: material code in the high nibble, foil tone in the low one.
const materialByte = (m: Material | undefined): number | undefined =>
  m === undefined || m.kind === "matte" ? undefined : (MATERIALS[m.kind].code << 4) | m.tone;

export function encodeBody(s: Sticker): Uint8Array {
  if (!isValidSticker(s)) throw new Error("invalid sticker");
  const id = new TextEncoder().encode(s.snsId);
  const header =
    (s.paletteId << 11) |
    ((s.transparentIndex === null ? 0 : 1) << 10) |
    ((s.transparentIndex ?? 0) << 6) |
    s.snsKind;
  const extra = materialByte(s.material);
  const body = new Uint8Array(3 + id.length + PIXEL_BYTES + (extra === undefined ? 0 : 1));
  body[0] = header >> 8;
  body[1] = header & 0xff;
  body[2] = id.length;
  body.set(id, 3);
  const base = 3 + id.length;
  for (let i = 0; i < PIXEL_BYTES; i++) {
    body[base + i] = ((s.pixels[i * 2] ?? 0) << 4) | (s.pixels[i * 2 + 1] ?? 0);
  }
  if (extra !== undefined) body[base + PIXEL_BYTES] = extra;
  return body;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

export function decodeBody(body: Uint8Array): DecodeResult {
  if (body.length < 3) return fail("bad-length");
  const n = body[2] ?? 0;
  const plain = 3 + n + PIXEL_BYTES;
  const header = ((body[0] ?? 0) << 8) | (body[1] ?? 0);
  const kind = header & 0x3f;
  // no SNS is written as kind 0 with no ID at all; any service has an ID of 1 byte or more
  const none = kind === NO_SNS && n === 0;
  if (
    (n < 1 && !none) ||
    n > MAX_ID_BYTES ||
    (body.length !== plain && body.length !== plain + 1)
  ) {
    return fail("bad-length");
  }
  const paletteId = header >> 11;
  const hasTransparent = (header >> 10) & 1;
  const tIndex = (header >> 6) & 0xf;
  if (paletteId >= PALETTE_COUNT) return fail("bad-palette");
  if (!hasTransparent && tIndex !== 0) return fail("bad-transparent");
  if (!none && !isSnsKind(kind)) return fail("bad-sns-kind");
  const snsId = none ? "" : decodeUtf8(body.subarray(3, 3 + n));
  if (snsId === undefined || (!none && isSnsKind(kind) && !isValidSnsId(kind, snsId))) {
    return fail("bad-sns-id");
  }
  const pixels = new Uint8Array(PIXEL_COUNT);
  const base = 3 + n;
  for (let i = 0; i < PIXEL_BYTES; i++) {
    const b = body[base + i] ?? 0;
    pixels[i * 2] = b >> 4;
    pixels[i * 2 + 1] = b & 0xf;
  }
  const transparentIndex = hasTransparent ? tIndex : null;
  const material = decodeMaterial(body[plain], transparentIndex);
  if (material === "bad") return fail("bad-material");
  return {
    ok: true,
    body: body.slice(),
    sticker: {
      paletteId,
      transparentIndex,
      snsKind: none ? NO_SNS : (kind as SnsOrNone),
      snsId,
      pixels,
      ...(material ? { material } : {}),
    },
  };
}

// Only canonical bytes are accepted: matte is written by leaving the byte out, never as 0.
function decodeMaterial(
  byte: number | undefined,
  transparentIndex: number | null,
): Material | undefined | "bad" {
  if (byte === undefined) return undefined;
  const kind = materialOfCode(byte >> 4);
  if (!kind || kind === "matte") return "bad";
  const m = { kind, tone: byte & 0xf };
  return isValidMaterial(m, transparentIndex) ? m : "bad";
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
