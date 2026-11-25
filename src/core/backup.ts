import * as v from "valibot";
import {
  PageSchema,
  PlacementSchema,
  spreadsFromPages,
  type Page,
  type Placement,
} from "./album.ts";
import { decodeBody, stickerIdOf } from "./payload.ts";

const BACKUP_FORMAT = "sticker-notes-backup";
// 2: a page is a spread (version 1 files had single pages, read as pairs)
const BACKUP_VERSION = 2;
const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

const StickerOriginSchema = v.picklist(["mine", "received"]);
export type StickerOrigin = v.InferOutput<typeof StickerOriginSchema>;

export const LocalDateSchema = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/));

export type BackupSticker = {
  readonly id: string;
  readonly body: Uint8Array;
  readonly origin: StickerOrigin;
  // the day it came into this album: received, or (for one's own) made
  readonly receivedAt: string | null;
};

export type BackupData = {
  readonly stickers: readonly BackupSticker[];
  readonly pages: readonly Page[];
  readonly placements: readonly Placement[];
};

const toBase64 = (b: Uint8Array) => btoa(Array.from(b, (x) => String.fromCharCode(x)).join(""));
const fromBase64 = (s: string): Uint8Array | undefined => {
  try {
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  } catch {
    return undefined;
  }
};

const HeaderSchema = v.object({
  format: v.literal(BACKUP_FORMAT),
  version: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

const FileSchema = v.object({
  stickers: v.optional(v.array(v.unknown()), []),
  pages: v.optional(v.array(v.unknown()), []),
  placements: v.optional(v.array(v.unknown()), []),
});

const StickerEntrySchema = v.object({
  id: v.string(),
  body: v.string(),
  origin: StickerOriginSchema,
  receivedAt: v.nullish(v.string()),
});

export function serializeBackup(data: BackupData, exportedAt: Date): string {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    stickers: data.stickers.map((s) => ({
      id: s.id,
      body: toBase64(s.body),
      origin: s.origin,
      receivedAt: s.receivedAt,
    })),
    pages: data.pages.map((p) => ({ id: p.id, order: p.order })),
    placements: data.placements,
  });
}

const BACKUP_ERRORS = ["not-json", "not-backup", "newer-version", "too-large"] as const;
export type BackupError = (typeof BACKUP_ERRORS)[number];

export type ParseResult =
  | { readonly ok: true; readonly data: BackupData; readonly skipped: number }
  | { readonly ok: false; readonly reason: BackupError };

async function checkSticker(raw: unknown): Promise<BackupSticker | undefined> {
  const entry = v.safeParse(StickerEntrySchema, raw);
  if (!entry.success) return undefined;
  const s = entry.output;
  const body = fromBase64(s.body);
  if (!body || !decodeBody(body).ok) return undefined;
  const id = await stickerIdOf(body);
  if (s.id !== id) return undefined;
  const receivedAt = v.is(LocalDateSchema, s.receivedAt) ? s.receivedAt : null;
  return { id, body, origin: s.origin, receivedAt };
}

export async function parseBackup(text: string): Promise<ParseResult> {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, reason: "too-large" };
  const json = (() => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return undefined;
    }
  })();
  if (json === undefined) return { ok: false, reason: "not-json" };
  const header = v.safeParse(HeaderSchema, json);
  if (!header.success) return { ok: false, reason: "not-backup" };
  if (header.output.version > BACKUP_VERSION) return { ok: false, reason: "newer-version" };
  const file = v.parse(FileSchema, json);

  const checked = await Promise.all(file.stickers.map(checkSticker));
  const seen = new Set<string>();
  const stickers = checked.filter((s): s is BackupSticker => {
    if (!s || seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
  const pages = file.pages.flatMap((p) => {
    const r = v.safeParse(PageSchema, p);
    return r.success ? [r.output] : [];
  });
  const pageIds = new Set(pages.map((p) => p.id));
  const placedStickers = new Set<string>();
  const placements = file.placements.flatMap((raw) => {
    const r = v.safeParse(PlacementSchema, raw);
    if (!r.success) return [];
    const p = r.output;
    if (!pageIds.has(p.pageId) || !seen.has(p.stickerId) || placedStickers.has(p.stickerId)) {
      return [];
    }
    placedStickers.add(p.stickerId);
    return [p];
  });
  const skipped =
    file.stickers.length -
    stickers.length +
    (file.pages.length - pages.length) +
    (file.placements.length - placements.length);
  const album =
    header.output.version < 2 ? spreadsFromPages(pages, placements) : { pages, placements };
  return { ok: true, data: { stickers, ...album }, skipped };
}

export type MergePlan = {
  readonly stickers: readonly BackupSticker[];
  readonly pages: readonly Page[];
  readonly placements: readonly Placement[];
};

export function planMerge(current: BackupData, incoming: BackupData): MergePlan {
  const haveSticker = new Set(current.stickers.map((s) => s.id));
  const havePage = new Set(current.pages.map((p) => p.id));
  const havePlacement = new Set(current.placements.map((p) => p.id));
  const placed = new Set(current.placements.map((p) => p.stickerId));
  const baseOrder = current.pages.reduce((o, p) => Math.max(o, p.order), -1) + 1;
  const pages = incoming.pages
    .filter((p) => !havePage.has(p.id))
    .toSorted((a, b) => a.order - b.order)
    .map((p, i) => ({ ...p, order: baseOrder + i }));
  const targetPages = new Set([...havePage, ...pages.map((p) => p.id)]);
  return {
    stickers: incoming.stickers.filter((s) => !haveSticker.has(s.id)),
    pages,
    placements: incoming.placements.filter(
      (p) => !placed.has(p.stickerId) && !havePlacement.has(p.id) && targetPages.has(p.pageId),
    ),
  };
}
