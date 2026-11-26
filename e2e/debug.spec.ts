import { expect, test } from "@playwright/test";

test("?debug shows the debug menu, which can open every material", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "デバッグ", exact: true })).toHaveCount(0);
  await page.goto("/?debug");
  await page.getByRole("button", { name: "デバッグ", exact: true }).click();
  await page.getByRole("switch", { name: "素材をすべて使えるようにする" }).check();
  await page.keyboard.press("Escape");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "画像からステッカーを作る" })
    .click();
  await page.locator('input[type="file"]').setInputFiles("test/fixtures/sample.png");
  await expect(page.getByRole("radio", { name: /^箔/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/");
  await page.getByRole("button", { name: "デバッグ", exact: true }).click();
  await page.getByRole("button", { name: "デバッグをやめる" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "デバッグ", exact: true })).toHaveCount(0);
});
