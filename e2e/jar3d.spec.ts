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
  await expect(page.getByRole("status")).toContainText("12枚を貼った", { timeout: 30_000 });
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
  await expect(page.getByRole("status")).toContainText("30枚を貼った", { timeout: 30_000 });
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
