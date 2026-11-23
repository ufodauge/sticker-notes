/// <reference lib="dom" />
import { expect, type Locator, type Page } from "@playwright/test";
import * as jsqrModule from "jsqr";
import vectorFile from "../test/vectors/payload-v1.json" with { type: "json" };
import { decodeFragment, type Sticker } from "../src/core/payload.ts";
import { decodeRgba } from "../test/png.ts";

export const fragmentOf = (name: string): string => {
  const v = vectorFile.vectors.find((x) => x.name === name);
  if (!v) throw new Error(`no vector ${name}`);
  return new URL(v.url).hash;
};

export async function receive(page: Page, name: string, label: string): Promise<void> {
  await page.goto(`/${fragmentOf(name)}`);
  await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe("");
}

// jsqr is CommonJS with an `exports.default`; resolve it the same way under every loader
const jsqrAny: unknown = jsqrModule;
const jsQR = (
  typeof jsqrAny === "function" ? jsqrAny : (jsqrAny as { default: unknown }).default
) as (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;

export async function readQr(page: Page): Promise<Sticker | undefined> {
  const qr = page.getByRole("img", { name: /のQRコード$/ });
  await expect(qr).toBeVisible();
  await page.waitForTimeout(400);
  const shot = decodeRgba(await qr.screenshot());
  const decoded = jsQR(shot.data, shot.width, shot.height);
  const r = decodeFragment(new URL(decoded?.data ?? "http://x/").hash);
  return r.ok ? r.sticker : undefined;
}

export async function settledBox(
  el: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const seen: { last: string } = { last: "" };
  await expect
    .poll(async () => {
      const now = JSON.stringify(await el.boundingBox());
      const same = now === seen.last;
      seen.last = now;
      return same;
    })
    .toBe(true);
  const box = await el.boundingBox();
  if (!box) throw new Error("no box");
  return box;
}

export function placementsPerPage(page: Page): Promise<number[]> {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const r = indexedDB.open("sticker-notes");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const all = <T>(store: string) =>
      new Promise<T[]>((resolve) => {
        const q = db.transaction(store).objectStore(store).getAll();
        q.onsuccess = () => resolve(q.result as T[]);
      });
    const pages = await all<{ id: string; order: number }>("pages");
    const placements = await all<{ pageId: string }>("placements");
    db.close();
    return pages
      .toSorted((a, b) => a.order - b.order)
      .map((p) => placements.filter((x) => x.pageId === p.id).length);
  });
}

export function savedPositions(page: Page): Promise<{ x: number; y: number }[]> {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const r = indexedDB.open("sticker-notes");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const rows = await new Promise<{ x: number; y: number }[]>((resolve) => {
      const q = db.transaction("placements").objectStore("placements").getAll();
      q.onsuccess = () => resolve(q.result as { x: number; y: number }[]);
    });
    db.close();
    return rows.map(({ x, y }) => ({ x, y }));
  });
}
