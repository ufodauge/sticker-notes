import { expect, test } from "@playwright/test";
import { receive } from "./helpers.ts";

test("print: copies, SVG preview, one A4 page", async ({ page, browserName }) => {
  await receive(page, "slime", "X @sticker_fan2026");
  await page.getByRole("button", { name: "印刷" }).click();
  await page.getByRole("radio", { name: "ならべる" }).click();
  const more = page.getByRole("button", { name: "X @sticker_fan2026 を増やす" });
  for (let i = 0; i < 4; i++) await more.click();
  const sheet = page.getByRole("img", { name: "印刷シート 1" });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("use")).toHaveCount(4);
  await page.getByTitle("カットライン").click();
  await expect(sheet.locator("use")).toHaveCount(8);
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "印刷", exact: true }),
  ).toBeEnabled();

  test.skip(browserName !== "chromium", "page.pdf is Chromium-only");
  await page.emulateMedia({ media: "print" });
  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString("latin1");
  expect(pdf.match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
  const box = /\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/.exec(pdf);
  expect(Number(box?.[1])).toBeCloseTo(595.3, -1);
  expect(Number(box?.[2])).toBeCloseTo(841.9, -1);
});
