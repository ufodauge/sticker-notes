import { expect, test, type Page } from "@playwright/test";
import { edgeOf, fragmentOf, pocketButton, turnPage } from "./helpers.ts";

// The first time through, as a new visitor meets it (the other tests skip it).
test.use({ storageState: { cookies: [], origins: [] } });

const caption = (page: Page) => page.locator("[data-tutorial]");

// what is saved of the tutorial (a reload right after closing it must not lose that)
const savedTutorial = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<unknown>((resolve) => {
        const open = indexedDB.open("sticker-notes");
        open.onsuccess = () => {
          const req = open.result.transaction("settings").objectStore("settings").get("tutorial");
          req.onsuccess = () => {
            resolve((req.result as { value?: unknown } | undefined)?.value ?? null);
            open.result.close();
          };
        };
      }),
  );

test("a first visit learns on the sample stickers: peel, stick, turn, make one's own", async ({
  page,
}) => {
  await page.goto("/");
  await expect(caption(page)).toHaveAttribute("data-tutorial", "start:peeled");
  await expect(caption(page)).toContainText("1/4");
  const samples = page.locator("[data-facing]").getByRole("button", { name: "X @sticker_notes" });
  await expect(samples).toHaveCount(3);

  // peeled by its edge, and put down on the desk above the book
  const sticker = samples.first();
  const edge = await edgeOf(sticker);
  const book = await page.locator("[data-open]").boundingBox();
  if (!book) throw new Error("no book");
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await page.mouse.move(edge.x - 20, edge.y - 30, { steps: 6 });
  await expect(caption(page)).toHaveAttribute("data-tutorial", "start:placed");
  await page.mouse.move(60, Math.max(40, book.y - 40), { steps: 8 });
  await page.mouse.up();
  await expect(caption(page)).toHaveAttribute("data-tutorial", "start:turned");

  await turnPage(page, 1);
  await expect(caption(page)).toHaveAttribute("data-tutorial", "start:create");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "画像からステッカーを作る" })
    .click();
  await expect(caption(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect.poll(() => savedTutorial(page)).toEqual({ done: true });
  await page.reload();
  await expect(caption(page)).toHaveCount(0);
  // the samples are no one's: they count no person
  await expect(
    page.locator("[data-facing]").getByRole("button", { name: "X @sticker_notes" }),
  ).not.toHaveCount(0);
});

test("the tutorial can be closed at any time, and stays closed", async ({ page }) => {
  await page.goto("/");
  await expect(caption(page)).toBeVisible();
  await page.getByRole("button", { name: "チュートリアルを閉じる" }).click();
  await expect(caption(page)).toHaveCount(0);
  await expect.poll(() => savedTutorial(page)).toEqual({ done: true });
  await page.reload();
  await expect(caption(page)).toHaveCount(0);
});

test("brought by a shared sticker: stick it from the pocket, then make one to give back", async ({
  page,
}) => {
  await page.goto(`/${fragmentOf("slime")}`);
  await expect(caption(page)).toHaveAttribute("data-tutorial", "received:placed");
  // no samples for someone who came with a sticker of their own to learn on
  await expect(page.getByRole("button", { name: "X @sticker_notes" })).toHaveCount(0);
  await expect(pocketButton(page)).toHaveAccessibleName("ポケット(1枚)");
  const pocket = await pocketButton(page).boundingBox();
  const paper = await page.locator("[data-facing] [data-paper]").first().boundingBox();
  if (!pocket || !paper) throw new Error("no box");
  await page.mouse.move(pocket.x + pocket.width / 2, pocket.y + 20);
  await page.mouse.down();
  await page.mouse.move(paper.x + paper.width * 0.3, paper.y + paper.height * 0.4, { steps: 12 });
  await page.mouse.up();
  await expect(caption(page)).toHaveAttribute("data-tutorial", "received:created");
  await page.getByRole("button", { name: "自分のも作る" }).click();
  await page.locator('input[type="file"]').setInputFiles("test/fixtures/sample.png");
  await expect(page.getByRole("img", { name: "作成中のステッカー" })).toBeVisible();
  await page.getByLabel("ID", { exact: true }).fill("mine_1");
  await page.getByRole("button", { name: "ポケットに入れる" }).click();
  await expect(caption(page)).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "交換用のQR" })).toBeVisible();
});
