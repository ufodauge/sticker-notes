import { expect, test } from "@playwright/test";
import { readQr, receiveToPocket, stickFromPocket } from "./helpers.ts";

async function openMaker(page: import("@playwright/test").Page) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "画像からステッカーを作る" })
    .click();
  await page.locator('input[type="file"]').setInputFiles("test/fixtures/sample.png");
  await expect(page.getByRole("img", { name: "作成中のステッカー" })).toBeVisible();
}

test("materials open up as one exchanges with people, and travel in the QR", async ({ page }) => {
  await page.goto("/");
  await openMaker(page);
  const materials = page.getByRole("radiogroup", { name: "素材" });
  await expect(materials.getByRole("radio", { name: "キラ", exact: true })).toBeEnabled();
  await expect(
    materials.getByRole("radio", { name: "ぷっくり: あと1人と交換すると使える" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await receiveToPocket(page, "slime");
  await openMaker(page);
  await materials.getByRole("radio", { name: "ぷっくり", exact: true }).click();
  await expect(materials.getByRole("radio", { name: "ぷっくり", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByLabel("ID", { exact: true }).fill("puffy_maker");
  await page.getByRole("button", { name: "ポケットに入れる" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await stickFromPocket(page, "X @puffy_maker");
  const placed = page.getByRole("button", { name: "X @puffy_maker", exact: true });
  await expect(placed.locator('[data-material="puffy"]').first()).toBeAttached();
  await placed.click();
  await page.getByRole("button", { name: "QRを出す", exact: true }).click();
  expect((await readQr(page))?.material).toEqual({ kind: "puffy", tone: 0 });
});
