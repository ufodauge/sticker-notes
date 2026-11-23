import type { Placement } from "../src/core/album.ts";
import { serializeBackup, type BackupSticker } from "../src/core/backup.ts";
import { encodeBody, stickerIdOf } from "../src/core/payload.ts";
import { rng } from "../src/core/testing/fixtures.ts";

export async function bigBackup(count: number, placed: number): Promise<string> {
  const r = rng(77);
  const stickers: BackupSticker[] = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const body = encodeBody({
        paletteId: i % 32,
        transparentIndex: i % 2 ? 0 : null,
        snsKind: 1,
        snsId: `user_${i}`,
        pixels: Uint8Array.from({ length: 1024 }, () => Math.floor(r() * 16)),
      });
      return {
        id: await stickerIdOf(body),
        body,
        origin: "received" as const,
        receivedAt: "2026-11-23",
      };
    }),
  );
  const placements: Placement[] = stickers.slice(0, placed).map((s, i) => ({
    id: `pl${i}`,
    pageId: "p1",
    stickerId: s.id,
    x: (i % 8) / 8 + 0.06,
    y: Math.floor(i / 8) / 8 + 0.06,
    scale: 1,
    rotation: (i * 7) % 30,
    z: i + 1,
  }));
  return serializeBackup(
    { stickers, pages: placed > 0 ? [{ id: "p1", order: 0 }] : [], placements },
    new Date(),
  );
}
