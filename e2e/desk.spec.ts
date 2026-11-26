import { expect, test, type Page } from "@playwright/test";
import { bigBackup, pocketBackup } from "./backup-fixture.ts";
import { edgeOf, pocketButton, receiveToPocket, savedPositions } from "./helpers.ts";

const SLIME = "X @sticker_fan2026";
const mat = (page: Page) => page.locator('[data-surface="surface:desk"]');
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

async function centreOf(surface: ReturnType<typeof mat>) {
  const b = await surface.boundingBox();
  if (!b) throw new Error("no surface");
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test("a sticker pulled out of the pocket can lie on the desk mat; no page is made for it", async ({
  page,
}) => {
  await receiveToPocket(page, "slime");
  await expect(laptop(page)).toHaveCount(0);
  await pullFromPocketTo(page, await centreOf(mat(page)));
  const onMat = mat(page).getByRole("button", { name: SLIME, exact: true });
  await expect(onMat).toBeVisible();
  await expect(pocketButton(page)).toHaveAccessibleName("ポケット(0枚)");
  await expect(page.locator("[data-page]")).toHaveCount(1);
  // saved in the background; a reload right away would cut the write short
  await expect.poll(async () => (await savedPositions(page)).length).toBe(1);
  await page.reload();
  await expect(mat(page).getByRole("button", { name: SLIME, exact: true })).toBeVisible();
  // a tap selects it, as on a page
  await mat(page).getByRole("button", { name: SLIME, exact: true }).click();
  await expect(page.getByRole("toolbar", { name: SLIME })).toBeVisible();
});

test("the mat holds four; a fifth goes back into the pocket", async ({ page }) => {
  const data = JSON.parse(await bigBackup(5, 5)) as {
    placements: { pageId: string; x: number; y: number }[];
  };
  data.placements.slice(0, 4).forEach((p, i) => {
    p.pageId = "surface:desk";
    p.x = 0.2 + i * 0.2;
    p.y = 0.5;
  });
  const json = JSON.stringify({ ...data, placements: data.placements.slice(0, 4) });
  await restore(page, json, 5);
  await expect(mat(page).getByRole("button")).toHaveCount(4);
  await expect(pocketButton(page)).toHaveAccessibleName("ポケット(1枚)");
  await pullFromPocketTo(page, await centreOf(mat(page)));
  await expect(mat(page).getByRole("button")).toHaveCount(4);
  await expect(pocketButton(page)).toHaveAccessibleName("ポケット(1枚)");
});

test("with the third person a laptop slides onto the desk, and stickers go on it", async ({
  page,
}) => {
  await restore(page, await pocketBackup(3), 3);
  await expect(laptop(page)).toBeVisible();
  // it arrives once: seen, it is simply there after a reload
  await expect(laptop(page)).not.toHaveAttribute("data-arriving");
  await page.reload();
  await expect(laptop(page)).toBeVisible();
  await expect(laptop(page)).not.toHaveAttribute("data-arriving");
  await pullFromPocketTo(page, await centreOf(laptop(page)));
  await expect(laptop(page).getByRole("button")).toHaveCount(1);
  await expect(pocketButton(page)).toHaveAccessibleName("ポケット(2枚)");
});

test("a sticker on the mat is lifted by its edge and carried back onto a page", async ({
  page,
}) => {
  await receiveToPocket(page, "slime");
  // the first receive's invitation lies over the desk on a phone until it is closed
  await page.getByRole("button", { name: "案内を閉じる" }).click();
  await pullFromPocketTo(page, await centreOf(mat(page)));
  const onMat = mat(page).getByRole("button", { name: SLIME, exact: true });
  await expect(onMat).toBeVisible();
  const paper = await page.locator("[data-facing] [data-paper]").first().boundingBox();
  if (!paper) throw new Error("no page");
  // held in the middle it stays put
  const b = await onMat.boundingBox();
  if (!b) throw new Error("no sticker");
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(paper.x + paper.width * 0.5, paper.y + paper.height * 0.5, { steps: 10 });
  await page.mouse.up();
  await expect(onMat).toBeVisible();
  // by its edge it comes off
  const edge = await edgeOf(onMat);
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await page.mouse.move(paper.x + paper.width * 0.5, paper.y + paper.height * 0.5, { steps: 12 });
  await page.mouse.up();
  await expect(mat(page).getByRole("button")).toHaveCount(0);
  await expect(
    page.locator("[data-facing]").getByRole("button", { name: SLIME, exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await savedPositions(page)).length).toBe(1);
});

test("the laptop is moved about the desk by its base and stays where it is put", async ({
  page,
}) => {
  await restore(page, await pocketBackup(3), 3);
  await expect(laptop(page)).not.toHaveAttribute("data-arriving");
  await pullFromPocketTo(page, await centreOf(laptop(page)));
  await expect(laptop(page).getByRole("button")).toHaveCount(1);
  const before = await laptop(page).boundingBox();
  const sticker = await laptop(page).getByRole("button").boundingBox();
  if (!before || !sticker) throw new Error("no laptop");
  // by its base: a corner where no sticker lies
  const base = { x: before.x + 8, y: before.y + 8 };
  await page.mouse.move(base.x, base.y);
  await page.mouse.down();
  await page.mouse.move(base.x - 40, base.y - 10, { steps: 8 });
  await page.mouse.up();
  const after = await laptop(page).boundingBox();
  expect(after?.x).toBeCloseTo(before.x - 40, -1);
  // the stickers on it go with it
  const moved = await laptop(page).getByRole("button").boundingBox();
  expect(moved?.x).toBeCloseTo(sticker.x - 40, -1);
  await page.waitForTimeout(300);
  await page.reload();
  const reloaded = await laptop(page).boundingBox();
  expect(reloaded?.x).toBeCloseTo(before.x - 40, -1);
});
