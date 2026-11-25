import { expect, test } from "@playwright/test";
import { pocketBackup } from "./backup-fixture.ts";
import { pocketButton, receiveToPocket, savedPositions } from "./helpers.ts";

const SLIME = "X @sticker_fan2026";

test("peeling a sticker off its backing and dropping it on the page sticks it there", async ({
  page,
}) => {
  await receiveToPocket(page, "slime");
  await pocketButton(page).click();
  await page.getByRole("button", { name: `${SLIME} を手に取る` }).click();
  const art = page.locator("[data-peel]");
  const from = await art.boundingBox();
  const paper = await page.locator("[data-paper]").first().boundingBox();
  if (!from || !paper) throw new Error("no box");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2 - 30, {
    steps: 4,
  });
  const to = { x: paper.x + paper.width * 0.3, y: paper.y + paper.height * 0.25 };
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await expect(page.locator("dialog[data-carrying]")).toHaveCount(1);
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const placed = page.getByRole("button", { name: SLIME, exact: true });
  await expect(placed).toBeVisible();
  await expect(placed.locator("[data-effect]")).toHaveAttribute("data-effect", "lifted");
  const [saved] = await savedPositions(page);
  expect(saved?.x).toBeCloseTo(0.3, 1);
  expect(saved?.y).toBeCloseTo(0.25, 1);

  await placed.click();
  await expect(placed.locator("[data-effect]")).toHaveAttribute("data-effect", "pressed");
  await expect(pocketButton(page)).toHaveCount(0);
});

test("let go away from the album, the peeled sticker goes back into the hand", async ({ page }) => {
  await receiveToPocket(page, "slime");
  await pocketButton(page).click();
  await page.getByRole("button", { name: `${SLIME} を手に取る` }).click();
  const art = page.locator("[data-peel]");
  const from = await art.boundingBox();
  if (!from) throw new Error("no box");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 90, { steps: 6 });
  await page.mouse.move(2, 2, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator("dialog[data-carrying]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "はがしてページに貼る" })).toBeVisible();
  await page.getByRole("button", { name: "ポケットに戻す" }).click();
  await expect(page.getByRole("button", { name: `${SLIME} を手に取る` })).toBeVisible();
});

test("stickers without a place in a backup come back into the pocket", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "メニュー" }).click();
  await page.getByLabel("読み込む").setInputFiles({
    name: "b.json",
    mimeType: "application/json",
    buffer: Buffer.from(await pocketBackup(5)),
  });
  await expect(page.getByRole("status")).toContainText("5枚を読み込んだ");
  await page.keyboard.press("Escape");
  await expect(pocketButton(page)).toHaveAccessibleName("ポケット(5枚)");
  await pocketButton(page).click();
  await expect(page.getByRole("button", { name: / を手に取る$/ })).toHaveCount(5);
});
