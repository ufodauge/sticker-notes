import { expect, test, type Page } from "@playwright/test";
import { shapesBackup } from "./jar-fixtures.ts";

test.describe.configure({ mode: "serial" });

const canvasOf = (page: Page) => page.locator("canvas[data-blocks]");

test("jar: the 3D scene starts on the desk and takes a shake (WebGL where available)", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "software WebGL is only dependable in Chromium");
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "メニュー" }).click();
  await page.getByLabel("読み込む").setInputFiles({
    name: "b.json",
    mimeType: "application/json",
    buffer: Buffer.from(await shapesBackup(12)),
  });
  await expect(page.getByRole("status")).toContainText("12枚を読み込んだ", { timeout: 30_000 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "瓶で見る" }).click();
  await expect(canvasOf(page)).toHaveAttribute("data-blocks", "12");
  const engine = await canvasOf(page).getAttribute("data-renderer");
  if (engine === "webgl") {
    await page.getByRole("button", { name: "振る" }).click();
    await expect(canvasOf(page)).toHaveAttribute("data-state", "moving");
  }
  expect(errors).toEqual([]);
});

test("jar: blocks stay inside the glass however often the jar is shaken", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "software WebGL is only dependable in Chromium");
  test.setTimeout(300_000);
  await page.goto("/");
  await page.getByRole("button", { name: "メニュー" }).click();
  await page.getByLabel("読み込む").setInputFiles({
    name: "b.json",
    mimeType: "application/json",
    buffer: Buffer.from(await shapesBackup(30)),
  });
  await expect(page.getByRole("status")).toContainText("30枚を読み込んだ", { timeout: 30_000 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "瓶で見る" }).click();
  await expect(canvasOf(page)).toHaveAttribute("data-queue", "0", { timeout: 120_000 });
  for (const _ of Array.from({ length: 10 })) {
    await page.getByRole("button", { name: "振る" }).click();
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(8000);
  await expect(canvasOf(page)).toHaveAttribute("data-leaked", "0");
});

test("jar: with the lid on, shaking the jar by hand keeps every block inside", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "software WebGL is only dependable in Chromium");
  test.setTimeout(300_000);
  await page.goto("/");
  await page.getByRole("button", { name: "メニュー" }).click();
  await page.getByLabel("読み込む").setInputFiles({
    name: "b.json",
    mimeType: "application/json",
    buffer: Buffer.from(await shapesBackup(30)),
  });
  await expect(page.getByRole("status")).toContainText("30枚を読み込んだ", { timeout: 30_000 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "瓶で見る" }).click();
  await expect(canvasOf(page)).toHaveAttribute("data-queue", "0", { timeout: 120_000 });
  await page.getByRole("button", { name: "ふた" }).click();
  const box = await canvasOf(page).boundingBox();
  if (!box) throw new Error("no canvas");
  const x = box.x + box.width * 0.5;
  const y = box.y + box.height * 0.4;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (const i of Array.from({ length: 40 }, (_, k) => k)) {
    await page.mouse.move(x + (i % 2 === 0 ? 120 : -120), y + (i % 4 < 2 ? -60 : 60));
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  for (const _ of Array.from({ length: 6 })) {
    await page.getByRole("button", { name: "振る" }).click();
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(6000);
  await expect(canvasOf(page)).toHaveAttribute("data-leaked", "0");
  expect(Number(await canvasOf(page).getAttribute("data-hits"))).toBeGreaterThan(0);
});
