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
  while ((await pocketButton(page).getAttribute("aria-label")) !== "ポケット(0枚)") {
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

const openSpread = (page: Page) => page.locator("[data-open]").getAttribute("data-open");

// Opens the next (or previous) spread by dragging across the top edge of the pages (the album lies
// on the desk: only the book and a margin around it take a page): on a narrow screen the first
// drag may only slide to the other half of the spread, so it drags again.
export async function turnPage(page: Page, direction: 1 | -1): Promise<void> {
  const before = await openSpread(page);
  for (let tries = 0; tries < 2 && (await openSpread(page)) === before; tries++) {
    const b = await page.locator("[data-open]").boundingBox();
    const vw = page.viewportSize()?.width ?? 400;
    if (!b) throw new Error("no book");
    const right = Math.min(b.x + b.width, vw) - 6;
    const left = Math.max(b.x, 0) + 6;
    const span = right - left;
    const y = b.y + 6;
    const [from, to] = direction > 0 ? [right, left + span * 0.1] : [left, right - span * 0.1];
    await page.mouse.move(from, y);
    await page.mouse.down();
    await page.mouse.move(to, y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(800);
  }
  await expect(page.locator("[data-curling]")).toHaveCount(0);
}

// Peels a sticker off and carries it to a point, holding it there for `holdMs` (an edge hold
// turns the page), then lets go at `drop` (or where it is).
// A point just inside the sticker's outline, where it can be lifted: the first point along its
// middle row (from the left) that touches the sticker, a few pixels in.
export async function edgeOf(sticker: Locator): Promise<{ x: number; y: number }> {
  const b = await settledBox(sticker);
  const y = b.y + b.height / 2;
  const x = await sticker.evaluate(
    (el, [left, right, row]) => {
      for (let px = left; px < right; px += 1) {
        const hit = document.elementFromPoint(px, row);
        if (hit && el.contains(hit)) return px + 3;
      }
      return (left + right) / 2;
    },
    [b.x, b.x + b.width, y],
  );
  return { x, y };
}

export async function carrySticker(
  page: Page,
  sticker: Locator,
  to: { readonly x: number; readonly y: number },
  options: { readonly turnsPage?: boolean; readonly drop?: { x: number; y: number } } = {},
): Promise<void> {
  const from = await edgeOf(sticker);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  if (options.turnsPage) {
    // held at the edge: as soon as the first leaf has gone over, away from the edge (held on, it
    // would turn the next one too), then wait for the curl to be put away and the book to settle,
    // as a finger would wait to see the new page
    await expect(page.locator('[data-leaf="0"][data-turned]')).toHaveCount(1, { timeout: 5000 });
    if (options.drop) await page.mouse.move(options.drop.x, options.drop.y, { steps: 4 });
    await expect(page.locator("[data-curling]")).toHaveCount(0);
    await page.waitForTimeout(600);
  } else if (options.drop) {
    await page.mouse.move(options.drop.x, options.drop.y, { steps: 8 });
  }
  await page.mouse.up();
}
