import { readFileSync } from "node:fs";
import { decodeRgba, encodeRgba } from "../test/png.ts";
import { expect, test, type Page } from "@playwright/test";
import { fragmentOf, pocketButton, readQr, receiveToPocket, savedPositions } from "./helpers.ts";

const SLIME = "X @sticker_fan2026";

test("a link drops into the pocket, survives reload, and is stuck from there", async ({ page }) => {
  await receiveToPocket(page, "slime");
  await expect(page.getByRole("status")).toContainText("がポケットに入った");
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

test("undo takes a just-received sticker back out of the pocket", async ({ page }) => {
  await receiveToPocket(page, "slime");
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(pocketButton(page)).toHaveCount(0);
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
const invitation = (page: Page) => page.getByRole("button", { name: "自分のも作る" });

test("the first receive invites the visitor to make their own and stays until used", async ({
  page,
}) => {
  await receiveToPocket(page, "slime");
  await expect(invitation(page)).toBeVisible();
  await expect(createButton(page)).toHaveText("作る");
  await page.waitForTimeout(7000);
  await expect(page.getByRole("status")).toContainText("がポケットに入った");
  await invitation(page).click();
  await expect(page.getByRole("dialog", { name: "ステッカーを作る" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("the persistent toast can be dismissed", async ({ page }) => {
  await receiveToPocket(page, "slime");
  await page.getByRole("button", { name: "案内を閉じる" }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("a later receive shows the usual short toast", async ({ page }) => {
  await receiveToPocket(page, "slime");
  // the invitation is saved as shown just before it appears
  await expect(page.getByRole("button", { name: "案内を閉じる" })).toBeVisible();
  await page.reload();
  await page.goto(`/${fragmentOf("noise")}`);
  await expect(page.getByRole("status")).toContainText("がポケットに入った");
  await expect(page.getByRole("button", { name: "案内を閉じる" })).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 9000 });
});

test("with an own sticker there is no invitation and the create button is icon-only", async ({
  page,
}) => {
  await page.goto("/");
  await createButton(page).click();
  await page.locator('input[type="file"]').setInputFiles("test/fixtures/sample.png");
  await expect(page.getByRole("img", { name: "作成中のステッカー" })).toBeVisible();
  await page.getByRole("button", { name: "ポケットに入れる" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(createButton(page)).toHaveText("");
  await page.goto(`/${fragmentOf("slime")}`);
  await expect(page.getByRole("status")).toContainText("がポケットに入った");
  await expect(invitation(page)).toHaveCount(0);
});

test("the labelled create button and the persistent toast fit 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await receiveToPocket(page, "slime");
  const nav = await page.getByRole("navigation").boundingBox();
  const button = await createButton(page).boundingBox();
  const toast = await page.getByRole("status").boundingBox();
  expect(button && nav && button.x >= nav.x && button.x + button.width <= nav.x + nav.width).toBe(
    true,
  );
  const dismiss = await page.getByRole("button", { name: "案内を閉じる" }).boundingBox();
  expect(toast && toast.x >= 0 && toast.x + toast.width <= 320).toBe(true);
  expect(
    toast && dismiss && dismiss.x >= toast.x && dismiss.x + dismiss.width <= toast.x + toast.width,
  ).toBe(true);
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
  await page.getByRole("button", { name: "ポケットに入れる" }).click();
}

test("a sticker received gets one given back: the toast opens one's own QR for them", async ({
  page,
}) => {
  await page.goto("/");
  await makeOwn(page, false);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await makeOwn(page, true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto(`/${fragmentOf("slime")}`);
  await page.getByRole("button", { name: "お返しのQR" }).click();
  const dialog = page.getByRole("dialog", { name: "交換用のQR" });
  await expect(dialog).toContainText(`${SLIME} にお返し`);
  // the one made last comes first; the others can be chosen instead
  const choices = dialog.getByRole("group", { name: "QRにするステッカー" }).getByRole("button");
  await expect(choices).toHaveCount(2);
  await expect(choices.and(page.locator('[aria-pressed="true"]'))).toHaveCount(1);
  const last = await readQr(page);
  const other = choices.and(page.locator('[aria-pressed="false"]'));
  await other.click();
  await expect(choices.and(page.locator('[aria-pressed="true"]'))).toHaveCount(1);
  await expect.poll(async () => (await readQr(page))?.pixels).not.toEqual(last?.pixels);
});

test("with none of one's own yet, the one made from the invitation is given back at once", async ({
  page,
}) => {
  await receiveToPocket(page, "slime");
  await invitation(page).click();
  await page.locator('input[type="file"]').setInputFiles("test/fixtures/sample.png");
  await expect(page.getByRole("img", { name: "作成中のステッカー" })).toBeVisible();
  await page.getByRole("button", { name: "ポケットに入れる" }).click();
  const dialog = page.getByRole("dialog", { name: "交換用のQR" });
  await expect(dialog).toContainText(`${SLIME} にお返し`);
  await dialog.getByLabel("ID", { exact: true }).fill("mine_1");
  expect((await readQr(page))?.snsId).toBe("mine_1");
});

test("the debug menu tries an exchange: someone's sticker arrives as by a link", async ({
  page,
}) => {
  await page.goto("/?debug");
  await page.getByRole("button", { name: "デバッグ" }).click();
  await page.getByRole("button", { name: "交換をためす" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("がポケットに入った");
  await expect(pocketButton(page)).toHaveAccessibleName("ポケット(1枚)");
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  await page.getByRole("button", { name: "デバッグ" }).click();
  await page.getByRole("button", { name: "交換をためす" }).click();
  await expect(pocketButton(page)).toHaveAccessibleName("ポケット(2枚)");
});

test("someone new is met with a stamp: the nth person met", async ({ page }) => {
  await receiveToPocket(page, "slime");
  await expect(page.getByRole("status")).toContainText("・1人目");
  await page.goto(`/${fragmentOf("discord")}`);
  await expect(page.getByRole("status")).toContainText("・2人目");
  await expect(page.locator('[class*="stamp"]').first()).toHaveText("2人目");
  await page.goto(`/${fragmentOf("noise")}`);
  await expect(page.getByRole("status")).toContainText("・3人目");
});
