import { expect, test, type Page } from "@playwright/test";
import { fragmentOf, receive } from "./helpers.ts";

const SLIME = "X @sticker_fan2026";

test("a link is stuck on the album right away and survives reload", async ({ page }) => {
  await receive(page, "slime", SLIME);
  await expect(page.getByRole("status")).toContainText("を貼った");
  await page.reload();
  await expect(page.getByRole("button", { name: SLIME, exact: true })).toBeVisible();
  await page.goto(`/${fragmentOf("slime")}`);
  await expect(page.getByRole("status")).toContainText("もう貼ってある");
  await expect(page.getByRole("button", { name: SLIME, exact: true })).toHaveCount(1);
});

test("undo removes a just-received sticker", async ({ page }) => {
  await receive(page, "slime", SLIME);
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(page.getByRole("button", { name: SLIME, exact: true })).toHaveCount(0);
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
  await expect(
    page.getByRole("button", { name: "Discord @pixel.trader", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Instagram @noise.maker_01", exact: true }),
  ).toBeVisible();
});

const createButton = (page: Page) =>
  page.getByRole("navigation").getByRole("button", { name: "画像からステッカーを作る" });
const invitation = (page: Page) => page.getByRole("button", { name: "自分のも作る" });

test("the first receive invites the visitor to make their own and stays until used", async ({
  page,
}) => {
  await receive(page, "slime", SLIME);
  await expect(invitation(page)).toBeVisible();
  await expect(createButton(page)).toHaveText("作る");
  await page.waitForTimeout(7000);
  await expect(page.getByRole("status")).toContainText("を貼った");
  await invitation(page).click();
  await expect(page.getByRole("dialog", { name: "ステッカーを作る" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("the persistent toast can be dismissed", async ({ page }) => {
  await receive(page, "slime", SLIME);
  await page.getByRole("button", { name: "案内を閉じる" }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("a later receive shows the usual short toast", async ({ page }) => {
  await receive(page, "slime", SLIME);
  await page.reload();
  await page.goto(`/${fragmentOf("noise")}`);
  await expect(page.getByRole("status")).toContainText("を貼った");
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
  await page.getByLabel("ID", { exact: true }).fill("mine_1");
  await page.getByRole("button", { name: "貼る" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(createButton(page)).toHaveText("");
  await page.goto(`/${fragmentOf("slime")}`);
  await expect(page.getByRole("status")).toContainText("を貼った");
  await expect(invitation(page)).toHaveCount(0);
});

test("the labelled create button and the persistent toast fit 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await receive(page, "slime", SLIME);
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
