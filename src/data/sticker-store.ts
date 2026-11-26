import * as v from "valibot";
import {
  applyChange,
  autoPlace,
  bringToFront,
  nextPageOrder,
  topZ,
  type Page,
  type Placement,
  type PlacementChange,
} from "../core/album.ts";
import { parseBackup, planMerge, serializeBackup, type BackupError } from "../core/backup.ts";
import { decodeBody, encodeBody, stickerIdOf, type Sticker } from "../core/payload.ts";
import {
  addToPocket,
  applyMerge,
  discard,
  openStickerDb,
  deleteEmptyPage,
  forgetPlacements,
  readAll,
  restore,
  savePlacement,
  todayLocal,
  type AddResult,
  type Discarded,
  type StickerOrigin,
  type StickerRecord,
} from "./db.ts";
import { events } from "./events.ts";
import { requestPersist } from "./platform.ts";
import { SETTINGS, type SettingKey, type SettingValue } from "./settings.ts";
import { isSurface } from "../core/surface.ts";

export type { AddResult, Discarded };

export type StoredSticker = StickerRecord & { readonly sticker: Sticker };

export type StoreSnapshot =
  | { readonly status: "loading" }
  | {
      readonly status: "ready";
      readonly stickers: readonly StoredSticker[];
      readonly pages: readonly Page[];
      readonly placements: readonly Placement[];
    }
  | { readonly status: "error" };

export type Ready = Extract<StoreSnapshot, { status: "ready" }>;
type Listener = () => void;

const state: { snapshot: StoreSnapshot; listeners: Set<Listener>; started: boolean } = {
  snapshot: { status: "loading" },
  listeners: new Set(),
  started: false,
};

const dbPromise = (() => {
  const cache: { p?: ReturnType<typeof openStickerDb> } = {};
  return () => (cache.p ??= openStickerDb());
})();

function publish(next: StoreSnapshot): void {
  state.snapshot = next;
  state.listeners.forEach((l) => l());
}

async function refresh(): Promise<void> {
  try {
    const all = await readAll(await dbPromise());
    const stickers = all.stickers.flatMap((r) => {
      const d = decodeBody(r.body);
      return d.ok ? [{ ...r, sticker: d.sticker }] : [];
    });
    // a sticker placed somewhere that is no more (a page or surface gone) is back in the pocket
    const pageIds = new Set(all.pages.map((p) => p.id));
    const lost = all.placements.filter((p) => !pageIds.has(p.pageId) && !isSurface(p.pageId));
    const placements = all.placements.filter((p) => !lost.includes(p));
    publish({ status: "ready", stickers, pages: all.pages, placements });
    if (lost.length > 0)
      await forgetPlacements(
        await dbPromise(),
        lost.map((p) => p.id),
      );
  } catch {
    publish({ status: "error" });
  }
}

const ready = (): Ready | undefined =>
  state.snapshot.status === "ready" ? state.snapshot : undefined;

export type ImportResult =
  | { readonly ok: true; readonly stickers: number; readonly skipped: number }
  | { readonly ok: false; readonly reason: BackupError };

