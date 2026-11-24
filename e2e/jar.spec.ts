/// <reference lib="dom" />
import { expect, test, type Page } from "@playwright/test";
import { serializeBackup } from "../src/core/backup.ts";
import { encodeBody, stickerIdOf } from "../src/core/payload.ts";
import { FIXTURES } from "../src/core/testing/fixtures.ts";
import { bigBackup } from "./backup-fixture.ts";

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

// hand-made sample art (no photos): the fixture slime in every palette
async function sampleBackup(count: number): Promise<string> {
  const slime = FIXTURES.slime;
  if (!slime) throw new Error("no fixture");
  const stickers = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const body = encodeBody({ ...slime, paletteId: i % 32, snsId: `sample_${i}` });
      return {
        id: await stickerIdOf(body),
        body,
        origin: "received" as const,
        receivedAt: "2026-11-23",
      };
    }),
  );
  return serializeBackup({ stickers, pages: [], placements: [] }, new Date());
}

const paintedPixels = (page: Page) =>
  page.locator("canvas[data-blocks]").evaluate((c: HTMLCanvasElement) => {
    const data = c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data ?? [];
    return data.filter((v, i) => i % 4 === 3 && v > 0).length;
  });

test("jar: toggle, blocks settle, back to the album", async ({ page }) => {
  await importStickers(page, 20);
  await page.getByRole("button", { name: "瓶で見る" }).click();
  const canvas = page.locator("canvas[data-blocks]");
  await expect(canvas).toHaveAttribute("data-blocks", "20");
  await expect(
    page.getByRole("list", { name: "瓶の中のステッカー" }).getByRole("listitem"),
  ).toHaveCount(20);
  await expect(canvas).toHaveAttribute("data-state", "settled", { timeout: 15_000 });
  expect(await paintedPixels(page)).toBeGreaterThan(1000);

  await page.getByRole("button", { name: "振る" }).click();
  await expect(canvas).toHaveAttribute("data-state", "moving");
  await expect(canvas).toHaveAttribute("data-state", "settled", { timeout: 20_000 });

  await page.getByRole("button", { name: "シール帳で見る" }).click();
  await expect(canvas).toHaveCount(0);
  await expect(page.getByRole("button", { name: "瓶で見る" })).toBeVisible();
});

test("jar: reduced motion renders a static pile", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await importStickers(page, 20);
  await page.getByRole("button", { name: "瓶で見る" }).click();
  const canvas = page.locator("canvas[data-blocks]");
  await expect(canvas).toHaveAttribute("data-state", "still");
  expect(await paintedPixels(page)).toBeGreaterThan(1000);
  await expect(page.getByRole("button", { name: "振る" })).toHaveCount(0);
});

test("jar: screenshot with sample art", async ({ page }, info) => {
  test.skip(!process.env.JAR_PERF || info.project.name !== "chromium");
  await importJson(page, await sampleBackup(30), 30);
  await page.getByRole("button", { name: "瓶で見る" }).click();
  await expect(page.locator("canvas[data-blocks]")).toHaveAttribute("data-state", "settled", {
    timeout: 30_000,
  });
  await page.screenshot({ path: "docs/images/spike-jar-sample.png", scale: "css" });
});

type Stats = { frames: number; workMs: number; worstMs: number; steps: number };
type Probe = { __jarStats: Stats; __gaps: number[]; __last?: number };

// Spike measurements (headless desktop numbers, not phone numbers): run with JAR_PERF=1.
for (const count of [20, 100, 300]) {
  test(`jar perf ${count}`, async ({ page }, info) => {
    test.skip(!process.env.JAR_PERF || info.project.name !== "chromium");
    test.setTimeout(120_000);
    await importStickers(page, count);
    await page.evaluate(() => {
      const w = window as unknown as Probe;
      w.__gaps = [];
      const tick = (t: number) => {
        if (w.__last !== undefined) w.__gaps.push(t - w.__last);
        w.__last = t;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.getByRole("button", { name: "瓶で見る" }).click();
    const canvas = page.locator("canvas[data-blocks]");
    const t0 = Date.now();
    await expect(canvas).toHaveAttribute("data-state", "settled", { timeout: 60_000 });
    const settleMs = Date.now() - t0;
    const first = await page.evaluate(() => {
      const w = window as unknown as Probe;
      const s = { ...w.__jarStats, worstGap: Math.max(...w.__gaps) };
      w.__jarStats.frames = 0;
      w.__jarStats.workMs = 0;
      w.__jarStats.worstMs = 0;
      w.__jarStats.steps = 0;
      w.__gaps = [];
      return s;
    });
    if (count > 20) {
      await page.screenshot({ path: `docs/images/spike-jar-${count}.png`, scale: "css" });
    }
    await page.getByRole("button", { name: "振る" }).click();
    await expect(canvas).toHaveAttribute("data-state", "settled", { timeout: 60_000 });
    const r = await page.evaluate(() => {
      const w = window as unknown as Probe;
      return { ...w.__jarStats, worstGap: Math.max(...w.__gaps) };
    });
    const fmt = (s: Stats & { worstGap: number }) =>
      `frames=${s.frames} steps=${s.steps} avgWork=${(s.workMs / s.frames).toFixed(2)}ms worstWork=${s.worstMs.toFixed(1)}ms worstRafGap=${s.worstGap.toFixed(1)}ms`;
    console.log(`JARPERF n=${count} drop(${settleMs}ms): ${fmt(first)} | shake: ${fmt(r)}`);
  });
}
