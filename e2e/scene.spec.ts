import { expect, test } from "@playwright/test";

// The desk's light follows the device's clock alone.
for (const [time, phase] of [
  ["07:00", "morning"],
  ["12:30", "day"],
  ["17:40", "evening"],
  ["22:00", "night"],
] as const) {
  test(`at ${time} the desk is in ${phase} light`, async ({ page }) => {
    await page.clock.install({ time: new Date(`2026-11-26T${time}:00`) });
    await page.goto("/");
    await expect(page.locator("main")).toHaveAttribute("data-phase", phase);
  });
}

test("the light moves on with the clock", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-26T18:00:00") });
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-phase", "evening");
  await page.clock.runFor("01:00:00");
  await expect(page.locator("main")).toHaveAttribute("data-phase", "night");
});

test("there is no light switch: only the clock decides", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "電気を消す" })).toHaveCount(0);
});

test("midday lays nothing over the desk; the evening does", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-26T12:30:00") });
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-phase", "day");
  await expect(page.locator("main [data-sun-side]")).toHaveCount(0);
  await page.clock.runFor("05:00:00");
  await expect(page.locator("main [data-sun-side]")).toHaveCount(1);
});
