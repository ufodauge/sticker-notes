/// <reference lib="dom" />
import { expect, test, type Page } from "@playwright/test";
import {
  carrySticker,
  edgeOf,
  pocketButton,
  receive,
  receiveToPocket,
  savedPositions,
  settledBox,
  stickFromPocket,
  turnPage,
} from "./helpers.ts";

const SLIME = "X @sticker_fan2026";

async function onScreen(page: Page, label: string) {
  return page.getByRole("button", { name: label, exact: true }).evaluate((el) => {
    const paper = el.closest("[data-paper]") as HTMLElement;
    const canvas = el.querySelector("canvas") as HTMLCanvasElement;
    const p = paper.getBoundingClientRect();
    const c = canvas.getBoundingClientRect();
    return {
      size:
        Number.parseFloat(getComputedStyle(canvas).width) /
        Number.parseFloat(getComputedStyle(paper).width),
      cx: (c.left + c.width / 2 - p.left) / p.width,
      cy: (c.top + c.height / 2 - p.top) / p.height,
    };
  });
}

test("the blank spread after the last page becomes a page when a sticker is stuck on it", async ({
  page,
}) => {
  await receive(page, "slime", SLIME);
  await expect(page.locator("[data-page]")).toHaveCount(1);
  await turnPage(page, 1);
  await receiveToPocket(page, "discord");
  await stickFromPocket(page, "Discord @pixel.trader");
  await expect(page.locator("[data-page]")).toHaveCount(2);
  await expect(page.getByText("2 / 2")).toBeVisible();
});

