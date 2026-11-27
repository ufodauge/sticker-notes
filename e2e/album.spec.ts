import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { bigBackup } from "./backup-fixture.ts";
import { edgeOf, receive, savedPositions, settledBox, turnPage } from "./helpers.ts";

const SLIME = "X @sticker_fan2026";

test("drag persists; discard peels off and undo puts it back", async ({ page }) => {
  await receive(page, "slime", SLIME);
  const placed = page.getByRole("button", { name: SLIME, exact: true });
  const before = await settledBox(placed);
  const [saved] = await savedPositions(page);
  const edge = await edgeOf(placed);
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await page.mouse.move(edge.x + 100, edge.y + 130, { steps: 10 });
  await page.mouse.up();
  // the move is saved in the background; a reload right away would abort that write
  await expect.poll(async () => (await savedPositions(page))[0]?.x).not.toBe(saved?.x);
  await page.reload();
  const after = await settledBox(page.getByRole("button", { name: SLIME, exact: true }));
  expect(after?.x).toBeCloseTo(before.x + 100, -1);
  expect(after?.y).toBeCloseTo(before.y + 130, -1);

  await page.getByRole("button", { name: SLIME, exact: true }).click();
  await expect(page.getByRole("toolbar", { name: SLIME })).toBeVisible();
  await expect(page.getByRole("link", { name: "@sticker_fan2026" })).toHaveAttribute(
    "href",
    "https://x.com/sticker_fan2026",
  );
  // thrown off the album, it goes into the desk's drawer, kept (also across a reload)
  await page.getByRole("button", { name: "捨てる" }).click();
  await expect(page.getByRole("button", { name: SLIME, exact: true })).toHaveCount(0);
  const drawer = page.getByRole("button", { name: "引き出し(1枚)" });
  await expect(drawer).toBeVisible();
  await page.reload();
  await expect(drawer).toBeVisible();
  // taken out, it is back in the pocket, and the drawer, empty, is gone
  await drawer.click();
  await page.getByRole("button", { name: `${SLIME} を取り出す` }).click();
  await expect(page.getByRole("button", { name: /^引き出し/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ポケット(1枚)" })).toBeVisible();
});

test("pulled outward from its corner, a sticker stays stuck", async ({ page }) => {
  await receive(page, "slime", SLIME);
  const placed = page.getByRole("button", { name: SLIME, exact: true });
  const b = await settledBox(placed);
  const [saved] = await savedPositions(page);
  // the first point of the sticker in from its lower right corner
  const corner = await placed.evaluate(
    (el, box) => {
      for (let i = 0; i < box.width / 2; i += 1) {
        const [x, y] = [box.x + box.width - i, box.y + box.height - i];
        const hit = document.elementFromPoint(x, y);
        if (hit && el.contains(hit)) return { x: x - 2, y: y - 2 };
      }
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    },
    { x: b.x, y: b.y, width: b.width, height: b.height },
  );
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(corner.x + 160, corner.y + 160, { steps: 12 });
  await page.mouse.up();
  const after = await settledBox(placed);
  expect(after.x).toBeCloseTo(b.x, 0);
  expect(after.y).toBeCloseTo(b.y, 0);
  expect((await savedPositions(page))[0]).toEqual(saved);
});

test("a full spread adds the next spread of the notebook", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "メニュー" }).click();
  await page.getByLabel("復元").setInputFiles({
    name: "b.json",
    mimeType: "application/json",
    buffer: Buffer.from(await bigBackup(25, 0)),
  });
  await expect(page.getByRole("status")).toContainText("25枚を読み込んだ");
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
  expect(JSON.parse(json)).toMatchObject({ format: "sticker-notes-backup", version: 2 });

  const fresh = await browser.newContext();
  const p2 = await fresh.newPage();
  await p2.goto("/");
  await p2.getByRole("button", { name: "メニュー" }).click();
  const file = { name: "backup.json", mimeType: "application/json", buffer: Buffer.from(json) };
  await p2.getByLabel("復元").setInputFiles(file);
  await expect(p2.getByRole("status")).toContainText("2枚を読み込んだ");
  await p2.getByLabel("復元").setInputFiles(file);
  await expect(p2.getByRole("status")).toContainText("0枚を読み込んだ");
  await fresh.close();
});
