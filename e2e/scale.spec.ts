/// <reference lib="dom" />
import { expect, test } from "@playwright/test";
import { bigBackup } from "./backup-fixture.ts";

test("300 stickers: import, 26 pages, drag stays smooth", async ({ page }) => {
  test.setTimeout(60_000);
  const json = await bigBackup(300, 60);
  await page.goto("/");
  await page.getByRole("button", { name: "メニュー" }).click();
  const ti = Date.now();
  await page
    .getByLabel("読み込む")
    .setInputFiles({ name: "b.json", mimeType: "application/json", buffer: Buffer.from(json) });
  await expect(page.getByRole("status")).toContainText("300枚を貼った", { timeout: 30_000 });
  const importMs = Date.now() - ti;

  const t0 = Date.now();
  await page.keyboard.press("Escape");
  const target = page.getByRole("button", { name: "X @user_0", exact: true });
  await expect(target).toBeVisible();
  const pageMs = Date.now() - t0;
  await expect(page.locator("[data-page]")).toHaveCount(1 + 240 / 12);

  const box = await target.boundingBox();
  if (!box) throw new Error("no box");
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[] };
    w.__frames = [];
    const tick = (t: number) => {
      w.__frames.push(t);
      if (w.__frames.length < 400) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 160, { steps: 30 });
  await page.mouse.up();
  const worstGap = await page.evaluate(() => {
    const f = (window as unknown as { __frames: number[] }).__frames;
    return Math.max(...f.slice(1).map((t, i) => t - (f[i] ?? t)));
  });
  console.log(`PERF import=${importMs}ms show=${pageMs}ms worstFrameGap=${worstGap.toFixed(1)}ms`);
  expect(pageMs).toBeLessThan(3000);
  expect(worstGap).toBeLessThan(300);
});
