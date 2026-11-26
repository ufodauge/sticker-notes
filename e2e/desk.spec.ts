import { expect, test, type Locator, type Page } from "@playwright/test";
import { bigBackup, pocketBackup } from "./backup-fixture.ts";
import { edgeOf, pocketButton, receiveToPocket, savedPositions } from "./helpers.ts";

const SLIME = "X @sticker_fan2026";
const desk = (page: Page) => page.locator('[data-surface="surface:desk"]');
const notebook = (page: Page) => page.locator('[data-surface="surface:notebook"]');
const laptop = (page: Page) => page.locator('[data-surface="surface:laptop"]');

async function restore(page: Page, json: string, count: number) {
  await page.goto("/");
  await page.getByRole("button", { name: "メニュー" }).click();
  await page
    .getByLabel("読み込む")
    .setInputFiles({ name: "b.json", mimeType: "application/json", buffer: Buffer.from(json) });
  await expect(page.getByRole("status")).toContainText(`${count}枚を読み込んだ`);
  await page.keyboard.press("Escape");
}

async function pullFromPocketTo(page: Page, to: { x: number; y: number }) {
  const pocket = await pocketButton(page).boundingBox();
  if (!pocket) throw new Error("no pocket");
  await page.mouse.move(pocket.x + pocket.width / 2, pocket.y + 20);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

// A point of a (possibly turned) thing, given where it lies on it unturned (0..1 each way).
async function pointOn(thing: Locator, u: number, v: number, scroll = true) {
  if (scroll) await thing.scrollIntoViewIfNeeded();
  return thing.evaluate(
    (el, [pu, pv]) => {
      const r = el.getBoundingClientRect();
      const a = ((Number((el as HTMLElement).dataset.angle) || 0) * Math.PI) / 180;
      const w = (el as HTMLElement).offsetWidth;
      const h = (el as HTMLElement).offsetHeight;
      const lx = (pu - 0.5) * w;
      const ly = (pv - 0.5) * h;
      return {
        x: r.left + r.width / 2 + lx * Math.cos(a) - ly * Math.sin(a),
        y: r.top + r.height / 2 + lx * Math.sin(a) + ly * Math.cos(a),
      };
    },
    [u, v] as const,
  );
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

test("on a turned notebook a sticker lands where it was let go", async ({ page }) => {
  await receiveToPocket(page, "slime");
  await pullFromPocketTo(page, await pointOn(notebook(page), 0.3, 0.7));
  await expect(notebook(page).getByRole("button", { name: SLIME, exact: true })).toBeVisible();
  await expect.poll(async () => (await savedPositions(page))[0]?.x ?? 0).toBeCloseTo(0.3, 1);
  expect((await savedPositions(page))[0]?.y).toBeCloseTo(0.7, 1);
});

test("the notebook holds eight; a ninth goes back into the pocket", async ({ page }) => {
  const data = JSON.parse(await bigBackup(9, 9)) as {
    placements: { pageId: string; x: number; y: number }[];
  };
  data.placements.slice(0, 8).forEach((p, i) => {
    p.pageId = "surface:notebook";
    p.x = 0.25 + (i % 2) * 0.5;
    p.y = 0.15 + Math.floor(i / 2) * 0.23;
  });
  await restore(page, JSON.stringify({ ...data, placements: data.placements.slice(0, 8) }), 9);
  await expect(notebook(page).getByRole("button")).toHaveCount(8);
  await expect(pocketButton(page)).toHaveAccessibleName("ポケット(1枚)");
  await pullFromPocketTo(page, await pointOn(notebook(page), 0.5, 0.5));
  await expect(notebook(page).getByRole("button")).toHaveCount(8);
  await expect(pocketButton(page)).toHaveAccessibleName("ポケット(1枚)");
});

test("with the third person a laptop arrives on the desk, and stickers go on it", async ({
  page,
}) => {
  await restore(page, await pocketBackup(3), 3);
  await expect(laptop(page)).toHaveCount(1);
  await expect(laptop(page)).not.toHaveAttribute("data-arriving");
  await page.reload();
  await expect(laptop(page)).not.toHaveAttribute("data-arriving");
  await pullFromPocketTo(page, await pointOn(laptop(page), 0.5, 0.5));
  await expect(laptop(page).getByRole("button")).toHaveCount(1);
  await expect(pocketButton(page)).toHaveAccessibleName("ポケット(2枚)");
});

test("a thing is moved by its base and turned by its handle, and stays so", async ({ page }) => {
  await page.goto("/");
  const book = notebook(page);
  const start = await pointOn(book, 0.5, 0.5);
  const angle0 = Number(await book.getAttribute("data-angle"));
  // moved by its base
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 30, start.y - 20, { steps: 8 });
  await page.mouse.up();
  const moved = await pointOn(book, 0.5, 0.5, false);
  expect(moved.x).toBeCloseTo(start.x - 30, -1);
  // tapped, it shows its handle; dragged round, it turns
  await page.mouse.click(moved.x, moved.y);
  const handle = page.getByRole("button", { name: "回す(ドラッグ)" });
  await expect(handle).toBeVisible();
  const h = await handle.boundingBox();
  if (!h) throw new Error("no handle");
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(moved.x + 120, moved.y + 60, { steps: 10 });
  await page.mouse.up();
  const angle1 = Number(await book.getAttribute("data-angle"));
  expect(Math.abs(angle1 - angle0)).toBeGreaterThan(20);
  await page.waitForTimeout(300);
  await page.reload();
  expect(Number(await notebook(page).getAttribute("data-angle"))).toBeCloseTo(angle1, 0);
});

test("a sticker on a turned notebook is lifted by its edge and carried onto a page", async ({
  page,
}) => {
  await receiveToPocket(page, "slime");
  // the first receive's invitation lies at the foot of a phone's screen until it is closed
  await page.getByRole("button", { name: "案内を閉じる" }).click();
  await pullFromPocketTo(page, await pointOn(notebook(page), 0.5, 0.4));
  const onBook = notebook(page).getByRole("button", { name: SLIME, exact: true });
  await expect(onBook).toBeVisible();
  // held in the middle it stays put
  const b = await onBook.boundingBox();
  if (!b) throw new Error("no sticker");
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y - 200, { steps: 10 });
  await page.mouse.up();
  await expect(onBook).toBeVisible();
  // by its edge it comes off, and goes onto the page
  const edge = await edgeOf(onBook);
  const paper = await page.locator("[data-facing] [data-paper]").first().boundingBox();
  if (!paper) throw new Error("no page");
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await page.mouse.move(paper.x + paper.width * 0.25, paper.y + paper.height * 0.5, { steps: 12 });
  await page.mouse.up();
  await expect(notebook(page).getByRole("button")).toHaveCount(0);
  await expect(
    page.locator("[data-facing]").getByRole("button", { name: SLIME, exact: true }),
  ).toBeVisible();
});
