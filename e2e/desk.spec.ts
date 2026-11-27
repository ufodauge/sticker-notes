import { expect, test, type Page } from "@playwright/test";
import { edgeOf, pocketButton, receiveToPocket, savedPositions } from "./helpers.ts";

const SLIME = "X @sticker_fan2026";
const desk = (page: Page) => page.locator('[data-surface="surface:desk"]');

async function pullFromPocketTo(page: Page, to: { x: number; y: number }) {
  const pocket = await pocketButton(page).boundingBox();
  if (!pocket) throw new Error("no pocket");
  await page.mouse.move(pocket.x + pocket.width / 2, pocket.y + 20);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

test("a sticker pulled out of the pocket can lie on the bare desk; no page is made for it", async ({
  page,
}) => {
  await receiveToPocket(page, "slime");
  const book = await page.locator("[data-open]").boundingBox();
  if (!book) throw new Error("no book");
  // above the book, on the wood
  await pullFromPocketTo(page, { x: 60, y: Math.max(40, book.y - 40) });
  const onDesk = desk(page).getByRole("button", { name: SLIME, exact: true });
  await expect(onDesk).toBeVisible();
  await expect(pocketButton(page)).toHaveAccessibleName("ポケット(0枚)");
  await expect(page.locator("[data-page]")).toHaveCount(1);
  await expect.poll(async () => (await savedPositions(page)).length).toBe(1);
  await page.reload();
  await expect(desk(page).getByRole("button", { name: SLIME, exact: true })).toBeVisible();
});

test("a sticker on the desk is lifted by its edge and carried onto a page", async ({ page }) => {
  await receiveToPocket(page, "slime");
  // the note of who it came from lies at the foot of a phone's screen for a while
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 9000 });
  const book = await page.locator("[data-open]").boundingBox();
  if (!book) throw new Error("no book");
  await pullFromPocketTo(page, { x: 70, y: Math.max(50, book.y - 50) });
  const onDesk = desk(page).getByRole("button", { name: SLIME, exact: true });
  await expect(onDesk).toBeVisible();
  const edge = await edgeOf(onDesk);
  const paper = await page.locator("[data-facing] [data-paper]").first().boundingBox();
  if (!paper) throw new Error("no page");
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await page.mouse.move(paper.x + paper.width * 0.25, paper.y + paper.height * 0.5, { steps: 12 });
  await page.mouse.up();
  await expect(desk(page).getByRole("button")).toHaveCount(0);
  await expect(
    page.locator("[data-facing]").getByRole("button", { name: SLIME, exact: true }),
  ).toBeVisible();
});
