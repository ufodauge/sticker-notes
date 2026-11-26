import { expect, test } from "@playwright/test";

// The debug build's sample page: the scene's look on one page, for a design review.
test("?samples lays out the desk at four hours, every material, the mat and the laptop", async ({
  page,
}) => {
  await page.goto("/?samples");
  await expect(page.getByRole("heading", { name: "見本(場面と素材)" })).toBeVisible();
  const scenes = page.locator("figure");
  await expect(scenes).toHaveCount(4);
  await expect(scenes.locator("figcaption")).toHaveText([
    /7:00 · morning/,
    /12:00 · day/,
    /17:30 · evening/,
    /21:00 · night/,
  ]);
  await expect(scenes.first().getByText("箔")).toBeVisible();
  // midday lays nothing over the desk; the other hours do
  await expect(scenes.nth(1).locator("[data-sun-side]")).toHaveCount(0);
  await expect(scenes.nth(2).locator("[data-sun-side]")).toHaveCount(1);
  await page.screenshot({ path: "test-results/samples.png", fullPage: true });
});
