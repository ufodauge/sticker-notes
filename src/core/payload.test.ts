import { deflateSync } from "fflate";
import { describe, expect, test } from "vite-plus/test";
import vectorFile from "../../test/vectors/payload-v1.json" with { type: "json" };
import { encodeAlnum43 } from "./alnum43.ts";
import {
  PIXEL_COUNT,
  decodeBody,
  decodeFragment,
  encodeBody,
  encodeFragment,
  stickerIdOf,
  type Sticker,
} from "./payload.ts";
import { FIXTURES, rng } from "./testing/fixtures.ts";
import type { Vector } from "./testing/vectors.ts";

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const vectors: readonly Vector[] = vectorFile.vectors;

describe("round trip", () => {
  test.each(Object.entries(FIXTURES))("%s", (_name, s) => {
    const body = encodeBody(s);
    expect(body.length).toBe(515 + new TextEncoder().encode(s.snsId).length);
    const r = decodeFragment(`#${encodeFragment(body)}`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sticker).toEqual(s);
    expect(hex(r.body)).toBe(hex(body));
  });

  test("random stickers", () => {
    const r = rng(1);
    for (let n = 0; n < 300; n++) {
      const s: Sticker = {
        paletteId: Math.floor(r() * 32),
        transparentIndex: r() < 0.5 ? null : Math.floor(r() * 16),
        snsKind: 1,
        snsId: "u".repeat(1 + Math.floor(r() * 15)),
        pixels: Uint8Array.from({ length: PIXEL_COUNT }, () =>
          Math.floor(r() * (r() < 0.5 ? 2 : 16)),
        ),
      };
      const d = decodeFragment(encodeFragment(encodeBody(s)));
      expect(d.ok && d.sticker).toEqual(s);
    }
  });
});

describe("test vectors (must never change)", () => {
  test.each(vectors.map((v) => [v.name, v] as const))("%s", async (_name, v) => {
    const s = FIXTURES[v.name];
    expect(s).toBeDefined();
    if (!s) return;
    expect(v.input.pixels).toBe(Array.from(s.pixels, (p) => p.toString(16)).join(""));
    const body = encodeBody(s);
    expect(hex(body)).toBe(v.bodyHex);
    expect(await stickerIdOf(body)).toBe(v.stickerId);
    expect(`${vectorFile.appBase}#${encodeFragment(body)}`).toBe(v.url);
    const decoded = decodeFragment(new URL(v.url).hash);
    expect(decoded.ok && decoded.sticker).toEqual(s);
  });
});

describe("rejects", () => {
  const good = encodeBody(FIXTURES.slime as Sticker);
  const frag = (body: Uint8Array) => `v1.${encodeAlnum43(deflateSync(body))}`;
  const withHeader = (h: number) => {
    const b = good.slice();
    b[0] = h >> 8;
    b[1] = h & 0xff;
    return b;
  };
  const headerOf = (b: Uint8Array) => ((b[0] ?? 0) << 8) | (b[1] ?? 0);

  test("wrong prefix / text", () => {
    expect(decodeFragment("v2.000")).toEqual({ ok: false, reason: "bad-prefix" });
    expect(decodeFragment("v1.0")).toEqual({ ok: false, reason: "bad-text" });
    expect(decodeFragment("v1.abc")).toEqual({ ok: false, reason: "bad-text" });
    expect(decodeFragment("v1.:::")).toEqual({ ok: false, reason: "bad-text" });
    expect(decodeFragment("v1.000")).toEqual({ ok: false, reason: "bad-deflate" });
  });

  test("length mismatch", () => {
    expect(decodeFragment(frag(good.subarray(0, good.length - 1))).ok).toBe(false);
    expect(decodeFragment(frag(new Uint8Array([...good, 0]))).ok).toBe(false);
    const zeroId = good.slice();
    zeroId[2] = 0;
    expect(decodeBody(zeroId)).toEqual({ ok: false, reason: "bad-length" });
  });

  test("decompression bomb", () => {
    const bomb = deflateSync(new Uint8Array(10_000_000));
    expect(decodeFragment(`v1.${encodeAlnum43(bomb)}`)).toEqual({ ok: false, reason: "too-large" });
  });

  test("header fields", () => {
    const h = headerOf(good);
    expect(decodeBody(withHeader((h & ~0x3f) | 5))).toEqual({ ok: false, reason: "bad-sns-kind" });
    expect(decodeBody(withHeader((h & ~0x3f) | 0))).toEqual({ ok: false, reason: "bad-sns-kind" });
    expect(decodeBody(withHeader((h & ~0x400) | (3 << 6)))).toEqual({
      ok: false,
      reason: "bad-transparent",
    });
  });

  test.each([
    ["bidi override", "abc‮def"],
    ["zero width", "ab​c"],
    ["control", "ab\u0001c"],
    ["disallowed char", "ab-c"],
    ["non-ascii", "あいう"],
  ])("sns id: %s", (_label, id) => {
    const idBytes = new TextEncoder().encode(id);
    const body = new Uint8Array(3 + idBytes.length + 512);
    body.set(good.subarray(0, 2));
    body[2] = idBytes.length;
    body.set(idBytes, 3);
    expect(decodeBody(body)).toEqual({ ok: false, reason: "bad-sns-id" });
  });

  test("invalid utf-8", () => {
    const body = new Uint8Array(3 + 2 + 512);
    body.set(good.subarray(0, 2));
    body[2] = 2;
    body.set([0xc3, 0x28], 3);
    expect(decodeBody(body)).toEqual({ ok: false, reason: "bad-sns-id" });
  });

  test("encodeBody refuses invalid stickers", () => {
    const s = FIXTURES.slime as Sticker;
    expect(() => encodeBody({ ...s, paletteId: 32 })).toThrow();
    expect(() => encodeBody({ ...s, snsId: "bad id" })).toThrow();
    expect(() => encodeBody({ ...s, pixels: new Uint8Array(10) })).toThrow();
  });
});

