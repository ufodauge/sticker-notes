/// <reference lib="dom" />
import { expect, test } from "@playwright/test";
import { bigBackup } from "./backup-fixture.ts";
import { edgeOf } from "./helpers.ts";

test("300 stickers: import, 26 pages, drag stays smooth", async ({ page }, info) => {
  test.setTimeout(60_000);
  const json = await bigBackup(300, 60);
  // Chromium: the evening, with the most light laid over the desk (sun, blind, plant, warmth).
  // WebKit: midday, with none. WebKit here composites without a GPU, and any layer over the whole
  // screen costs it a few hundred ms per drag that an iPhone (compositing on its GPU) does not
  // pay; the evening on a real iPhone is on the device checklist in docs/progress.md.
  const hour = info.project.name === "webkit" ? "12:30" : "17:30";
  await page.clock.setFixedTime(new Date(`2026-11-26T${hour}:00`));
  await page.goto("/");
  await page.getByRole("button", { name: "メニュー" }).click();
  const ti = Date.now();
  await page
    .getByLabel("読み込む")
    .setInputFiles({ name: "b.json", mimeType: "application/json", buffer: Buffer.from(json) });
  await expect(page.getByRole("status")).toContainText("300枚を読み込んだ", { timeout: 30_000 });
  const importMs = Date.now() - ti;

  const t0 = Date.now();
  await page.keyboard.press("Escape");
  const target = page.getByRole("button", { name: "X @user_0", exact: true });
  await expect(target).toBeVisible();
  const pageMs = Date.now() - t0;
  await expect(page.locator("[data-page]")).toHaveCount(1 + 240 / 24);

  // Three stickers are peeled and carried; the worst frame gap of each is taken, and the middle
  // one must be short. (WebKit here draws without a GPU, and a single drag now and then stalls for
  // reasons of its own: one sample says little, the median of three does.)
  const dragGap = async (label: string): Promise<number> => {
    const sticker = page.getByRole("button", { name: label, exact: true });
    const box = await sticker.boundingBox();
    if (!box) throw new Error("no box");
    // found before the frames are timed: the search hit-tests the page point by point
    const edge = await edgeOf(sticker);
    await page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __stop: boolean };
      w.__frames = [];
      w.__stop = false;
      const tick = (t: number) => {
        w.__frames.push(t);
        if (!w.__stop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.mouse.move(edge.x, edge.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 160, { steps: 30 });
    await page.mouse.up();
    return page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __stop: boolean };
      w.__stop = true;
      const f = w.__frames;
      return Math.max(0, ...f.slice(1).map((t, i) => t - (f[i] ?? t)));
    });
  };
  const gaps = [await dragGap("X @user_0"), await dragGap("X @user_1"), await dragGap("X @user_2")];
  const worstGap = gaps.toSorted((a, b) => a - b)[1] ?? Infinity;
  console.log(
    `PERF import=${importMs}ms show=${pageMs}ms gaps=${gaps.join("/")}ms median=${worstGap}ms`,
  );
  expect(pageMs).toBeLessThan(3000);
  expect(worstGap).toBeLessThan(300);
});
