/// <reference lib="dom" />
import { expect, type Locator, type Page } from "@playwright/test";
import * as jsqrModule from "jsqr";
import vectorFile from "../test/vectors/payload-v1.json" with { type: "json" };
import { decodeFragment, type Sticker } from "../src/core/payload.ts";
import { decodeRgba, type RgbaImage } from "../test/png.ts";

export const fragmentOf = (name: string): string => {
  const v = vectorFile.vectors.find((x) => x.name === name);
  if (!v) throw new Error(`no vector ${name}`);
  return new URL(v.url).hash;
};

export const pocketButton = (page: Page): Locator =>
  page.getByRole("button", { name: /^ポケット\(\d+枚\)$/ });

// Takes the sticker out of the pocket and sticks it on the current page (the keyboard way).
export async function stickFromPocket(page: Page, label: string): Promise<void> {
  await pocketButton(page).click();
  await page.getByRole("button", { name: `${label} を手に取る`, exact: true }).click();
  await page.getByRole("button", { name: "はがしてページに貼る" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
}

export async function stickAllFromPocket(page: Page): Promise<void> {
  while ((await pocketButton(page).count()) > 0) {
    await pocketButton(page).click();
    await page
      .getByRole("button", { name: / を手に取る$/ })
      .first()
      .click();
    await page.getByRole("button", { name: "はがしてページに貼る" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
}

// Receives a link (the sticker lands in the pocket) and sticks it on the album.
export async function receive(page: Page, name: string, label: string): Promise<void> {
  await receiveToPocket(page, name);
  await stickFromPocket(page, label);
}

export async function receiveToPocket(page: Page, name: string): Promise<void> {
  await page.goto(`/${fragmentOf(name)}`);
  await expect(pocketButton(page)).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe("");
}

// jsqr is CommonJS with an `exports.default`; resolve it the same way under every loader
const jsqrAny: unknown = jsqrModule;
const jsQR = (
  typeof jsqrAny === "function" ? jsqrAny : (jsqrAny as { default: unknown }).default
) as (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;

export const decodeQrText = (image: RgbaImage): string | undefined =>
  jsQR(image.data, image.width, image.height)?.data;

export async function readQrUrl(page: Page): Promise<string | undefined> {
  const qr = page.getByRole("img", { name: /のQRコード$/ });
  await expect(qr).toBeVisible();
  await page.waitForTimeout(400);
  return decodeQrText(decodeRgba(await qr.screenshot()));
}

export async function readQr(page: Page): Promise<Sticker | undefined> {
  const r = decodeFragment(new URL((await readQrUrl(page)) ?? "http://x/").hash);
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

// Turns the notebook one step by dragging across the strip above the pages.
export async function turnPage(page: Page, direction: 1 | -1): Promise<void> {
  const v = await page.locator("[data-album]").boundingBox();
  if (!v) throw new Error("no album");
  const y = v.y + 6;
  const [from, to] = direction > 0 ? [0.85, 0.1] : [0.1, 0.85];
  await page.mouse.move(v.x + v.width * from, y);
  await page.mouse.down();
  await page.mouse.move(v.x + v.width * to, y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(800);
}

// Peels a sticker off and carries it to a point, holding it there for `holdMs` (an edge hold
// turns the page), then lets go at `drop` (or where it is).
export async function carrySticker(
  page: Page,
  sticker: Locator,
  to: { readonly x: number; readonly y: number },
  options: { readonly holdMs?: number; readonly drop?: { x: number; y: number } } = {},
): Promise<void> {
  const b = await settledBox(sticker);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  if (options.holdMs) await page.waitForTimeout(options.holdMs);
  if (options.drop) await page.mouse.move(options.drop.x, options.drop.y, { steps: 8 });
  await page.mouse.up();
}
