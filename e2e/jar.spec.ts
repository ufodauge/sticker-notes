/// <reference lib="dom" />
import { expect, test, type Page } from "@playwright/test";
import { distanceToWall, insideJar, jarGeometry } from "../src/core/jar-geometry.ts";
import { JAR_DEFAULT_COUNT, JAR_MAX_COUNT } from "../src/core/jar-selection.ts";
import { bigBackup } from "./backup-fixture.ts";
import { shapesBackup } from "./jar-fixtures.ts";

type Probe = {
  stats: { frames: number; workMs: number; worstMs: number; steps: number };
  reset: () => void;
  blocks: () => { x: number; y: number; side: number; id: string }[];
  size: () => { width: number; height: number };
  parts: () => number;
  rescued: () => number;
  awake: () => { x: number; y: number; speed: number; spin: number }[];
  tier: () => number;
  pinTier: (tier: number | null) => void;
  frozen: () => number;
};
type Win = { __jarProbe?: Probe; __jarStress?: () => void };

const canvasOf = (page: Page) => page.locator("canvas[data-blocks]");
const toggleToJar = (page: Page) => page.getByRole("button", { name: "瓶で見る" });
const toggleToAlbum = (page: Page) => page.getByRole("button", { name: "シール帳で見る" });

async function importJson(page: Page, json: string, count: number): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "メニュー" }).click();
  await page
    .getByLabel("読み込む")
    .setInputFiles({ name: "b.json", mimeType: "application/json", buffer: Buffer.from(json) });
  await expect(page.getByRole("status")).toContainText(`${count}枚を貼った`, { timeout: 30_000 });
  await page.keyboard.press("Escape");
}

const importStickers = async (page: Page, count: number) =>
  importJson(page, await bigBackup(count, 0), count);

async function openJar(page: Page, count: number): Promise<void> {
  await importStickers(page, count);
  await toggleToJar(page).click();
  await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 30_000 });
}

const probeBlocks = (page: Page) =>
  page.evaluate(() => (window as unknown as Win).__jarProbe?.blocks() ?? []);

// every block's centre is inside the jar's inner outline (rounded bottom corners included),
// and clear of the glass by at least a third of its side
async function expectInsideJar(page: Page): Promise<void> {
  const size = await page.evaluate(() => (window as unknown as Win).__jarProbe?.size());
  expect(size?.width).toBeGreaterThan(0);
  const geo = jarGeometry(size?.width ?? 0, size?.height ?? 0);
  for (const b of await probeBlocks(page)) {
    expect(insideJar(geo, b.x, b.y), `${b.id} at ${b.x},${b.y}`).toBe(true);
    expect(distanceToWall(geo, b.x, b.y)).toBeGreaterThan(b.side / 3);
  }
}

const shownIds = async (page: Page) => (await probeBlocks(page)).map((b) => b.id).toSorted();

const paintedPixels = (page: Page) =>
  canvasOf(page).evaluate((c: HTMLCanvasElement) => {
    const data = c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data ?? [];
    return data.filter((v, i) => i % 4 === 3 && v > 0).length;
  });

test("jar: toggle, blocks settle, shake, back to the album", async ({ page }) => {
  await importStickers(page, 20);
  await toggleToJar(page).click();
  const canvas = canvasOf(page);
  await expect(canvas).toHaveAttribute("data-blocks", "20");
  await expect(
    page.getByRole("list", { name: "瓶の中のステッカー" }).getByRole("listitem"),
  ).toHaveCount(20);
  await expect(canvas).toHaveAttribute("data-state", "settled", { timeout: 30_000 });
  expect(await paintedPixels(page)).toBeGreaterThan(1000);
  expect(await probeBlocks(page)).toHaveLength(20);
  await expectInsideJar(page);

  await page.getByRole("button", { name: "振る" }).click();
  await expect(canvas).toHaveAttribute("data-state", "moving");
  await expect(canvas).toHaveAttribute("data-state", "settled", { timeout: 30_000 });
  await expectInsideJar(page);

  await toggleToAlbum(page).click();
  await expect(canvas).toHaveCount(0);
  await expect(page.locator("[data-scroller]")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "操作" })).toBeVisible();
  await expect(toggleToJar(page)).toBeVisible();
});

test("jar: the toggle is hidden while the album is empty", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "メニュー" })).toBeVisible();
  await expect(toggleToJar(page)).toHaveCount(0);
  await expect(toggleToAlbum(page)).toHaveCount(0);
});

const savedView = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<unknown>((resolve) => {
        const open = indexedDB.open("sticker-notes");
        open.onsuccess = () => {
          const q = open.result.transaction("settings").objectStore("settings").get("view");
          q.onsuccess = () => {
            open.result.close();
            resolve(q.result?.value);
          };
        };
      }),
  );