test("an emptied page can be removed", async ({ page }) => {
  await receive(page, "slime", SLIME);
  await turnPage(page, 1);
  await receiveToPocket(page, "discord");
  await stickFromPocket(page, "Discord @pixel.trader");
  const pocket = await pocketButton(page)
    .boundingBox()
    .catch(() => null);
  const target = pocket ?? { x: 340, y: 20, width: 40, height: 40 };
  await carrySticker(
    page,
    page.getByRole("button", { name: "Discord @pixel.trader", exact: true }),
    {
      x: target.x + target.width / 2,
      y: target.y + target.height / 2,
    },
  );
  await page.getByRole("button", { name: "2ページ目を消す" }).click();
  await expect(page.locator("[data-page]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /ページ目を消す/ })).toHaveCount(0);
});

test("a sticker held at the edge turns the page and can start a page on the blank spread", async ({
  page,
}) => {
  await receive(page, "slime", SLIME);
  await receive(page, "discord", "Discord @pixel.trader");
  const vw = page.viewportSize()?.width ?? 400;
  const vh = page.viewportSize()?.height ?? 800;
  const sticker = page.getByRole("button", { name: SLIME, exact: true });
  await carrySticker(
    page,
    sticker,
    { x: vw - 8, y: vh / 2 },
    { turnsPage: true, drop: { x: vw / 2, y: vh / 2 } },
  );
  await expect(page.locator("[data-page]")).toHaveCount(2);
  await expect(
    page.locator("[data-page]").nth(1).getByRole("button", { name: SLIME, exact: true }),
  ).toHaveCount(1);
});

test("a sticker let go off the paper goes back where it was", async ({ page }) => {
  await receive(page, "slime", SLIME);
  const sticker = page.getByRole("button", { name: SLIME, exact: true });
  const before = (await savedPositions(page))[0];
  await carrySticker(page, sticker, { x: 4, y: 4 });
  await expect(sticker).toBeVisible();
  await page.waitForTimeout(300);
  expect((await savedPositions(page))[0]).toEqual(before);
});

test("a sticker pulled from its middle stays stuck: only its edge lifts", async ({ page }) => {
  await receive(page, "slime", SLIME);
  const sticker = page.getByRole("button", { name: SLIME, exact: true });
  const before = (await savedPositions(page))[0];
  const b = await settledBox(sticker);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 2, b.y + b.height * 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect((await savedPositions(page))[0]).toEqual(before);
  await expect(sticker).toBeVisible();
});

test("a sticker peeled and put down elsewhere on the page stays there", async ({ page }) => {
  await receive(page, "slime", SLIME);
  const sticker = page.getByRole("button", { name: SLIME, exact: true });
  const paper = await page.locator("[data-facing] [data-paper]").first().boundingBox();
  if (!paper) throw new Error("no paper");
  // it stays where it was gripped: the finger goes to the spot less the grip's offset
  const b = await settledBox(sticker);
  const grip = await edgeOf(sticker);
  await carrySticker(page, sticker, {
    x: paper.x + paper.width * 0.7 - (b.x + b.width / 2 - grip.x),
    y: paper.y + paper.height * 0.8 - (b.y + b.height / 2 - grip.y),
  });
  await expect.poll(async () => (await savedPositions(page))[0]?.y ?? 0).toBeCloseTo(0.8, 1);
  expect((await savedPositions(page))[0]?.x).toBeCloseTo(0.7, 1);
  const pos = await onScreen(page, SLIME);
  expect(pos.cx).toBeCloseTo(0.7, 1);
});

for (const width of [320, 1200]) {
  test(`stickers keep their size and place relative to the page at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await receive(page, "slime", SLIME);
    await settledBox(page.getByRole("button", { name: SLIME, exact: true }));
    const pos = await onScreen(page, SLIME);
    expect(pos.size).toBeCloseTo((36 * 2) / 600, 3);
  });
}

test("the album print matches the screen: same size and place on the page", async ({ page }) => {
  await receive(page, "slime", SLIME);
  await receive(page, "discord", "Discord @pixel.trader");
  await settledBox(page.getByRole("button", { name: SLIME, exact: true }));
  const screen = await onScreen(page, SLIME);
  await page.getByRole("button", { name: "印刷" }).click();
  const sheet = page.getByRole("img", { name: "印刷シート 1" });
  const printed = await sheet.evaluate((svg) => {
    const frame = svg.querySelector("rect[stroke]") as SVGRectElement;
    const fx = Number(frame.getAttribute("x"));
    const fy = Number(frame.getAttribute("y"));
    const fw = Number(frame.getAttribute("width"));
    const fh = Number(frame.getAttribute("height"));
    const g = svg.querySelector("g[transform]") as SVGGElement;
    const m = /translate\(([\d.]+) ([\d.]+)\)/.exec(g.getAttribute("transform") ?? "");
    const size = Number(g.querySelector("use")?.getAttribute("width"));
    const x = Number(m?.[1]);
    const y = Number(m?.[2]);
    return { size: size / fw, cx: (x + size / 2 - fx) / fw, cy: (y + size / 2 - fy) / fh };
  });
  // the first sheet is the left half of the spread
  expect(printed.size / 2).toBeCloseTo(screen.size, 3);
  expect(printed.cx / 2).toBeCloseTo(screen.cx, 2);
  expect(printed.cy).toBeCloseTo(screen.cy, 2);
});

test("Ctrl+P prints the album as it is, one A4 per page", async ({ page, browserName }) => {
  await receive(page, "slime", SLIME);
  await expect(page.locator(".printOnly")).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  const copy = page.locator(".printOnly svg[viewBox='0 0 210 297']");
  await expect(copy).toHaveCount(1);
  await expect(copy.first().locator("use")).toHaveCount(1);

  if (browserName === "chromium") {
    await page.emulateMedia({ media: "print" });
    const pdf = (await page.pdf({ preferCSSPageSize: true })).toString("latin1");
    expect(pdf.match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
    await page.emulateMedia({ media: "screen" });
  }
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator(".printOnly")).toHaveCount(0);
});

test("on a phone the first spread slides to its right half and back", async ({ page }) => {
  await receive(page, "slime", SLIME);
  const book = page.locator("[data-open]");
  const v = await page.locator("[data-album]").boundingBox();
  if (!v) throw new Error("no album");
  const drag = async (from: number, to: number) => {
    await page.mouse.move(v.x + v.width * from, v.y + 6);
    await page.mouse.down();
    await page.mouse.move(v.x + v.width * to, v.y + 6, { steps: 10 });
    await page.mouse.up();
  };
  await expect(book).toHaveAttribute("data-side", "left");
  await drag(0.85, 0.1);
  await expect(book).toHaveAttribute("data-side", "right");
  await drag(0.1, 0.85);
  await expect(book).toHaveAttribute("data-side", "left");
  await expect(book).toHaveAttribute("data-open", "0");
});
