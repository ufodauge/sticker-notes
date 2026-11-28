import { expect, test } from "@playwright/test";

// The 3D desk (`?room`, debug builds) takes a designer's file in place of a drawn thing: the
// sample plant (public/room/plant.glb, listed in the manifest) loads, and nothing breaks.
test("?room loads the files the manifest lists, without page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?room");
  const canvas = page.locator("canvas[data-engine]");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-room-assets", /\bplant\b/, { timeout: 15_000 });
  expect(errors).toEqual([]);
});
