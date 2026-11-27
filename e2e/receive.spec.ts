import { readFileSync } from "node:fs";
import { decodeRgba, encodeRgba } from "../test/png.ts";
import { expect, test, type Page } from "@playwright/test";
import { fragmentOf, pocketButton, readQr, receiveToPocket, savedPositions } from "./helpers.ts";

const SLIME = "X @sticker_fan2026";

test("a link drops into the pocket, survives reload, and is stuck from there", async ({ page }) => {
  await receiveToPocket(page, "slime");
  await expect(page.getByRole("status")).toContainText("から");
  await expect(pocketButton(page)).toHaveAccessibleName("ポケット(1枚)");
  await expect(page.getByRole("button", { name: SLIME, exact: true })).toHaveCount(0);
  await page.reload();
  await expect(pocketButton(page)).toHaveAccessibleName("ポケット(1枚)");
  await page.goto(`/${fragmentOf("slime")}`);
  await expect(page.getByRole("status")).toContainText("もう持ってる");
  await expect(pocketButton(page)).toHaveAccessibleName("ポケット(1枚)");
  await pocketButton(page).click();
  await page.getByRole("button", { name: `${SLIME} を手に取る` }).click();
  await expect(page.getByRole("dialog")).toContainText("2026");
  await page.getByRole("button", { name: "はがしてページに貼る" }).click();
  await expect(page.getByRole("button", { name: SLIME, exact: true })).toHaveCount(1);
  await expect(pocketButton(page)).toHaveAccessibleName("ポケット(0枚)");
  await expect.poll(async () => (await savedPositions(page)).length).toBe(1);
  await page.reload();
  await expect(page.getByRole("button", { name: SLIME, exact: true })).toBeVisible();
});

test("a sticker received is a gift: nothing to undo", async ({ page }) => {
  await receiveToPocket(page, "slime");
  await expect(page.getByRole("status")).toContainText("から");
  await expect(page.getByRole("button", { name: "元に戻す" })).toHaveCount(0);
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
  await expect(pocketButton(page)).toHaveAccessibleName("ポケット(2枚)");
});

const createButton = (page: Page) =>
  page.getByRole("navigation").getByRole("button", { name: "画像からステッカーを作る" });

test("a sticker received: the note says from whom, and the create button beats to make one back", async ({
  page,
}) => {
  await receiveToPocket(page, "slime");
  await expect(page.getByRole("status")).toHaveText("@sticker_fan2026 から");
  // one thing to do next, and only one: no button on the note, no dots
  await expect(page.getByRole("status").getByRole("button")).toHaveCount(0);
  await expect(createButton(page)).toHaveAttribute("data-beat", "true");
  // the note goes by itself
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 9000 });
});

// sample.png, or the same picture turned upside down (another sticker)
function samplePng(upsideDown: boolean): Buffer {
  const buffer = readFileSync("test/fixtures/sample.png");
  if (!upsideDown) return buffer;
  const { width, height, data } = decodeRgba(buffer);
  const flipped = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) {
    flipped.set(data.subarray(y * width * 4, (y + 1) * width * 4), (height - 1 - y) * width * 4);
  }
  return Buffer.from(encodeRgba(width, height, flipped));
}

async function makeOwn(page: Page, upsideDown: boolean): Promise<void> {
  await createButton(page).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "sample.png", mimeType: "image/png", buffer: samplePng(upsideDown) });
  await expect(page.getByRole("img", { name: "作成中のステッカー" })).toBeVisible();
  await page.getByRole("button", { name: "シール帳に貼る" }).click();
}

test("one made just after a sticker came is given back to it, and one's own can be chosen instead", async ({
  page,
}) => {
  await page.goto("/");
  await makeOwn(page, false);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto(`/${fragmentOf("slime")}`);
  await expect(createButton(page)).toHaveAttribute("data-beat", "true");
  await makeOwn(page, true);
  const dialog = page.getByRole("dialog", { name: "交換用のQR" });
  await expect(dialog).toContainText(`${SLIME} にお返し`);
  // the one just made comes first; the others can be chosen instead
  const choices = dialog.getByRole("group", { name: "QRにするステッカー" }).getByRole("button");
  await expect(choices).toHaveCount(2);
  await expect(choices.and(page.locator('[aria-pressed="true"]'))).toHaveCount(1);
  const last = await readQr(page);
  await choices.and(page.locator('[aria-pressed="false"]')).click();
  await expect.poll(async () => (await readQr(page))?.pixels).not.toEqual(last?.pixels);
  await dialog.getByRole("button", { name: /のSNS$/ }).click();
  await dialog.getByLabel("ID", { exact: true }).fill("mine_1");
  expect((await readQr(page))?.snsId).toBe("mine_1");
  // given back: the create button is still again
  await page.keyboard.press("Escape");
  await expect(createButton(page)).not.toHaveAttribute("data-beat");
});

test("the debug menu tries an exchange: someone's sticker arrives as by a link", async ({
  page,
}) => {
  await page.goto("/?debug");
  await page.getByRole("button", { name: "デバッグ" }).click();
  await page.getByRole("button", { name: "交換をためす" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("から");
  await expect(pocketButton(page)).toHaveAccessibleName("ポケット(1枚)");
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  await page.getByRole("button", { name: "デバッグ" }).click();
  await page.getByRole("button", { name: "交換をためす" }).click();
  await expect(pocketButton(page)).toHaveAccessibleName("ポケット(2枚)");
});

test("someone new is met with a stamp: the nth person met", async ({ page }) => {
  await receiveToPocket(page, "slime");
  await expect(page.locator('[class*="stamp"]').first()).toHaveText("1人目");
  await page.goto(`/${fragmentOf("discord")}`);
  await expect(page.locator('[class*="stamp"]').first()).toHaveText("2人目");
  await page.goto(`/${fragmentOf("noise")}`);
  await expect(page.locator('[class*="stamp"]').first()).toHaveText("3人目");
});
