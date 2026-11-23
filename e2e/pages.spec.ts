/// <reference lib="dom" />
import { expect, test, type Page } from "@playwright/test";
import { receive, savedPositions, settledBox } from "./helpers.ts";

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

test("the + after the last page adds a page; an empty page can be removed", async ({ page }) => {
  await receive(page, "slime", SLIME);
  await expect(page.locator("[data-page]")).toHaveCount(1);
  await page.getByRole("button", { name: "ページを足す" }).click();
  await expect(page.locator("[data-page]")).toHaveCount(2);
  await page.getByRole("button", { name: "2ページ目を消す" }).click();
  await expect(page.locator("[data-page]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /ページ目を消す/ })).toHaveCount(0);
});

test("dropping a sticker on the + makes a new page for it", async ({ page }) => {
  await receive(page, "slime", SLIME);
  await receive(page, "discord", "Discord @pixel.trader");
  const from = await settledBox(page.getByRole("button", { name: SLIME, exact: true }));
  const vw = page.viewportSize()?.width ?? 400;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(vw - 6, from.y + from.height / 2, { steps: 10 });
  const slot = page.getByRole("button", { name: "ページを足す" });
  await expect
    .poll(async () => {
      const b = await slot.boundingBox();
      return b !== null && b.x + b.width / 2 < vw;
    })
    .toBe(true);
  const s = await slot.boundingBox();
  if (!s) throw new Error("no slot");
  await page.mouse.move(Math.min(s.x + s.width / 2, vw - 70), s.y + s.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator("[data-page]")).toHaveCount(2);
  await expect(
    page.locator("[data-page]").nth(1).getByRole("button", { name: SLIME, exact: true }),
  ).toHaveCount(1);
});

test("a sticker thrown off the page twice stays on the page edge", async ({ page }) => {
  await receive(page, "slime", SLIME);
  const sticker = page.getByRole("button", { name: SLIME, exact: true });
  for (let i = 0; i < 2; i++) {
    const b = await settledBox(sticker);
    const before = (await savedPositions(page))[0];
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, 2, { steps: 8 });
    await page.mouse.up();
    if (i === 0)
      await expect.poll(async () => (await savedPositions(page))[0]?.y).not.toBe(before?.y);
  }
  const pos = await onScreen(page, SLIME);
  expect(pos.cy).toBeCloseTo(0, 1);
  await expect(sticker).toBeInViewport();
});

for (const width of [320, 1200]) {
  test(`stickers keep their size and place relative to the page at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await receive(page, "slime", SLIME);
    await settledBox(page.getByRole("button", { name: SLIME, exact: true }));
    const pos = await onScreen(page, SLIME);
    expect(pos.size).toBeCloseTo((36 * 2) / 300, 3);
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
  expect(printed.size).toBeCloseTo(screen.size, 3);
  expect(printed.cx).toBeCloseTo(screen.cx, 2);
  expect(printed.cy).toBeCloseTo(screen.cy, 2);
});

test("Ctrl+P prints the album as it is, one A4 per page", async ({ page, browserName }) => {
  await receive(page, "slime", SLIME);
  await page.getByRole("button", { name: "ページを足す" }).click();
  await expect(page.locator("[data-page]")).toHaveCount(2);
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
