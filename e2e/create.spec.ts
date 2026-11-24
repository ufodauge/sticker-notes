import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { PALETTES } from "../src/core/palette.ts";
import { importPixelArt } from "../src/core/pixelart.ts";
import { rankPalettes } from "../src/core/quantize.ts";
import { decodeFragment } from "../src/core/payload.ts";
import { renderRgba } from "../src/core/render.ts";
import { FIXTURES } from "../src/core/testing/fixtures.ts";
import { readQr } from "./helpers.ts";
import { decodeRgba, encodeRgba } from "../test/png.ts";

function slimePng(scale: number): Buffer {
  const s = FIXTURES.slime;
  const p = s && PALETTES[s.paletteId];
  if (!s || !p) throw new Error("fixture");
  const side = 32 * scale;
  const rgba = new Uint8Array(side * side * 4);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const k = s.pixels[Math.floor(y / scale) * 32 + Math.floor(x / scale)] ?? 0;
      const [r, g, b] = p.rgb[k] ?? [0, 0, 0];
      rgba.set([r, g, b, k === s.transparentIndex ? 0 : 255], (y * side + x) * 4);
    }
  return Buffer.from(encodeRgba(side, side, rgba));
}

function photoPng(): Buffer {
  const side = 64;
  const rgba = new Uint8Array(side * side * 4);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++)
      rgba.set([x * 4, 40 + y * 2, 200 - x * 2, 255], (y * side + x) * 4);
  return Buffer.from(encodeRgba(side, side, rgba));
}

const previewPixels = (page: Page) =>
  page.getByRole("img", { name: "作成中のステッカー" }).evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const data = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
    return Array.from(data ?? []);
  });

async function openMaker(page: Page, name: string, buffer: Buffer) {
  await page.goto("/");
  await page.getByRole("button", { name: "画像からステッカーを作る" }).first().click();
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "image/png", buffer });
  await expect(page.getByRole("img", { name: "作成中のステッカー" })).toBeVisible();
}

async function openOwnQr(page: Page, label: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("button", { name: "QRを出す", exact: true }).click();
}

async function save(page: Page, id: string) {
  await page.getByLabel("ID", { exact: true }).fill(id);
  await page.getByRole("button", { name: "貼る" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("palette art lands on the album and its QR round-trips", async ({ page }) => {
  await openMaker(page, "slime.png", slimePng(1));
  await save(page, "sticker_fan2026");
  const placed = page.getByRole("button", { name: "X @sticker_fan2026", exact: true });
  await expect(placed).toBeVisible();
  await placed.click();
  await page.getByRole("button", { name: "QRを出す", exact: true }).click();
  expect(await readQr(page)).toEqual(FIXTURES.slime);
});

test("upscaled pixel art is restored dot for dot, without the cropper", async ({ page }) => {
  await openMaker(page, "slime8.png", slimePng(8));
  await expect(page.locator(".reactEasyCrop_Container")).toHaveCount(0);
  await save(page, "sticker_fan2026");
  await openOwnQr(page, "X @sticker_fan2026");
  expect(await readQr(page)).toEqual(FIXTURES.slime);
});

test("sample.png keeps its dots and its distinct colours", async ({ page }) => {
  const buffer = readFileSync("test/fixtures/sample.png");
  await openMaker(page, "sample.png", buffer);
  await save(page, "sample_user");
  await openOwnQr(page, "X @sample_user");
  const got = await readQr(page);
  const fit = importPixelArt(decodeRgba(buffer));
  const best = fit && rankPalettes(fit.image)[0];
  expect(got?.paletteId).toBe(best?.paletteId);
  expect(got?.pixels).toEqual(best?.result.indices);
  const used = new Set(Array.from(got?.pixels ?? []).filter((p) => p !== got?.transparentIndex));
  expect(used.size).toBe(5);
});

test("the dither toggle changes the preview and the saved sticker round-trips", async ({
  page,
}) => {
  await openMaker(page, "photo.png", photoPng());
  const toggle = page.getByRole("button", { name: "網点でなめらかに" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  const plain = await previewPixels(page);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => previewPixels(page)).not.toEqual(plain);
  const dithered = await previewPixels(page);
  await save(page, "dither_fan2026");
  await openOwnQr(page, "X @dither_fan2026");
  const got = await readQr(page);
  expect(got && Array.from(renderRgba(got).rgba)).toEqual(dithered);
});

test("the dither toggle is absent for pixel art", async ({ page }) => {
  await openMaker(page, "slime.png", slimePng(1));
  await expect(page.getByRole("button", { name: "網点でなめらかに" })).toHaveCount(0);
});

test("an invalid ID keeps the dialog open and marks the field", async ({ page }) => {
  await openMaker(page, "slime.png", slimePng(1));
  await page.getByLabel("ID", { exact: true }).fill("bad id!");
  await page.getByRole("button", { name: "貼る" }).click();
  await expect(page.getByLabel("ID", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("the QR dialog hands out the same sticker as a link", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "clipboard permissions are Chromium-only in Playwright");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { value: undefined }));
  await openMaker(page, "slime.png", slimePng(1));
  await save(page, "sticker_fan2026");
  await openOwnQr(page, "X @sticker_fan2026");
  await page.getByRole("button", { name: "リンクをコピー" }).click();
  await expect(page.getByRole("button", { name: "コピーした" })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  const r = decodeFragment(new URL(link).hash);
  expect(r.ok && r.sticker).toEqual(FIXTURES.slime);
});

test("dropping an image on the album starts the same flow as picking one", async ({ page }) => {
  await page.goto("/");
  const buffer = slimePng(1);
  const data = await page.evaluateHandle(
    (bytes) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], "drop.png", { type: "image/png" }));
      return dt;
    },
    [...buffer],
  );
  await page.locator("main").dispatchEvent("dragover", { dataTransfer: data });
  await page.locator("main").dispatchEvent("drop", { dataTransfer: data });
  await expect(page.getByRole("img", { name: "作成中のステッカー" })).toBeVisible();
});
