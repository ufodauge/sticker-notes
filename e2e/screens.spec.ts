import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fragmentOf, stickAllFromPocket } from "./helpers.ts";

test.skip(!process.env.SCREENS, "visual review only");

for (const scheme of ["light", "dark"] as const) {
  test(`screens ${scheme}`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    const shot = (name: string) =>
      page.screenshot({ path: `test-results/screens/${info.project.name}-${scheme}-${name}.png` });

    await page.goto("/");
    await expect(page.getByRole("button", { name: "メニュー" })).toBeVisible();
    await expect(page.locator("[data-page]")).toHaveCount(1);
    await shot("01-empty");

    await page.getByRole("button", { name: "画像からステッカーを作る" }).first().click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "sample.png",
      mimeType: "image/png",
      buffer: readFileSync("test/fixtures/sample.png"),
    });
    await page.getByLabel("ID", { exact: true }).fill("sample_user");
    await page.waitForTimeout(300);
    await shot("02-create-edit");
    await page.getByRole("button", { name: "ポケットに入れる" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    for (const n of ["slime", "discord", "noise", "allTransparent", "longestId"]) {
      await page.goto(`/${fragmentOf(n)}`);
      await expect.poll(() => new URL(page.url()).hash).toBe("");
    }
    await stickAllFromPocket(page);
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "X @sticker_fan2026", exact: true }).click();
    await shot("03-selected");

    await page.getByRole("button", { name: "X @sample_user", exact: true }).click();
    await page.getByRole("button", { name: "QRを出す", exact: true }).click();
    await page.waitForTimeout(400);
    await shot("04-qr");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "メニュー" }).click();
    await page.getByText("パレット", { exact: true }).click();
    await page.waitForTimeout(400);
    await shot("05-menu");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "印刷" }).click();
    await page.getByTitle("カットライン").click();
    await page.waitForTimeout(300);
    await shot("06-print-album");
    await page.getByRole("radio", { name: "ならべる" }).click();
    await page.getByRole("button", { name: "X @sticker_fan2026 を増やす" }).click();
    await page.getByRole("button", { name: "X @sample_user を増やす" }).click();
    await page.waitForTimeout(300);
    await shot("07-print-grid");
  });
}
