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

test("a first visit learns on the samples: peel, stick, turn, take a friend's from the pocket, make one", async ({
  page,
}) => {
  await page.goto("/");
  // no words: it begins at once, one sample sticker's edge curling up now and then, as if it would come off
  await expect(caption(page)).toHaveAttribute("data-tutorial", "tutorial.start:peel");
  await expect(page.locator("[data-teased]")).toHaveCount(1);
  const samples = page.locator("[data-facing]").getByRole("button", { name: "X @sticker_notes" });
  await expect(samples).toHaveCount(2);

  // peeled by its edge, and put down on the desk above the book
  const sticker = samples.first();
  const edge = await edgeOf(sticker);
  const book = await page.locator("[data-open]").boundingBox();
  if (!book) throw new Error("no book");
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await page.mouse.move(edge.x - 20, edge.y - 30, { steps: 6 });
  await expect(caption(page)).toHaveAttribute("data-tutorial", "tutorial.start:place");
  await page.mouse.move(60, Math.max(40, book.y - 40), { steps: 8 });
  await page.mouse.up();
  await expect(caption(page)).toHaveAttribute("data-tutorial", "tutorial.start:turn");

  // the next page has one more sample waiting
  await turnPage(page, 1);
  await expect(
    page.locator("[data-facing]").getByRole("button", { name: "X @sticker_notes" }),
  ).toHaveCount(1);
  await expect(caption(page)).toHaveAttribute("data-tutorial", "tutorial.start:create");
  await expect(caption(page).getByLabel("できた")).toHaveCount(1);

  // one's own: put away with nothing made, the step comes round again
  const create = page
    .getByRole("navigation")
    .getByRole("button", { name: "画像からステッカーを作る" });
  await create.click();
  await expect(caption(page)).toHaveAttribute("data-tutorial", "tutorial.start:making");
  await page.keyboard.press("Escape");
  await expect(caption(page)).toHaveAttribute("data-tutorial", "tutorial.start:create");
  await create.click();
  await page.locator('input[type="file"]').setInputFiles("test/fixtures/sample.png");
  await expect(page.getByRole("img", { name: "作成中のステッカー" })).toBeVisible();
  await page.getByRole("button", { name: "ポケットに入れる" }).click();

  // its QR comes up, a friend reads it (made up), and it is put away by itself
  const qr = page.getByRole("dialog", { name: "交換用のQR" });
  await expect(qr).toBeVisible();
  await expect(caption(page)).toHaveAttribute("data-tutorial", "tutorial.start:give");
  await expect(qr).toHaveCount(0, { timeout: 10_000 });

  // the friend's sticker comes back into the pocket, to be stuck from there
  await expect(caption(page)).toHaveAttribute("data-tutorial", "tutorial.start:pocket");
  await expect(pocketButton(page)).toHaveAccessibleName("ポケット(1枚)");
  await expect(page.getByRole("dialog", { name: "シールの交換" })).toHaveCount(0);
  await page.getByRole("button", { name: /^ポケット/ }).click();
  // only the friend's is in it: one's own went on the page
  await expect(page.getByRole("button", { name: /を手に取る$/ })).toHaveCount(1);
  await page.getByRole("button", { name: "シール を手に取る", exact: true }).click();
  await page.getByRole("button", { name: "はがしてページに貼る" }).click();
  await expect(caption(page)).toHaveAttribute("data-tutorial", "tutorial.start:outro");
  await page
    .getByRole("dialog", { name: "シールの交換" })
    .getByRole("button", { name: "閉じる", exact: true })
    .click();
  await expect(caption(page)).toHaveCount(0);
  await expect.poll(() => savedTutorial(page)).toEqual({ done: true });
  await page.reload();
  await expect(caption(page)).toHaveCount(0);
  // the samples are no one's: they count no person
  await expect(
    page.locator("[data-facing]").getByRole("button", { name: "X @sticker_notes" }),
  ).not.toHaveCount(0);
});

test("brought by a shared sticker: stick it from the pocket, then make one to give back", async ({
  page,
}) => {
  await page.goto(`/${fragmentOf("slime")}`);
  await expect(caption(page)).toHaveAttribute("data-tutorial", "tutorial.received:place");
  // the pocket beats, with the sticker that came in it
  await expect(page.locator('[data-mark="ring"]')).toBeVisible();
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
  await expect(caption(page)).toHaveAttribute("data-tutorial", "tutorial.received:create");
  await page.getByRole("button", { name: "自分のも作る" }).click();
  await page.locator('input[type="file"]').setInputFiles("test/fixtures/sample.png");
  await expect(page.getByRole("img", { name: "作成中のステッカー" })).toBeVisible();
  await page.getByRole("button", { name: "ポケットに入れる" }).click();
  const qr = page.getByRole("dialog", { name: "交換用のQR" });
  await expect(qr).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(qr).toHaveCount(0);
  await expect(caption(page)).toHaveAttribute("data-tutorial", "tutorial.received:outro");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(caption(page)).toHaveCount(0);
});