describe("fuzz: decoders never throw", () => {
  test("random bodies", () => {
    const r = rng(42);
    for (let n = 0; n < 3000; n++) {
      const len = Math.floor(r() * 700);
      const b = Uint8Array.from({ length: len }, () => Math.floor(r() * 256));
      if (r() < 0.5 && len > 3) b[2] = Math.max(0, len - 515);
      expect(() => decodeBody(b)).not.toThrow();
      expect(() => decodeFragment(frag(b))).not.toThrow();
    }
  });

  test("random fragments", () => {
    const r = rng(7);
    const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$*+-./:abc %#‮";
    for (let n = 0; n < 3000; n++) {
      const text = Array.from(
        { length: Math.floor(r() * 900) },
        () => chars[Math.floor(r() * chars.length)],
      ).join("");
      expect(() => decodeFragment(`v1.${text}`)).not.toThrow();
    }
  });

  const frag = (body: Uint8Array) => `v1.${encodeAlnum43(deflateSync(body))}`;
});

describe("sticker id", () => {
  test("is 32 hex and depends on uncompressed body only", async () => {
    const body = encodeBody(FIXTURES.noise as Sticker);
    const id = await stickerIdOf(body);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    const viaOtherDeflate = decodeFragment(`v1.${encodeAlnum43(deflateSync(body, { level: 1 }))}`);
    expect(viaOtherDeflate.ok && (await stickerIdOf(viaOtherDeflate.body))).toBe(id);
  });
});

describe("encodeBody validation boundaries", () => {
  const s = FIXTURES.slime as Sticker;
  const px = (i: number, value: number) => {
    const p = s.pixels.slice();
    p[i] = value;
    return p;
  };

  test("throws with a clear message", () => {
    expect(() => encodeBody({ ...s, paletteId: 32 })).toThrow("invalid sticker");
  });

  test.each([
    ["negative palette", { paletteId: -1 }],
    ["fractional palette", { paletteId: 1.5 }],
    ["transparent index 16", { transparentIndex: 16 }],
    ["negative transparent index", { transparentIndex: -1 }],
    ["fractional transparent index", { transparentIndex: 1.5 }],
    ["pixel value 16 (first)", { pixels: px(0, 16) }],
    ["pixel value 16 (last)", { pixels: px(PIXEL_COUNT - 1, 16) }],
    ["one pixel too many", { pixels: new Uint8Array(PIXEL_COUNT + 1) }],
    ["bad kind", { snsKind: 9 as never }],
  ])("rejects %s", (_label, patch) => {
    expect(() => encodeBody({ ...s, ...patch })).toThrow("invalid sticker");
  });

  test.each([
    ["palette 0", { paletteId: 0 }],
    ["palette 31", { paletteId: 31 }],
    ["transparent index 0", { transparentIndex: 0 }],
    ["transparent index 15", { transparentIndex: 15 }],
    ["pixel value 15", { pixels: px(5, 15) }],
  ])("accepts %s and round-trips it", (_label, patch) => {
    const t = { ...s, ...patch };
    const d = decodeFragment(encodeFragment(encodeBody(t)));
    expect(d.ok && d.sticker).toEqual(t);
  });
});

describe("decodeBody length rules", () => {
  const good = encodeBody(FIXTURES.slime as Sticker);
  const withIdLength = (n: number) => {
    const b = new Uint8Array(3 + n + 512);
    b.set(good.subarray(0, 2));
    b[2] = n;
    b.fill(0x61, 3, 3 + n);
    return b;
  };

  test("a body shorter than the fixed header is rejected", () => {
    expect(decodeBody(new Uint8Array(2))).toEqual({ ok: false, reason: "bad-length" });
    expect(decodeBody(new Uint8Array(0))).toEqual({ ok: false, reason: "bad-length" });
  });

  test("id length 0 is rejected even when the total size adds up", () => {
    expect(decodeBody(withIdLength(0))).toEqual({ ok: false, reason: "bad-length" });
  });

  test("id length over 64 is rejected even when the total size adds up", () => {
    expect(decodeBody(withIdLength(65))).toEqual({ ok: false, reason: "bad-length" });
    expect(decodeBody(withIdLength(64))).toEqual({ ok: false, reason: "bad-sns-id" });
  });

  test("returned body is a copy", () => {
    const input = good.slice();
    const r = decodeBody(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body).not.toBe(input);
    input[0] = (input[0] ?? 0) ^ 0xff;
    expect(hex(r.body)).toBe(hex(good));
  });
});

