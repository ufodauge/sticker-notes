import jsQR from "jsqr";
import { describe, expect, test } from "vite-plus/test";
import { encodeBody, type Sticker } from "./payload.ts";
import {
  QUIET_ZONE,
  centerArea,
  opaqueBox,
  qrDrawing,
  qrForUrl,
  qrPathData,
  stickerUrl,
  type QrMatrix,
} from "./qr.ts";
import { renderRgba } from "./render.ts";
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

describe("qrDrawing", () => {
  const SCALE = 8;
  const stickerAt = (s: Sticker) => {
    const { size, rgba } = renderRgba(s);
    return { size, rgba, box: opaqueBox(rgba, size) };
  };

  const rasterise = (qr: QrMatrix, s: Sticker, roundDots: boolean) => {
    const { size, rgba, box } = stickerAt(s);
    const drawing = qrDrawing(qr, SCALE, roundDots, box);
    const side = drawing.side;
    const image = new Uint8ClampedArray(side * side * 4).fill(255);
    const paint = (px: number, py: number, v: number) =>
      image.fill(v, (py * side + px) * 4, (py * side + px) * 4 + 3);
    drawing.squares.forEach(([x, y]) => {
      for (let dy = 0; dy < SCALE; dy++)
        for (let dx = 0; dx < SCALE; dx++) paint(x + dx, y + dy, 0);
    });
    drawing.dots.forEach(([x, y]) => {
      for (let dy = 0; dy < SCALE; dy++)
        for (let dx = 0; dx < SCALE; dx++)
          if (Math.hypot(dx + 0.5 - SCALE / 2, dy + 0.5 - SCALE / 2) <= SCALE / 2)
            paint(x + dx, y + dy, 0);
    });
    const { art } = drawing;
    if (art) {
      for (let y = 0; y < art.crop.h * art.pixel; y++) {
        for (let x = 0; x < art.crop.w * art.pixel; x++) {
          const sx = art.crop.x + Math.floor(x / art.pixel);
          const sy = art.crop.y + Math.floor(y / art.pixel);
          const o = (sy * size + sx) * 4;
          if (rgba[o + 3]) image.set(rgba.subarray(o, o + 3), ((art.y + y) * side + art.x + x) * 4);
        }
      }
    }
    return jsQR(image, side, side)?.data;
  };

  test.each(Object.entries(FIXTURES))("%s decodes from the drawing with round dots", (_n, s) => {
    const url = stickerUrl(VECTOR_APP_BASE, encodeBody(s));
    expect(rasterise(qrForUrl(url), s, true)).toBe(url);
  });

  test("square-only drawing has no dots and the same lit modules", () => {
    const s = FIXTURES.slime as Sticker;
    const qr = qrForUrl(stickerUrl(VECTOR_APP_BASE, encodeBody(s)));
    const round = qrDrawing(qr, SCALE, true, null);
    const square = qrDrawing(qr, SCALE, false, null);
    expect(square.dots).toHaveLength(0);
    expect(square.squares).toHaveLength(round.squares.length + round.dots.length);
    expect(round.squares.length).toBeGreaterThan(0);
  });

  test("the sticker sits whole-number scaled inside the cleared centre", () => {
    const s = FIXTURES.slime as Sticker;
    const qr = qrForUrl(stickerUrl(VECTOR_APP_BASE, encodeBody(s)));
    const { art } = qrDrawing(qr, SCALE, true, stickerAt(s).box);
    const area = centerArea(qr.size).art;
    const low = (area.start + QUIET_ZONE) * SCALE;
    expect(art).not.toBeNull();
    expect(Number.isInteger(art?.pixel)).toBe(true);
    expect(art?.x).toBeGreaterThanOrEqual(low);
    expect((art?.x ?? 0) + (art?.crop.w ?? 0) * (art?.pixel ?? 0)).toBeLessThanOrEqual(
      low + area.side * SCALE,
    );
    expect((art?.y ?? 0) + (art?.crop.h ?? 0) * (art?.pixel ?? 0)).toBeLessThanOrEqual(
      low + area.side * SCALE,
    );
  });

  test("an empty sticker leaves the centre clear", () => {
    const qr = qrForUrl("https://a.example/#v1.0000");
    expect(qrDrawing(qr, SCALE, true, null).art).toBeNull();
    expect(opaqueBox(new Uint8ClampedArray(16 * 4), 4)).toBeNull();
  });

  test("path data has one subpath per drawn module and no module in the hole", () => {
    const qr = qrForUrl("https://a.example/#v1.0000");
    const drawing = qrDrawing(qr, SCALE, true, null);
    const d = qrPathData(drawing, SCALE);
    expect(d.match(/M/g)).toHaveLength(drawing.squares.length + drawing.dots.length);
    expect(d.match(/a/g)).toHaveLength(drawing.dots.length * 2);
  });
});
