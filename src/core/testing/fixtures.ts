import { PIXEL_COUNT, STICKER_SIZE, type Sticker } from "../payload.ts";
import { mulberry32 } from "../prng.ts";

export const rng = mulberry32;

const fromRows = (rows: readonly string[], map: Readonly<Record<string, number>>): Uint8Array =>
  Uint8Array.from({ length: PIXEL_COUNT }, (_, i) => {
    const ch = rows[Math.floor(i / STICKER_SIZE)]?.[i % STICKER_SIZE] ?? ".";
    return map[ch] ?? 0;
  });

const SLIME = [
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "..............kkkk..............",
  "............kkggggkk............",
  "..........kkggggggggkk..........",
  "........kkggwwggggggggkk........",
  ".......kgggwwgggggggggggk.......",
  "......kgggggggggggggggggk.......",
  "......kggggggggggggggggggk......",
  ".....kggggkkggggggkkgggggk......",
  ".....kggggkkggggggkkggggggk.....",
  ".....kgggggggggggggggggggggk....",
  "....kgggggggggkkkggggggggggk....",
  "....kgggggggggggggggggggggggk...",
  "....kddgggggggggggggggggggddk...",
  "....kdddggggggggggggggggdddk....",
  ".....kdddddddddddddddddddkk.....",
  "......kkkkkkkkkkkkkkkkkkkk......",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
];

export const FIXTURES: Readonly<Record<string, Sticker>> = {
  allTransparent: {
    paletteId: 0,
    transparentIndex: 7,
    snsKind: 1,
    snsId: "a",
    pixels: new Uint8Array(PIXEL_COUNT).fill(7),
  },
  slime: {
    paletteId: 0,
    transparentIndex: 7,
    snsKind: 1,
    snsId: "sticker_fan2026",
    pixels: fromRows(SLIME, { ".": 7, k: 0, g: 11, w: 7, d: 3 }),
  },
  longestId: {
    paletteId: 31,
    transparentIndex: null,
    snsKind: 3,
    snsId: `${"a".repeat(52)}.bsky.social`,
    pixels: Uint8Array.from({ length: PIXEL_COUNT }, (_, i) => (i % 33) % 16),
  },
  noise: {
    paletteId: 2,
    transparentIndex: null,
    snsKind: 2,
    snsId: "noise.maker_01",
    pixels: (() => {
      const r = rng(12345);
      return Uint8Array.from({ length: PIXEL_COUNT }, () => Math.floor(r() * 16));
    })(),
  },
  discord: {
    paletteId: 17,
    transparentIndex: 1,
    snsKind: 4,
    snsId: "pixel.trader",
    pixels: Uint8Array.from({ length: PIXEL_COUNT }, (_, i) =>
      Math.hypot((i % 32) - 15.5, Math.floor(i / 32) - 15.5) < 12 ? 2 + ((i >> 5) % 4) : 1,
    ),
  },
};
