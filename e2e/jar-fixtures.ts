import { serializeBackup } from "../src/core/backup.ts";
import { encodeBody, stickerIdOf } from "../src/core/payload.ts";
import { FIXTURES } from "../src/core/testing/fixtures.ts";

// Hand-made fake silhouettes (no photos) for judging the jar's shapes: each one says which of the
// 32x32 cells are filled, relative to the centre.
const SHAPES: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => Math.hypot(x, y) < 13,
  (x, y) => Math.hypot(x, y) < 13 && Math.hypot(x, y) > 6,
  (x, y) => (x * x + (y + 2) ** 2 - 100) ** 3 - 0.6 * x * x * (y + 2) ** 3 < 0 && Math.abs(x) < 14,
  (x, y) => {
    const r = Math.hypot(x, y);
    const a = Math.atan2(y, x) + Math.PI / 2;
    return r < 7 + 7 * Math.abs(Math.cos((a * 5) / 2)) ** 1.5;
  },
  (x, y) => (Math.abs(x) < 4.5 && Math.abs(y) < 13) || (Math.abs(y) < 4.5 && Math.abs(x) < 13),
  (x, y) => Math.abs(x) + Math.abs(y) < 14,
  (x, y) => y > -12 && y < 12 && Math.abs(x) < (y + 12) * 0.55,
  (x, y) => (x > -12 && x < -3 && y > -13 && y < 13) || (x >= -3 && x < 12 && y > 3 && y < 13),
  (x, y) => Math.hypot(x + 8, y) < 6 || Math.hypot(x - 8, y) < 6,
  (x, y) => Math.hypot(x / 7, y / 13) < 1,
  (x, y) => Math.hypot(x, y) < 13 && Math.hypot(x - 6, y - 2) > 10,
  (x, y) => Math.abs(x) < 2 && Math.abs(y) < 2,
];

export async function shapesBackup(count: number): Promise<string> {
  const slime = FIXTURES.slime;
  if (!slime) throw new Error("no fixture");
  const stickers = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const own = SHAPES[i % (SHAPES.length + 1)];
      const body = encodeBody(
        own
          ? {
              paletteId: (i * 5) % 32,
              transparentIndex: 0,
              snsKind: 1,
              snsId: `shape_${i}`,
              pixels: Uint8Array.from({ length: 1024 }, (_, p) => {
                const x = (p % 32) - 15.5;
                const y = Math.floor(p / 32) - 15.5;
                const band = Math.floor((x + 16) / 5) + Math.floor((y + 16) / 5) + i;
                return own(x, y) ? 1 + (band % 15) : 0;
              }),
            }
          : { ...slime, paletteId: (i * 5) % 32, snsId: `shape_${i}` },
      );
      return {
        id: await stickerIdOf(body),
        body,
        origin: "received" as const,
        receivedAt: "2026-11-23",
      };
    }),
  );
  return serializeBackup({ stickers, pages: [], placements: [] }, new Date());
}
