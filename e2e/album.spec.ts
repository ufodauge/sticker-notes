import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { bigBackup } from "./backup-fixture.ts";
import { receive, savedPositions, settledBox, turnPage } from "./helpers.ts";

const SLIME = "X @sticker_fan2026";

test("drag persists; discard peels off and undo puts it back", async ({ page }) => {
  await receive(page, "slime", SLIME);
  const placed = page.getByRole("button", { name: SLIME, exact: true });
  const before = await settledBox(placed);
  const [saved] = await savedPositions(page);
  const cx = before.x + before.width / 2;
  const cy = before.y + before.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 40, cy + 60, { steps: 8 });
  await page.mouse.up();
  // the move is saved in the background; a reload right away would abort that write
  await expect.poll(async () => (await savedPositions(page))[0]?.x).not.toBe(saved?.x);
  await page.reload();
  const after = await settledBox(page.getByRole("button", { name: SLIME, exact: true }));
  expect(after?.x).toBeCloseTo(before.x + 40, -1);
  expect(after?.y).toBeCloseTo(before.y + 60, -1);

  await page.getByRole("button", { name: SLIME, exact: true }).click();
  await expect(page.getByRole("toolbar", { name: SLIME })).toBeVisible();
  await expect(page.getByRole("link", { name: "@sticker_fan2026" })).toHaveAttribute(
    "href",
    "https://x.com/sticker_fan2026",
  );
  await page.getByRole("button", { name: "捨てる" }).click();
  await expect(page.getByRole("button", { name: SLIME, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(page.getByRole("button", { name: SLIME, exact: true })).toBeVisible();
});

test("a full page adds the next page of the notebook", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "メニュー" }).click();
  await page.getByLabel("読み込む").setInputFiles({
    name: "b.json",
    mimeType: "application/json",
    buffer: Buffer.from(await bigBackup(13, 0)),
  });
  await expect(page.getByRole("status")).toContainText("13枚を読み込んだ");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-page]")).toHaveCount(2);
  await expect(page.getByText("1 / 2")).toBeVisible();
  await turnPage(page, 1);
  await expect(page.getByText("2 / 2")).toBeVisible();
  await turnPage(page, -1);
  await expect(page.getByText("1 / 2")).toBeVisible();
});

test("backup export → import into a fresh browser", async ({ page, browser }) => {
  await receive(page, "slime", SLIME);
  await receive(page, "noise", "Instagram @noise.maker_01");
  await page.getByRole("button", { name: "メニュー" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "バックアップ" }).click();
  const json = await readFile(await (await download).path(), "utf8");
  expect(JSON.parse(json)).toMatchObject({ format: "sticker-notes-backup", version: 1 });

  const fresh = await browser.newContext();
  const p2 = await fresh.newPage();
  await p2.goto("/");
  await p2.getByRole("button", { name: "メニュー" }).click();
  const file = { name: "backup.json", mimeType: "application/json", buffer: Buffer.from(json) };
  await p2.getByLabel("読み込む").setInputFiles(file);
  await expect(p2.getByRole("status")).toContainText("2枚を読み込んだ");
  await p2.getByLabel("読み込む").setInputFiles(file);
  await expect(p2.getByRole("status")).toContainText("0枚を読み込んだ");
  await fresh.close();
});
