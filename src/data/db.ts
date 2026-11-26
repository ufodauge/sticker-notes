import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Page, Placement } from "../core/album.ts";
import type { BackupSticker, MergePlan, StickerOrigin } from "../core/backup.ts";

export type { StickerOrigin };

export type StickerRecord = BackupSticker & {
  readonly addedSeq: number;
};

type SettingRecord = { readonly key: string; readonly value: unknown };

interface StickerDb extends DBSchema {
  stickers: { key: string; value: StickerRecord; indexes: { byAdded: number } };
  pages: { key: string; value: Page; indexes: { byOrder: number } };
  placements: {
    key: string;
    value: Placement;
    indexes: { byPage: string; byStickerId: string };
  };
  settings: { key: string; value: SettingRecord };
}

export type Db = IDBPDatabase<StickerDb>;

const DB_NAME = "sticker-notes";
const DB_VERSION = 2;
const ALBUM = ["stickers", "pages", "placements"] as const;

export function openStickerDb(): Promise<Db> {
  return openDB<StickerDb>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion >= 1) return;
      const stickers = db.createObjectStore("stickers", { keyPath: "id" });
      stickers.createIndex("byAdded", "addedSeq");
      const pages = db.createObjectStore("pages", { keyPath: "id" });
      pages.createIndex("byOrder", "order");
      const placements = db.createObjectStore("placements", { keyPath: "id" });
      placements.createIndex("byPage", "pageId");
      placements.createIndex("byStickerId", "stickerId", { unique: true });
      db.createObjectStore("settings", { keyPath: "key" });
    },
  });
}

export type AddResult =
  | { readonly kind: "added" }
  | { readonly kind: "duplicate"; readonly placement: Placement | undefined };

// A new sticker goes into the pocket: it has no placement until the person sticks it on a page.
export async function addToPocket(db: Db, rec: BackupSticker): Promise<AddResult> {
  const tx = db.transaction(ALBUM, "readwrite");
  const stickers = tx.objectStore("stickers");
  if (await stickers.get(rec.id)) {
    const placement = await tx.objectStore("placements").index("byStickerId").get(rec.id);
    await tx.done;
    return { kind: "duplicate", placement };
  }
  const last = await stickers.index("byAdded").openCursor(null, "prev");
  await stickers.add({ ...rec, addedSeq: (last?.value.addedSeq ?? 0) + 1 });
  await tx.done;
  return { kind: "added" };
}

export type Discarded = {
  readonly sticker: StickerRecord;
  readonly placement: Placement | undefined;
};

export async function discard(db: Db, stickerId: string): Promise<Discarded | undefined> {
  const tx = db.transaction(ALBUM, "readwrite");
  const sticker = await tx.objectStore("stickers").get(stickerId);
  if (!sticker) {
    await tx.done;
    return undefined;
  }
  const placement = await tx.objectStore("placements").index("byStickerId").get(stickerId);
  await tx.objectStore("stickers").delete(stickerId);
  if (placement) await tx.objectStore("placements").delete(placement.id);
  await tx.done;
  // pages stay, even when left empty: the person decides about pages (see deleteEmptyPage)
  return { sticker, placement };
}

export async function restore(db: Db, d: Discarded): Promise<void> {
  const tx = db.transaction(ALBUM, "readwrite");
  await Promise.all([
    tx.objectStore("stickers").put(d.sticker),
    d.placement ? tx.objectStore("placements").put(d.placement) : undefined,
  ]);
  await tx.done;
}

export async function savePlacement(db: Db, placement: Placement, newPage?: Page): Promise<void> {
  const tx = db.transaction(["pages", "placements"], "readwrite");
  await Promise.all([
    newPage ? tx.objectStore("pages").add(newPage) : undefined,
    tx.objectStore("placements").put(placement),
  ]);
  await tx.done;
}

export async function deleteEmptyPage(db: Db, pageId: string): Promise<boolean> {
  const tx = db.transaction(["pages", "placements"], "readwrite");
  const [onPage, pages] = await Promise.all([
    tx.objectStore("placements").index("byPage").count(pageId),
    tx.objectStore("pages").count(),
  ]);
  const ok = onPage === 0 && pages > 1;
  if (ok) await tx.objectStore("pages").delete(pageId);
  await tx.done;
  return ok;
}

export type AllData = {
  readonly stickers: readonly StickerRecord[];
  readonly pages: readonly Page[];
  readonly placements: readonly Placement[];
};

export async function readAll(db: Db): Promise<AllData> {
  const tx = db.transaction(ALBUM, "readonly");
  const [stickers, pages, placements] = await Promise.all([
    tx.objectStore("stickers").index("byAdded").getAll(),
    tx.objectStore("pages").index("byOrder").getAll(),
    tx.objectStore("placements").getAll(),
  ]);
  await tx.done;
  return { stickers, pages, placements };
}

export async function applyMerge(db: Db, plan: MergePlan): Promise<void> {
  const tx = db.transaction(ALBUM, "readwrite");
  const stickers = tx.objectStore("stickers");
  const last = await stickers.index("byAdded").openCursor(null, "prev");
  const base = last?.value.addedSeq ?? 0;
  await Promise.all([
    ...plan.stickers.map((s, i) => stickers.put({ ...s, addedSeq: base + i + 1 })),
    ...plan.pages.map((p) => tx.objectStore("pages").put(p)),
    ...plan.placements.map((p) => tx.objectStore("placements").put(p)),
  ]);
  await tx.done;
}

export function todayLocal(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
