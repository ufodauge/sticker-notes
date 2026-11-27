import { readFileSync } from "node:fs";
import { expect, test, type Locator } from "@playwright/test";
import { decodeRgba } from "../test/png.ts";
import { decodeQrText, readQrUrl, receive } from "./helpers.ts";

const RASTER_WIDTH_PX = 3000;

async function rasterise(sheet: Locator): Promise<Buffer> {
  const dataUrl = await sheet.evaluate(async (svg, width) => {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const defs = svg.parentElement?.querySelector("defs");
    if (defs) clone.prepend(defs.cloneNode(true));
    const markup = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.src = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.round((width * 297) / 210);
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  }, RASTER_WIDTH_PX);
  return Buffer.from(dataUrl.split(",")[1] ?? "", "base64");
}

test("print: copies, SVG preview, one A4 page", async ({ page, browserName }) => {
  await receive(page, "slime", "X @sticker_fan2026");
  await page.getByRole("button", { name: "印刷" }).click();
  await page.getByRole("radio", { name: "一覧" }).click();
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

test("print: own QR block sits on the sheet and decodes to the QR dialog URL", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "画像からステッカーを作る" }).first().click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "sample.png",
    mimeType: "image/png",
    buffer: readFileSync("test/fixtures/sample.png"),
  });
  await page.getByRole("button", { name: "シール帳に貼る" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "シール", exact: true }).click();
  await page.getByRole("button", { name: "交換用のQR", exact: true }).click();
  const dialogUrl = await readQrUrl(page);
  await page.getByRole("button", { name: "閉じる" }).click();
  await expect(page.locator("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "印刷" }).click();
  await page.getByRole("radio", { name: "一覧" }).click();
  const sheet = page.getByRole("img", { name: "印刷シート 1" });
  await expect(sheet.locator("use")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "自分のQR" }).check();
  await page.getByLabel("QRの大きさ").selectOption("50");
  await expect(sheet.locator("use")).toHaveCount(1);
  await expect(page.getByText("mm/モジュール")).toBeVisible();

  const decoded = decodeQrText(decodeRgba(await rasterise(sheet)));
  expect(dialogUrl).toBeDefined();
  expect(decoded).toBe(dialogUrl);
});