describe("inflate limit", () => {
  const zeros = (n: number) => `v1.${encodeAlnum43(deflateSync(new Uint8Array(n)))}`;

  test("output over 1024 bytes is too-large, not a malformed body", () => {
    expect(decodeFragment(zeros(1025))).toEqual({ ok: false, reason: "too-large" });
    expect(decodeFragment(zeros(5000))).toEqual({ ok: false, reason: "too-large" });
  });

  test("exactly 1024 bytes passes the limit and fails later on its length", () => {
    expect(decodeFragment(zeros(1024))).toEqual({ ok: false, reason: "bad-length" });
  });

  test("a huge fragment text is rejected as too-large before decoding", () => {
    expect(decodeFragment(`v1.${"0".repeat(2049)}`)).toEqual({ ok: false, reason: "too-large" });
  });

  test("a truncated deflate stream is bad-deflate", () => {
    const full = deflateSync(encodeBody(FIXTURES.slime as Sticker));
    for (const cut of [1, 3, 10]) {
      const r = decodeFragment(`v1.${encodeAlnum43(full.subarray(0, full.length - cut))}`);
      expect(r).toEqual({ ok: false, reason: "bad-deflate" });
    }
  });

  test("a multi-block deflate stream is reassembled in order", () => {
    const body = encodeBody(FIXTURES.noise as Sticker);
    const stored = deflateSync(body, { level: 0 });
    const r = decodeFragment(`v1.${encodeAlnum43(stored)}`);
    expect(r.ok && hex(r.body)).toBe(hex(body));
  });
});

describe("material byte", () => {
  const slime = FIXTURES.slime;
  if (!slime) throw new Error("fixture");
  const withMaterial = (material: Sticker["material"]): Sticker => ({ ...slime, material });

  test.each(["holo", "puffy", "glitter", "clear", "glow"] as const)("%s round-trips", (kind) => {
    const s = withMaterial({ kind, tone: 0 });
    const body = encodeBody(s);
    expect(body.length).toBe(encodeBody(slime).length + 1);
    const r = decodeFragment(`#${encodeFragment(body)}`);
    expect(r.ok && r.sticker).toEqual(s);
  });

  test("foil keeps its tone", () => {
    const s = withMaterial({ kind: "foil", tone: 3 });
    const r = decodeBody(encodeBody(s));
    expect(r.ok && r.sticker.material).toEqual({ kind: "foil", tone: 3 });
  });

  test("matte is the plain body: same bytes, same ID", async () => {
    const plain = encodeBody(slime);
    const matte = encodeBody(withMaterial({ kind: "matte", tone: 0 }));
    expect(hex(matte)).toBe(hex(plain));
    expect(await stickerIdOf(matte)).toBe(await stickerIdOf(plain));
    const r = decodeBody(matte);
    expect(r.ok && "material" in r.sticker).toBe(false);
  });

  test("non-canonical or unknown bytes are rejected", () => {
    const plain = encodeBody(slime);
    const tail = (b: number) => Uint8Array.from([...plain, b]);
    expect(decodeBody(tail(0x00))).toEqual({ ok: false, reason: "bad-material" });
    expect(decodeBody(tail(0x70))).toEqual({ ok: false, reason: "bad-material" });
    expect(decodeBody(tail(0x13))).toEqual({ ok: false, reason: "bad-material" });
    expect(decodeBody(tail(0x50 | (slime.transparentIndex ?? 0)))).toEqual({
      ok: false,
      reason: "bad-material",
    });
    expect(decodeBody(Uint8Array.from([...plain, 0x10, 0x10]))).toEqual({
      ok: false,
      reason: "bad-length",
    });
  });

  test("encoding refuses a material the byte cannot carry", () => {
    const bad = (material: unknown) => () =>
      encodeBody({ ...slime, material: material as Sticker["material"] });
    expect(bad({ kind: "chrome", tone: 0 })).toThrow();
    expect(bad({ kind: "holo", tone: 1 })).toThrow();
    expect(bad({ kind: "foil", tone: -1 })).toThrow();
    expect(bad({ kind: "foil", tone: 16 })).toThrow();
    expect(bad({ kind: "foil", tone: 1.5 })).toThrow();
    const opaque = { ...slime, transparentIndex: null };
    for (const tone of [0, 15]) {
      const s = { ...opaque, material: { kind: "foil", tone } } as const;
      const r = decodeBody(encodeBody(s));
      expect(r.ok && r.sticker.material).toEqual({ kind: "foil", tone });
    }
  });

  test("foil cannot turn the transparent colour to metal", () => {
    const t = slime.transparentIndex ?? 0;
    expect(() =>
      encodeBody({ ...slime, transparentIndex: t, material: { kind: "foil", tone: t } }),
    ).toThrow();
  });
});
