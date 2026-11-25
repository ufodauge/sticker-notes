import { expect, test, type Page } from "@playwright/test";
import { shapesBackup } from "./jar-fixtures.ts";

// Measurement, not a check: JAR_PHYSICS=1 vp exec playwright test e2e/jar-physics.perf.spec.ts
// --project=chromium --workers=1 --repeat-each=5, then read the JAR_PHYSICS lines.
test.skip(!process.env.JAR_PHYSICS, "measurement only (JAR_PHYSICS=1)");

const COUNT = 40;
const SETTLE_CAP_MS = 150_000;
const TREMBLE_AT_MS = 20_000;

const canvasOf = (page: Page) => page.locator("canvas[data-blocks]");

const probe = (page: Page) =>
  canvasOf(page).evaluate((c: HTMLCanvasElement) => ({
    state: c.dataset.state ?? "",
    steps: Number(c.dataset.steps ?? 0),
    physicsMs: Number(c.dataset.physicsMs ?? 0),
    queue: Number(c.dataset.queue ?? 0),
    awake: Number(c.dataset.awake ?? 0),
    leaked: Number(c.dataset.leaked ?? 0),
    speeds: c.dataset.speeds ?? "",
    physics: c.dataset.physics ?? "",
  }));

const trembling = (speeds: string) =>
  speeds
    .split(",")
    .filter(Boolean)
    .map((s) => s.split("/").map(Number))
    .filter(([v = 0, w = 0]) => w > 1 && v < 0.3).length;

test("jar physics: settle, tremble, leak and cost with 40 blocks", async ({
  page,
  browserName,
}, info) => {
  test.skip(browserName !== "chromium", "software WebGL is only dependable in Chromium");
  test.setTimeout(330_000);
  await page.goto("/");
  await page.getByRole("button", { name: "メニュー" }).click();
  await page.getByLabel("読み込む").setInputFiles({
    name: "b.json",
    mimeType: "application/json",
    buffer: Buffer.from(await shapesBackup(COUNT)),
  });
  await expect(page.getByRole("status")).toContainText(`${COUNT}枚を貼った`, { timeout: 30_000 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "瓶で見る" }).click();
  await expect(canvasOf(page)).toHaveAttribute("data-renderer", "webgl");
  const t0 = Date.now();
  const result = {
    physics: "",
    settleSteps: null as number | null,
    trembling: null as number | null,
    awakeAt20s: null as number | null,
    msPerStep: 0,
    leaked: 0,
    leakedAwake: 0,
  };
  for (;;) {
    const p = await probe(page);
    result.physics = p.physics;
    const elapsed = Date.now() - t0;
    if (result.trembling === null && elapsed >= TREMBLE_AT_MS) {
      result.trembling = trembling(p.speeds);
      result.awakeAt20s = p.awake;
    }
    if (p.state === "settled" && p.queue === 0) {
      result.settleSteps = p.steps;
      result.msPerStep = p.physicsMs / Math.max(1, p.steps);
      break;
    }
    if (elapsed > SETTLE_CAP_MS) {
      result.msPerStep = p.physicsMs / Math.max(1, p.steps);
      break;
    }
    await page.waitForTimeout(250);
  }
  if (result.trembling === null) {
    result.trembling = 0;
    result.awakeAt20s = 0;
  }
  await page.screenshot({ path: info.outputPath("settled.png") });
  for (const _ of Array.from({ length: 10 })) {
    await page.getByRole("button", { name: "振る" }).click();
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(8000);
  const after = await probe(page);
  result.leaked = after.leaked;
  result.leakedAwake = after.awake;
  await page.screenshot({ path: info.outputPath("shaken.png") });
  console.log(`JAR_PHYSICS ${JSON.stringify(result)}`);
});
