import { expect, test } from "@playwright/test";
import { serializeBackup } from "../src/core/backup.ts";
import { encodeBody, stickerIdOf, type Sticker } from "../src/core/payload.ts";
import { FIXTURES } from "../src/core/testing/fixtures.ts";

async function glowAndPlain(): Promise<string> {
  const slime = FIXTURES.slime as Sticker;
  const made = await Promise.all(
    [
      { ...slime, snsId: "glow_one", material: { kind: "glow" as const, tone: 0 } },
      { ...slime, snsId: "plain_one" },
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

test("lights out: the page goes dark and only the glow sticker rises above it", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "メニュー" }).click();
  await page.getByLabel("読み込む").setInputFiles({
    name: "b.json",
    mimeType: "application/json",
    buffer: Buffer.from(await glowAndPlain()),
  });
  await expect(page.getByRole("status")).toContainText("2枚を読み込んだ");
  await page.keyboard.press("Escape");

  const swtch = page.getByRole("button", { name: "電気を消す" });
  await expect(swtch).toHaveAttribute("aria-pressed", "false");
  await swtch.click();
  await expect(swtch).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-paper][data-dark]")).toHaveCount(1);
  await expect(page.locator("[data-glow]")).toHaveCount(1);
  await expect(
    page.locator("[data-glow]").getByRole("button", { name: "X @glow_one", exact: true }),
  ).toBeVisible();

  await swtch.click();
  await expect(page.locator("[data-paper][data-dark]")).toHaveCount(0);
});
