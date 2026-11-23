import { expect, test } from "@playwright/test";
import { fragmentOf, receive } from "./helpers.ts";

const SLIME = "X @sticker_fan2026";

test("a link is stuck on the album right away and survives reload", async ({ page }) => {
  await receive(page, "slime", SLIME);
  await expect(page.getByRole("status")).toContainText("を貼った");
  await page.reload();
  await expect(page.getByRole("button", { name: SLIME, exact: true })).toBeVisible();
  await page.goto(`/${fragmentOf("slime")}`);
  await expect(page.getByRole("status")).toContainText("もう貼ってある");
  await expect(page.getByRole("button", { name: SLIME, exact: true })).toHaveCount(1);
});

test("undo removes a just-received sticker", async ({ page }) => {
  await receive(page, "slime", SLIME);
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(page.getByRole("button", { name: SLIME, exact: true })).toHaveCount(0);
});

test("an invalid link says so and leaves nothing behind", async ({ page }) => {
  await page.goto("/#v1.ZZZ");
  await expect(page.getByRole("status")).toHaveText("読み込めないステッカー");
  await expect.poll(() => new URL(page.url()).hash).toBe("");
});

test("a second link arriving during the first is not lost", async ({ page }) => {
  await page.goto(`/${fragmentOf("noise")}`);
  await expect(page.getByRole("button", { name: "メニュー" })).toBeVisible();
  await page.goto(`/${fragmentOf("discord")}`);
  await expect(
    page.getByRole("button", { name: "Discord @pixel.trader", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Instagram @noise.maker_01", exact: true }),
  ).toBeVisible();
});