test("jar: the saved mode survives a reload without showing the album first", async ({ page }) => {
  await importStickers(page, 12);
  await toggleToJar(page).click();
  await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 30_000 });
  await expect.poll(() => savedView(page)).toBe("jar");
  await page.addInitScript(() => {
    const w = window as unknown as { __sawAlbum: boolean };
    w.__sawAlbum = false;
    new MutationObserver(() => {
      if (document.querySelector("[data-scroller]")) w.__sawAlbum = true;
    }).observe(document, { childList: true, subtree: true });
  });
  await page.reload();
  await expect(page.getByRole("region", { name: "瓶" })).toBeVisible();
  await expect(canvasOf(page)).toHaveAttribute("data-blocks", "12");
  expect(await page.evaluate(() => (window as unknown as { __sawAlbum: boolean }).__sawAlbum)).toBe(
    false,
  );
  await expect(toggleToAlbum(page)).toBeVisible();

  await toggleToAlbum(page).click();
  await expect.poll(() => savedView(page)).toBe("album");
  await page.reload();
  await expect(page.locator("[data-scroller]")).toBeVisible();
  await expect(canvasOf(page)).toHaveCount(0);
});

test("jar: the jar code is requested only after the first switch", async ({ page }) => {
  const scripts: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "script") scripts.push(new URL(r.url()).pathname);
  });
  await importStickers(page, 5);
  await expect(page.locator("[data-scroller]")).toBeVisible();
  const isJarChunk = (p: string) => /\/assets\/Jar-/.test(p);
  expect(scripts.filter(isJarChunk)).toEqual([]);

  await toggleToJar(page).click();
  await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 30_000 });
  expect(scripts.filter(isJarChunk).length).toBeGreaterThan(0);
});

test("jar: the empty outline shows while the jar code loads", async ({ page }) => {
  await importStickers(page, 5);
  await page.route(/\/assets\/Jar-.*\.js/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });
  await toggleToJar(page).click();
  await expect(page.getByRole("region", { name: "瓶" })).toBeVisible();
  await expect(canvasOf(page)).toHaveCount(0);
  await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 30_000 });
});

test("jar: reduced motion renders a static pile", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await importStickers(page, 20);
  await toggleToJar(page).click();
  const canvas = canvasOf(page);
  await expect(canvas).toHaveAttribute("data-state", "still");
  expect(await paintedPixels(page)).toBeGreaterThan(1000);
  expect(await probeBlocks(page)).toHaveLength(20);
  await expectInsideJar(page);
  await expect(page.getByRole("button", { name: "振る" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "傾きで動かす" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "選ぶ" })).toBeVisible();
});

const jarWidth = (page: Page) =>
  page.evaluate(() => (window as unknown as Win).__jarProbe?.size().width ?? 0);

async function resizeAndSettle(page: Page, width: number, height: number): Promise<void> {
  const before = await jarWidth(page);
  await page.setViewportSize({ width, height });
  await expect.poll(() => jarWidth(page)).not.toBe(before);
  await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 30_000 });
}

test("jar: a resize keeps the pile inside the jar", async ({ page }) => {
  await openJar(page, 30);
  const before = await shownIds(page);
  expect(before).toHaveLength(30);

  await resizeAndSettle(page, 330, 560);
  await expectInsideJar(page);
  expect(await shownIds(page)).toEqual(before);

  await resizeAndSettle(page, 500, 900);
  await expectInsideJar(page);
  expect(await shownIds(page)).toEqual(before);
});

test("jar: tapping a block opens the action bar; discarding removes the block", async ({
  page,
}) => {
  await openJar(page, 12);
  const top = (await probeBlocks(page)).toSorted((a, b) => a.y - b.y)[0];
  const box = await canvasOf(page).boundingBox();
  if (!top || !box) throw new Error("no block");
  await page.mouse.click(box.x + top.x, box.y + top.y);
  await expect(page.getByRole("toolbar")).toBeVisible();
  await page.getByRole("button", { name: "捨てる" }).click();
  await expect(canvasOf(page)).toHaveAttribute("data-blocks", "11");
  await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 30_000 });
  expect((await shownIds(page)).includes(top.id)).toBe(false);
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(canvasOf(page)).toHaveAttribute("data-blocks", "12");
  await expect(page.getByRole("toolbar")).toHaveCount(0);
});

test("jar: shows a limited random set; shuffle changes it; reload keeps it", async ({ page }) => {
  // two settles of 40 blocks take about 25s on the headless WebKit of a busy machine
  test.setTimeout(60_000);
  await openJar(page, JAR_DEFAULT_COUNT + 25);
  await expect(canvasOf(page)).toHaveAttribute("data-blocks", String(JAR_DEFAULT_COUNT));
  await expect(
    page.getByRole("list", { name: "瓶の中のステッカー" }).getByRole("listitem"),
  ).toHaveCount(JAR_DEFAULT_COUNT);
  const first = await shownIds(page);
  expect(first).toHaveLength(JAR_DEFAULT_COUNT);

  await page.getByRole("button", { name: "シャッフル" }).click();
  await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 30_000 });
  await expect.poll(() => shownIds(page)).not.toEqual(first);
  const second = await shownIds(page);
  expect(second).toHaveLength(JAR_DEFAULT_COUNT);

  await page.reload();
  await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 30_000 });
  expect(await shownIds(page)).toEqual(second);
});

