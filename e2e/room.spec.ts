/// <reference lib="dom" />
import { expect, test, type Page } from "@playwright/test";
import { receive, receiveToPocket } from "./helpers.ts";

// The three-dimensional desk (debug builds, `?room`): its album, drawer and pocket are the real
// ones. Things in the scene are tapped where the scene says they are on the screen.

const SLIME = "X @sticker_fan2026";

type Thing = "album" | "spine" | "drawer" | "drawer-inside" | "pocket";
type Handle = {
  readonly where: (t: Thing) => { x: number; y: number } | null;
  readonly drawerOpen: () => boolean;
};

const where = (page: Page, thing: Thing) =>
  page.evaluate((t) => (window as unknown as { __room?: Handle }).__room?.where(t) ?? null, thing);

async function tap(page: Page, thing: Thing): Promise<void> {
  await expect.poll(() => where(page, thing), { timeout: 15_000 }).not.toBeNull();
  const at = await where(page, thing);
  if (!at) throw new Error(`no ${thing}`);
  await page.mouse.click(at.x, at.y);
}

async function openRoom(page: Page): Promise<void> {
  await page.goto("/?room");
  await expect(page.locator("canvas[data-engine]")).toBeVisible();
  await expect(page.locator("[data-room-ready]")).toHaveCount(1);
  await expect.poll(() => where(page, "pocket"), { timeout: 15_000 }).not.toBeNull();
  // the first frames drawn, the store read
  await page.waitForTimeout(500);
}

test("the pocket on the desk opens the pocket", async ({ page }) => {
  await receiveToPocket(page, "slime");
  await openRoom(page);
  await tap(page, "pocket");
  await expect(page.getByRole("dialog", { name: "ポケット" })).toBeVisible();
  await expect(page.getByRole("button", { name: `${SLIME} を手に取る` })).toBeVisible();
});

test("the drawer slides out, and a tap into it opens the drawer", async ({ page }) => {
  await receive(page, "slime", SLIME);
  await page.getByRole("button", { name: SLIME, exact: true }).click();
  await page.getByRole("button", { name: "捨てる" }).click();
  await expect(page.getByRole("button", { name: "引き出し(1枚)" })).toBeVisible();
  await openRoom(page);
  await tap(page, "drawer");
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __room?: Handle }).__room?.drawerOpen()),
    )
    .toBe(true);
  await tap(page, "drawer-inside");
  await expect(page.getByRole("dialog", { name: "引き出し" })).toBeVisible();
  await page.getByRole("button", { name: `${SLIME} を取り出す` }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // pushed back in
  await tap(page, "drawer");
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __room?: Handle }).__room?.drawerOpen()),
    )
    .toBe(false);
});

test("the album, tapped, is come close to and worked on; a tap beside it goes back", async ({
  page,
}) => {
  await receive(page, "slime", SLIME);
  await openRoom(page);
  await tap(page, "album");
  await expect(page.locator('[data-room-zoom="close"]')).toHaveCount(1, { timeout: 10_000 });
  const placed = page.getByRole("button", { name: SLIME, exact: true });
  await expect(placed).toBeVisible();
  // the real album: a sticker selected there can be thrown into the drawer
  await placed.click();
  await page.getByRole("button", { name: "捨てる" }).click();
  await expect(placed).toHaveCount(0);
  // beside the book, back to the desk
  await page.mouse.click(8, 8);
  await expect(page.locator('[data-room-zoom="desk"]')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator("[data-album]")).toHaveCount(0);
  // the drawer now holds it
  await tap(page, "drawer");
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __room?: Handle }).__room?.drawerOpen()),
    )
    .toBe(true);
  await tap(page, "drawer-inside");
  await expect(page.getByRole("button", { name: `${SLIME} を取り出す` })).toBeVisible();
});