export const stickerStore = {
  subscribe: (listener: Listener): (() => void) => {
    state.listeners.add(listener);
    if (!state.started) {
      state.started = true;
      void refresh();
    }
    return () => state.listeners.delete(listener);
  },
  getSnapshot: (): StoreSnapshot => state.snapshot,

  add: async (id: string, body: Uint8Array, origin: StickerOrigin): Promise<AddResult> => {
    const result = await addToPocket(await dbPromise(), {
      id,
      body,
      origin,
      receivedAt: todayLocal(),
    });
    await refresh();
    if (result.kind === "added") void requestPersist().catch(() => undefined);
    return result;
  },

  // The stickers the album starts with, stuck one after another on its first page.
  seedSamples: async (samples: readonly Sticker[]): Promise<void> => {
    for (const sticker of samples) {
      const body = encodeBody(sticker);
      const id = await stickerIdOf(body);
      await stickerStore.add(id, body, "sample");
      await stickerStore.place(id, { near: undefined });
    }
  },

  // Out of the pocket and onto a page: at a point on a page (a page that does not exist yet is
  // made), or, without a point, in the first free slot of the page it is near.
  place: async (
    stickerId: string,
    at:
      | { readonly pageId: string; readonly change: PlacementChange }
      | { readonly near: string | undefined },
  ): Promise<void> => {
    const snap = ready();
    if (!snap || snap.placements.some((p) => p.stickerId === stickerId)) return;
    const ids = { page: crypto.randomUUID(), placement: crypto.randomUUID() };
    const auto = autoPlace(
      snap.pages,
      snap.placements,
      stickerId,
      ids,
      "near" in at ? at.near : at.pageId,
    );
    const atPoint = (pageId: string, change: PlacementChange) => {
      // a surface off the album (the desk) is no page: none is made for it
      const existing = isSurface(pageId) ? pageId : snap.pages.find((p) => p.id === pageId)?.id;
      const target = existing ?? ids.page;
      return {
        placement: {
          ...applyChange(auto.placement, change),
          pageId: target,
          z: topZ(snap.placements, target) + 1,
        },
        newPage: existing ? undefined : { id: ids.page, order: nextPageOrder(snap.pages) },
      };
    };
    const { placement, newPage } =
      "near" in at
        ? { placement: auto.placement, newPage: auto.newPage ?? undefined }
        : atPoint(at.pageId, at.change);
    publish({
      ...snap,
      pages: newPage ? [...snap.pages, newPage] : snap.pages,
      placements: [...snap.placements, placement],
    });
    events.emit({ type: "sticker.placed", stickerId });
    await savePlacement(await dbPromise(), placement, newPage);
  },

  discard: async (stickerId: string): Promise<Discarded | undefined> => {
    const d = await discard(await dbPromise(), stickerId);
    await refresh();
    return d;
  },
  restore: async (d: Discarded): Promise<void> => {
    await restore(await dbPromise(), d);
    await refresh();
  },

  update: async (
    placementId: string,
    change: PlacementChange & { readonly front?: boolean },
  ): Promise<void> => {
    const snap = ready();
    const current = snap?.placements.find((p) => p.id === placementId);
    if (!snap || !current) return;
    const changed = applyChange(current, change);
    const next = change.front ? bringToFront(snap.placements, changed) : changed;
    publish({ ...snap, placements: snap.placements.map((p) => (p.id === placementId ? next : p)) });
    await (await dbPromise()).put("placements", next);
  },

  moveTo: async (
    placementId: string,
    pageId: string | null,
    change: PlacementChange,
  ): Promise<void> => {
    const snap = ready();
    const current = snap?.placements.find((p) => p.id === placementId);
    if (!snap || !current) return;
    const newPage =
      pageId === null ? { id: crypto.randomUUID(), order: nextPageOrder(snap.pages) } : undefined;
    const target = newPage?.id ?? pageId ?? current.pageId;
    const next = {
      ...applyChange(current, change),
      pageId: target,
      z: topZ(snap.placements, target) + 1,
    };
    publish({
      ...snap,
      pages: newPage ? [...snap.pages, newPage] : snap.pages,
      placements: snap.placements.map((p) => (p.id === placementId ? next : p)),
    });
    events.emit({ type: "sticker.placed", stickerId: current.stickerId });
    await savePlacement(await dbPromise(), next, newPage);
  },

  // Off the page and back into the pocket.
  unplace: async (placementId: string): Promise<void> => {
    const snap = ready();
    if (!snap) return;
    const gone = snap.placements.find((p) => p.id === placementId);
    publish({ ...snap, placements: snap.placements.filter((p) => p.id !== placementId) });
    if (gone) events.emit({ type: "sticker.pocketed", stickerId: gone.stickerId });
    await (await dbPromise()).delete("placements", placementId);
  },

  deletePage: async (pageId: string): Promise<void> => {
    if (await deleteEmptyPage(await dbPromise(), pageId)) await refresh();
  },

  exportBackup: async (): Promise<string> =>
    serializeBackup(await readAll(await dbPromise()), new Date()),

  importBackup: async (text: string): Promise<ImportResult> => {
    const parsed = await parseBackup(text);
    if (!parsed.ok) return parsed;
    const db = await dbPromise();
    const plan = planMerge(await readAll(db), parsed.data);
    await applyMerge(db, plan);
    await refresh();
    return { ok: true, stickers: plan.stickers.length, skipped: parsed.skipped };
  },
};

export const settings = {
  get: async <K extends SettingKey>(key: K): Promise<SettingValue<K> | null> => {
    const raw = (await (await dbPromise()).get("settings", key))?.value;
    const r = v.safeParse(SETTINGS[key], raw);
    return r.success ? (r.output as SettingValue<K>) : null;
  },
  // resolves once the write is committed (not just requested), so a reload right after keeps it
  set: async <K extends SettingKey>(key: K, value: SettingValue<K>): Promise<void> => {
    const tx = (await dbPromise()).transaction("settings", "readwrite");
    await Promise.all([tx.store.put({ key, value }), tx.done]);
  },
};