test("jar: the picker chooses blocks, caps at the maximum and goes back to random", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const total = JAR_MAX_COUNT + 10;
  await openJar(page, total);
  const counter = page.getByRole("status").filter({ hasText: " / " });

  await page.getByRole("button", { name: "選ぶ" }).click();
  const dialog = page.getByRole("dialog", { name: "瓶に入れるステッカー" });
  await expect(dialog).toBeVisible();
  await expect(counter).toHaveText(`${JAR_DEFAULT_COUNT} / ${JAR_MAX_COUNT}`);
  await expect(dialog.getByRole("checkbox")).toHaveCount(total);
  await expect(dialog.getByRole("button", { name: "ランダムに戻す" })).toHaveCount(0);

  const unchecked = dialog.getByRole("checkbox", { checked: false });
  const toAdd = JAR_MAX_COUNT - JAR_DEFAULT_COUNT;
  for (let i = 0; i < toAdd; i++) await unchecked.first().check();
  await expect(counter).toHaveText(`${JAR_MAX_COUNT} / ${JAR_MAX_COUNT}`);
  await expect(unchecked.first()).toBeDisabled();
  await dialog.getByRole("checkbox", { checked: true }).first().uncheck();
  await expect(unchecked.first()).toBeEnabled();
  await expect(counter).toHaveText(`${JAR_MAX_COUNT - 1} / ${JAR_MAX_COUNT}`);

  const chosen = await dialog.getByRole("checkbox", { checked: true }).count();
  await dialog.getByRole("button", { name: "瓶に入れる" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(canvasOf(page)).toHaveAttribute("data-blocks", String(chosen));
  await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 60_000 });
  const manual = await shownIds(page);
  expect(manual).toHaveLength(chosen);

  await page.reload();
  await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 60_000 });
  expect(await shownIds(page)).toEqual(manual);

  await page.getByRole("button", { name: "選ぶ" }).click();
  await page
    .getByRole("dialog", { name: "瓶に入れるステッカー" })
    .getByRole("button", { name: "ランダムに戻す" })
    .click();
  await expect(canvasOf(page)).toHaveAttribute("data-blocks", String(JAR_DEFAULT_COUNT));
});

test("jar: unchecking blocks makes them disappear without rebuilding the pile", async ({
  page,
}) => {
  await openJar(page, 20);
  const before = await probeBlocks(page);
  await page.getByRole("button", { name: "選ぶ" }).click();
  const dialog = page.getByRole("dialog", { name: "瓶に入れるステッカー" });
  await dialog.getByRole("checkbox", { checked: true }).first().uncheck();
  await dialog.getByRole("button", { name: "瓶に入れる" }).click();
  await expect(canvasOf(page)).toHaveAttribute("data-blocks", "19");
  await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 30_000 });
  const after = await probeBlocks(page);
  expect(after).toHaveLength(19);
  const stillThere = new Set(after.map((b) => b.id));
  expect(before.filter((b) => stillThere.has(b.id))).toHaveLength(19);
});

test("jar: screenshot of the lit jar", async ({ page }, info) => {
  await importJson(page, await shapesBackup(20), 20);
  await toggleToJar(page).click();
  await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 30_000 });
  await page.screenshot({ path: info.outputPath("jar-dark.png"), scale: "css" });
});

// Measurements (headless desktop numbers, not phone numbers): run with JAR_PERF=1.
for (const count of [20, 40, 120, 300]) {
  test(`jar perf ${count}`, async ({ page }, info) => {
    test.skip(!process.env.JAR_PERF || info.project.name !== "chromium");
    test.setTimeout(240_000);
    await importJson(page, await shapesBackup(count), count);
    await toggleToJar(page).click();
    await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 60_000 });
    if (count > JAR_DEFAULT_COUNT) {
      await page.evaluate(() => (window as unknown as Win).__jarStress?.());
      await expect(canvasOf(page)).toHaveAttribute("data-blocks", String(count));
      await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 120_000 });
    }
    const lines: string[] = [];
    for (const tier of [0, 1, 2, 3]) {
      await page.evaluate((t) => {
        const p = (window as unknown as Win).__jarProbe;
        p?.pinTier(t);
        p?.reset();
      }, tier);
      await page.getByRole("button", { name: "振る" }).click();
      await expect(canvasOf(page)).toHaveAttribute("data-state", "moving");
      await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 120_000 });
      const s = await page.evaluate(() => (window as unknown as Win).__jarProbe?.stats);
      const frozen = await page.evaluate(() => (window as unknown as Win).__jarProbe?.frozen());
      const parts = await page.evaluate(() => (window as unknown as Win).__jarProbe?.parts());
      lines.push(
        `tier=${tier} parts=${parts} frames=${s?.frames} steps=${s?.steps} avgWork=${((s?.workMs ?? 0) / Math.max(1, s?.frames ?? 1)).toFixed(2)}ms worstWork=${s?.worstMs.toFixed(1)}ms frozen=${frozen}`,
      );
    }
    console.log(`JARPERF n=${count}\n${lines.join("\n")}`);
  });
}
