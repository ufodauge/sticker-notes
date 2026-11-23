import jsQR from "jsqr";
import { describe, expect, test } from "vite-plus/test";
import { encodeBody, type Sticker } from "./payload.ts";
import { centerArea, qrForUrl, stickerUrl, type QrMatrix } from "./qr.ts";
import { FIXTURES } from "./testing/fixtures.ts";
import { VECTOR_APP_BASE } from "./testing/vectors.ts";

function decodeWithJsQr(m: QrMatrix): string | undefined {
  const scale = 4;
  const quiet = 4;
  const side = (m.size + quiet * 2) * scale;
  const rgba = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (!m.modules[y * m.size + x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const o = (((y + quiet) * scale + dy) * side + (x + quiet) * scale + dx) * 4;
          rgba.fill(0, o, o + 3);
        }
      }
    }
  }
  return jsQR(rgba, side, side)?.data;
}

describe("qr", () => {
  test.each(Object.entries(FIXTURES))("%s decodes back to the same URL", (_n, s) => {
    const url = stickerUrl(VECTOR_APP_BASE, encodeBody(s));
    const qr = qrForUrl(url);
    expect(decodeWithJsQr(qr)).toBe(url);
  });

  test("two segments beat byte-only mode", () => {
    const url = stickerUrl(VECTOR_APP_BASE, encodeBody(FIXTURES.noise as Sticker));
    const mixed = qrForUrl(url);
    const byteOnly = qrForUrl(url.replace("#v1.", "#x"));
    expect(mixed.size).toBeLessThan(byteOnly.size);
  });

  test("the noise sticker, the densest case, is QR version 26 at ECC H (19 at ECC M)", () => {
    const noise = qrForUrl(stickerUrl(VECTOR_APP_BASE, encodeBody(FIXTURES.noise as Sticker)));
    expect(noise.version).toBe(26);
  });

  test.each(Object.entries(FIXTURES))("%s still decodes with the centre cleared", (_n, s) => {
    const url = stickerUrl(VECTOR_APP_BASE, encodeBody(s));
    const qr = qrForUrl(url);
    const { hole, art } = centerArea(qr.size);
    expect((qr.size - hole.side) % 2).toBe(0);
    expect(art.start).toBe(hole.start + 1);
    expect(hole.side ** 2 / qr.size ** 2).toBeLessThan(0.1);
    const modules = Uint8Array.from(qr.modules);
    for (let y = hole.start; y < hole.start + hole.side; y++)
      for (let x = hole.start; x < hole.start + hole.side; x++) modules[y * qr.size + x] = 0;
    expect(decodeWithJsQr({ ...qr, modules })).toBe(url);
  });

  test("stickerUrl drops an existing fragment", () => {
    expect(stickerUrl("https://a.example/s/#old", new Uint8Array([1, 2]))).toMatch(
      /^https:\/\/a\.example\/s\/#v1\./,
    );
  });
});

describe("qr details", () => {
  const tail = "ABCDEFGHIJ0123456789".repeat(20);

  test("a URL that is only a fragment still uses the alphanumeric segment", () => {
    const frag = qrForUrl(`#v1.${tail}`);
    const plain = qrForUrl(`#x${tail}`);
    expect(frag.version).toBeLessThan(plain.version);
  });

  test("stickerUrl drops a fragment that starts at the first character", () => {
    expect(stickerUrl("#old", new Uint8Array([1, 2]))).toMatch(/^#v1\./);
  });

  test("a URL without the fragment marker or with an empty body is plain byte data", () => {
    for (const url of ["https://a.example/s/", "https://a.example/s/#v1."]) {
      expect(decodeWithJsQr(qrForUrl(url))).toBe(url);
    }
  });

  test("modules are 0/1 and the matrix is square", () => {
    const m = qrForUrl("https://a.example/#v1.0000");
    expect(m.modules).toHaveLength(m.size * m.size);
    expect(m.modules.every((v) => v === 0 || v === 1)).toBe(true);
    expect(m.size).toBe(17 + m.version * 4);
  });
});

test("a URL that is only a fragment decodes back completely", () => {
  const url = `#v1.${"ABCDEFGHIJ0123456789".repeat(20)}`;
  expect(decodeWithJsQr(qrForUrl(url))).toBe(url);
});

test("stickerUrl keeps a base without a fragment whole", () => {
  expect(stickerUrl("https://a.example/s/", new Uint8Array([1, 2]))).toMatch(
    /^https:\/\/a\.example\/s\/#v1\./,
  );
});
