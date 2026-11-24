import { expect, test, type Page } from "@playwright/test";
import { shapesBackup } from "./jar-fixtures.ts";

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
    await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 90_000 });
    await page.getByRole("button", { name: "振る" }).click();
    await expect(canvasOf(page)).toHaveAttribute("data-state", "moving");
    await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 90_000 });
  }
  expect(errors).toEqual([]);
});
