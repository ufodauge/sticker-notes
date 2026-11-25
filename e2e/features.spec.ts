import { expect, test } from "@playwright/test";
import { bigBackup } from "./backup-fixture.ts";
import { carrySticker, placementsPerPage, receive, turnPage } from "./helpers.ts";

const SLIME = "X @sticker_fan2026";

test("a sticker held at the edge goes over to the next page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "メニュー" }).click();
  await page.getByLabel("読み込む").setInputFiles({
    name: "b.json",
    mimeType: "application/json",
    buffer: Buffer.from(await bigBackup(13, 0)),
  });
  await expect(page.getByRole("status")).toContainText("13枚を読み込んだ");
  await page.keyboard.press("Escape");
  const pages = page.locator("[data-page]");
  await expect(pages).toHaveCount(2);

  const sticker = page.getByRole("button", { name: "X @user_0", exact: true });
  const vw = page.viewportSize()?.width ?? 400;
  const vh = page.viewportSize()?.height ?? 800;
  await carrySticker(
    page,
    sticker,
    { x: vw - 8, y: vh / 2 },
    { holdMs: 1100, drop: { x: vw / 2, y: vh / 2 } },
  );

  await expect(pages.nth(1).getByRole("button", { name: "X @user_0", exact: true })).toBeVisible();
  // saved to IndexedDB in the background (WebKit can take a moment): wait for the write
  // before reloading, as a reload would abort an uncommitted transaction
  await expect.poll(() => placementsPerPage(page), { timeout: 10_000 }).toEqual([11, 2]);
  await page.reload();
  await turnPage(page, 1);
  await expect(
    page.locator("[data-page]").nth(1).getByRole("button", { name: "X @user_0", exact: true }),
  ).toHaveCount(1);
});

test("the corner handle rotates and resizes", async ({ page }) => {
  await receive(page, "slime", SLIME);
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: SLIME, exact: true }).click();
  const handle = page.getByRole("button", { name: "回転と大きさ(ドラッグ)" });
  await expect(handle).toBeVisible();
  const art = await page.getByRole("button", { name: SLIME, exact: true }).boundingBox();
  const h = await handle.boundingBox();
  if (!art || !h) throw new Error("no boxes");
  const cx = art.x + art.width / 2;
  const cy = art.y + art.height / 2;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  const r = Math.hypot(h.x + h.width / 2 - cx, h.y + h.height / 2 - cy) * 1.6;
  const a = Math.atan2(h.y + h.height / 2 - cy, h.x + h.width / 2 - cx) + Math.PI / 2;
  await page.mouse.move(cx + r * Math.cos(a), cy + r * Math.sin(a), { steps: 10 });
  await page.mouse.up();
  const style = await page
    .getByRole("button", { name: SLIME, exact: true })
    .evaluate((el) => (el.parentElement as HTMLElement).style.cssText);
  expect(style).toMatch(/--s: 3/);
  const rot = Number(/--r: (-?[\d.]+)deg/.exec(style)?.[1]);
  expect(Math.abs(rot)).toBeGreaterThan(60);
});

test("print the album as it is: one A4 per page, stickers rotated in place", async ({ page }) => {
  await receive(page, "slime", SLIME);
  await receive(page, "discord", "Discord @pixel.trader");
  await page.getByRole("button", { name: "印刷" }).click();
  await expect(page.getByRole("radio", { name: "シール帳" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  const sheet = page.getByRole("img", { name: "印刷シート 1" });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("use")).toHaveCount(2);
  await expect(sheet.locator("g[transform*='rotate']")).toHaveCount(2);
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "印刷", exact: true }),
  ).toBeEnabled();
});

test("grid printing keeps the element count flat as copies grow", async ({ page }) => {
  await receive(page, "noise", "Instagram @noise.maker_01");
  await page.getByRole("button", { name: "印刷" }).click();
  await page.getByRole("radio", { name: "ならべる" }).click();
  const more = page.getByRole("button", { name: "Instagram @noise.maker_01 を増やす" });
  for (let i = 0; i < 29; i++) await more.click();
  const count = page.getByRole("spinbutton", { name: "Instagram @noise.maker_01 の枚数" });
  await count.fill("30");
  await expect(count).toHaveValue("30");
  await count.fill("500");
  await expect(count).toHaveValue("99");
  await count.fill("30");
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "印刷", exact: true }),
  ).toBeEnabled();
  const paths = await page.locator("symbol path").count();
  expect(paths).toBeLessThanOrEqual(2 * 18);
  expect(await page.locator("svg use").count()).toBe(30 * 2);
});

test("the keep-data switch asks the browser and shows the answer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "メニュー" }).click();
  const toggle = page.getByRole("switch", { name: "データを自動削除されないようにする" });
  await expect(toggle).toBeVisible();
  if (await toggle.isEnabled()) {
    await toggle.click();
    await expect(
      toggle.or(page.getByRole("status").filter({ hasText: "許可しなかった" })),
    ).toBeVisible();
  } else {
    await expect(toggle).toBeChecked();
  }
});
