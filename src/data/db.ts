import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { autoPlace, nextPageOrder, type Page, type Placement } from "../core/album.ts";
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
const DB_VERSION = 1;
const ALBUM = ["stickers", "pages", "placements"] as const;

export function openStickerDb(): Promise<Db> {
  return openDB<StickerDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
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

const newId = () => crypto.randomUUID();

export type AddResult =
  | { readonly kind: "added"; readonly placement: Placement }
  | { readonly kind: "duplicate"; readonly placement: Placement | undefined };

export async function addAndPlace(db: Db, rec: BackupSticker): Promise<AddResult> {
  const tx = db.transaction(ALBUM, "readwrite");
  const stickers = tx.objectStore("stickers");
  const placementsStore = tx.objectStore("placements");
  if (await stickers.get(rec.id)) {
    const placement = await placementsStore.index("byStickerId").get(rec.id);
    await tx.done;
    return { kind: "duplicate", placement };
  }
  const [last, pages, placements] = await Promise.all([
    stickers.index("byAdded").openCursor(null, "prev"),
    tx.objectStore("pages").getAll(),
    placementsStore.getAll(),
  ]);
  const plan = autoPlace(pages, placements, rec.id, { page: newId(), placement: newId() });
  await Promise.all([
    stickers.add({ ...rec, addedSeq: (last?.value.addedSeq ?? 0) + 1 }),
    plan.newPage ? tx.objectStore("pages").add(plan.newPage) : undefined,
    placementsStore.add(plan.placement),
  ]);
  await tx.done;
  return { kind: "added", placement: plan.placement };
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

export async function addPage(db: Db): Promise<Page> {
  const tx = db.transaction("pages", "readwrite");
  const pages = await tx.store.getAll();
  const page = { id: newId(), order: nextPageOrder(pages) };
  await tx.store.add(page);
  await tx.done;
  return page;
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
  const [pages, placements] = await Promise.all([
    tx.objectStore("pages").getAll(),
    tx.objectStore("placements").getAll(),
  ]);
  const placed = new Set(placements.map((p) => p.stickerId));
  const orphans = plan.stickers.filter((s) => !placed.has(s.id));
  // place sequentially: each placement changes which slot is free next
  const final = orphans.reduce(
    (acc, s) => {
      const r = autoPlace(acc.pages, acc.placements, s.id, { page: newId(), placement: newId() });
      return {
        pages: r.newPage ? [...acc.pages, r.newPage] : acc.pages,
        placements: [...acc.placements, r.placement],
        added: [...acc.added, r],
      };
    },
    { pages, placements, added: [] as ReturnType<typeof autoPlace>[] },
  );
  await Promise.all(
    final.added.flatMap((r) => [
      r.newPage ? tx.objectStore("pages").add(r.newPage) : undefined,
      tx.objectStore("placements").add(r.placement),
    ]),
  );
  await tx.done;
}

export function todayLocal(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
