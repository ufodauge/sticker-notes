import { expect, test } from "@playwright/test";
import { readQr, receiveToPocket } from "./helpers.ts";

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
  await expect(materials.getByRole("radio", { name: "キラ", exact: true })).toBeVisible();
  await expect(materials.getByRole("radio", { name: /^ぷっくり/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await receiveToPocket(page, "slime");
  await openMaker(page);
  await expect(
    materials.getByRole("radio", { name: "ぷっくり(新しく使えるようになった)" }),
  ).toBeVisible();
  await materials.getByRole("radio", { name: /^ぷっくり/ }).click();
  await expect(materials.getByRole("radio", { name: /^ぷっくり/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("button", { name: "シール帳に貼る" }).click();
  // made just after one came: it is given back to it first
  await expect(page.getByRole("dialog", { name: "交換用のQR" })).toContainText("にお返し");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const placed = page.getByRole("button", { name: "シール", exact: true });
  await expect(placed.locator('[data-material="puffy"]').first()).toBeAttached();
  await placed.click();
  await page.getByRole("button", { name: "交換用のQR", exact: true }).click();
  expect((await readQr(page))?.material).toEqual({ kind: "puffy", tone: 0 });
});
