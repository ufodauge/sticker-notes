import { expect, test } from "@playwright/test";
import { serializeBackup } from "../src/core/backup.ts";
import { encodeBody, stickerIdOf, type Sticker } from "../src/core/payload.ts";
import { FIXTURES } from "../src/core/testing/fixtures.ts";

async function twoStickers(): Promise<string> {
  const slime = FIXTURES.slime as Sticker;
  const made = await Promise.all(
    [
      { ...slime, snsId: "one" },
      { ...slime, snsId: "two" },
    ].map(async (s, i) => {
      const body = encodeBody(s);
      return { id: await stickerIdOf(body), body, i };
    }),
  );
  return serializeBackup(
    {
      stickers: made.map(({ id, body }) => ({
        id,
        body,
        origin: "received" as const,
        receivedAt: "2026-11-25",
      })),
      pages: [{ id: "p", order: 0 }],
      placements: made.map(({ id, i }) => ({
        id: `x${i}`,
        pageId: "p",
        stickerId: id,
        x: 0.3 + i * 0.4,
        y: 0.3,
        scale: 2 as const,
        rotation: 0,
        z: i + 1,
      })),
    },
    new Date(),
  );
}

test("lights out: the page goes dark and comes back", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "メニュー" }).click();
  await page.getByLabel("読み込む").setInputFiles({
    name: "b.json",
    mimeType: "application/json",
    buffer: Buffer.from(await twoStickers()),
  });
  await expect(page.getByRole("status")).toContainText("2枚を読み込んだ");
  await page.keyboard.press("Escape");

  const swtch = page.getByRole("button", { name: "電気を消す" });
  await expect(swtch).toHaveAttribute("aria-pressed", "false");
  await swtch.click();
  await expect(swtch).toHaveAttribute("aria-pressed", "true");
  // the spread is drawn on both of its halves
  await expect(page.locator("[data-near] [data-facing] [data-paper][data-dark]")).toHaveCount(2);

  await swtch.click();
  await expect(page.locator("[data-paper][data-dark]")).toHaveCount(0);
});
