export const ALNUM43_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$*+-./:";
const BASE = 43;

const DECODE_TABLE: readonly number[] = Array.from({ length: 128 }, (_, code) =>
  ALNUM43_ALPHABET.indexOf(String.fromCharCode(code)),
);

export function encodeAlnum43(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const v = ((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0);
    parts.push(
      ALNUM43_ALPHABET[Math.floor(v / (BASE * BASE))] ?? "",
      ALNUM43_ALPHABET[Math.floor(v / BASE) % BASE] ?? "",
      ALNUM43_ALPHABET[v % BASE] ?? "",
    );
  }
  if (bytes.length % 2 === 1) {
    const v = bytes[bytes.length - 1] ?? 0;
    parts.push(ALNUM43_ALPHABET[Math.floor(v / BASE)] ?? "", ALNUM43_ALPHABET[v % BASE] ?? "");
  }
  return parts.join("");
}

const digit = (text: string, i: number): number => {
  const code = text.charCodeAt(i);
  return code < 128 ? (DECODE_TABLE[code] ?? -1) : -1;
};

export function decodeAlnum43(text: string): Uint8Array | undefined {
  const rem = text.length % 3;
  if (rem === 1) return undefined;
  const out = new Uint8Array(Math.floor(text.length / 3) * 2 + (rem === 2 ? 1 : 0));
  const full = text.length - rem;
  for (let i = 0, o = 0; i < full; i += 3, o += 2) {
    const a = digit(text, i);
    const b = digit(text, i + 1);
    const c = digit(text, i + 2);
    if (a < 0 || b < 0 || c < 0) return undefined;
    const v = a * BASE * BASE + b * BASE + c;
    if (v > 0xffff) return undefined;
    out[o] = v >> 8;
    out[o + 1] = v & 0xff;
  }
  if (rem === 2) {
    const a = digit(text, full);
    const b = digit(text, full + 1);
    if (a < 0 || b < 0) return undefined;
    const v = a * BASE + b;
    if (v > 0xff) return undefined;
    out[out.length - 1] = v;
  }
  return out;
}
