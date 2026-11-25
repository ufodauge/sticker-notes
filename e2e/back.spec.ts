import { expect, test } from "@playwright/test";
import { receive } from "./helpers.ts";

const SLIME = "X @sticker_fan2026";

test("the back of a received sticker says who gave it, and leads to that person", async ({
  page,
}) => {
  await receive(page, "slime", SLIME);
  await receive(page, "discord", "Discord @pixel.trader");
  await page.getByRole("button", { name: SLIME, exact: true }).click();
  await page.getByRole("button", { name: "裏を見る" }).click();
  const back = page.getByRole("dialog", { name: "シールの裏" });
  await expect(back).toContainText("sticker_fan2026");
  await back.getByRole("button", { name: "この人からのシール 1枚" }).click();
  const people = page.getByRole("dialog", { name: "もらった人" });
  await expect(people.getByRole("listitem")).toHaveCount(2);
  await expect(people.locator("[data-focus]")).toContainText("sticker_fan2026");
  await expect(people.getByRole("link", { name: SLIME })).toHaveAttribute(
    "href",
    "https://x.com/sticker_fan2026",
  );
});

test("the menu lists nobody before anything is received", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "メニュー" }).click();
  await page.getByRole("button", { name: "もらった人" }).click();
  await expect(page.getByRole("dialog", { name: "もらった人" })).toContainText(
    "まだだれからももらっていない",
  );
});
