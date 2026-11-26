/// <reference lib="dom" />
import { expect, test } from "@playwright/test";
import {
  carrySticker,
  receive,
  receiveToPocket,
  savedPositions,
  settledBox,
  stickFromPocket,
  turnPage,
} from "./helpers.ts";

const SLIME = "X @sticker_fan2026";

test("the page indicator follows the album and jumps on tap", async ({ page }) => {
  await receive(page, "slime", SLIME);
  await turnPage(page, 1);
  await receiveToPocket(page, "discord");
  await stickFromPocket(page, "Discord @pixel.trader");
  await expect(page.getByText("2 / 2")).toBeVisible();
  const track = page.getByRole("button", { name: "ページへ移る" });
  const box = await track.boundingBox();
  if (!box) throw new Error("no track");
  await page.mouse.click(box.x + 2, box.y + box.height / 2);
  await expect(page.getByText("1 / 2")).toBeVisible();
});

test("the handle of a sticker at the top edge of the paper is still visible and usable", async ({
  page,
}) => {
  await receive(page, "slime", SLIME);
  const sticker = page.getByRole("button", { name: SLIME, exact: true });
  const paper = await page.locator("[data-facing] [data-paper]").first().boundingBox();
  if (!paper) throw new Error("no paper");
  const before = (await savedPositions(page))[0];
  await carrySticker(page, sticker, { x: paper.x + paper.width / 2, y: paper.y + 2 });
  await expect.poll(async () => (await savedPositions(page))[0]?.y).not.toBe(before?.y);
  const b = await settledBox(sticker);
  await sticker.click({ position: { x: b.width / 2, y: b.height * 0.75 } });
  const handle = page.getByRole("button", { name: "回転と大きさ(ドラッグ)" });
  await expect(handle).toBeInViewport();
  const h = await settledBox(handle);
  const top = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label"),
    [h.x + h.width / 2, h.y + h.height / 2],
  );
  expect(top).toBe("回転と大きさ(ドラッグ)");
});

test("palette files are saved from the … menu", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "メニュー" }).click();
  await page.getByText("パレット", { exact: true }).click();
  await page.getByRole("button", { name: "PICO-8 を保存" }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveCount(2);
  const gpl = page.waitForEvent("download");
  await menu.getByRole("menuitem", { name: /\.gpl/ }).click();
  expect((await gpl).suggestedFilename()).toBe("sticker-palette-00-pico-8.gpl");
  await expect(menu).toBeHidden();
  await page.getByRole("button", { name: "PICO-8 を保存" }).click();
  const png = page.waitForEvent("download");
  await page.getByRole("menu").getByRole("menuitem", { name: /PNG/ }).click();
  expect((await png).suggestedFilename()).toBe("sticker-palette-00-pico-8.png");
});

test("the album paper stays white in dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await receive(page, "slime", SLIME);
  const bg = await page
    .locator("[data-paper]")
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe("rgb(255, 255, 255)");
  const body = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(body).not.toBe("rgb(255, 255, 255)");
});

test("on a phone the actions sit at the bottom", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "操作" });
  const box = await nav.boundingBox();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(800 - 4);
  await page.setViewportSize({ width: 1100, height: 800 });
  const wide = await nav.boundingBox();
  expect(wide?.y ?? 999).toBeLessThan(40);
});
