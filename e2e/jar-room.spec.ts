/// <reference lib="dom" />
import { expect, test, type Page } from "@playwright/test";
import { bigBackup } from "./backup-fixture.ts";

// The jar is a dark room whatever the system theme, and it has a (synthesized) sound.

type AudioStats = {
  created: number;
  resumed: number;
  suspended: number;
  closed: number;
  bufferSources: number;
};
type Win = { __audio: AudioStats; __viewLog: (string | null)[] };

const canvasOf = (page: Page) => page.locator("canvas[data-blocks]");
const toggleToJar = (page: Page) => page.getByRole("button", { name: "瓶で見る" });
const toggleToAlbum = (page: Page) => page.getByRole("button", { name: "シール帳で見る" });
const speaker = (page: Page) => page.getByRole("button", { name: "音", exact: true });

const audio = (page: Page) => page.evaluate(() => (window as unknown as Win).__audio);
// every voice starts one noise burst; the silent unlock sample is the only other buffer source
const voices = async (page: Page) => Math.max(0, (await audio(page)).bufferSources - 1);

// A stand-in for Web Audio that only counts. Like a browser, it starts suspended until resumed.
async function mockAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const stats = { created: 0, resumed: 0, suspended: 0, closed: 0, bufferSources: 0 };
    (window as unknown as Win).__audio = stats;
    const param = () => ({
      value: 0,
      setValueAtTime() {},
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {},
    });
    const node = (extra: object = {}) => {
      const n = {
        gain: param(),
        frequency: param(),
        threshold: param(),
        knee: param(),
        ratio: param(),
        attack: param(),
        release: param(),
        Q: param(),
        onended: null as null | (() => void),
        connect: (to: unknown) => to,
        disconnect() {},
        start() {},
        stop() {
          setTimeout(() => n.onended?.(), 5);
        },
        ...extra,
      };
      return n;
    };
    class MockAudioContext {
      state = "suspended";
      sampleRate = 44100;
      currentTime = 0;
      destination = node();
      constructor() {
        stats.created++;
      }
      createGain = () => node();
      createDynamicsCompressor = () => node();
      createBiquadFilter = () => node();
      createOscillator = () => node();
      createBufferSource = () => {
        stats.bufferSources++;
        return node();
      };
      createBuffer = (_: number, length: number) => ({
        getChannelData: () => new Float32Array(length),
      });
      resume = async () => {
        stats.resumed++;
        this.state = "running";
      };
      suspend = async () => {
        stats.suspended++;
        this.state = "suspended";
      };
      close = async () => {
        stats.closed++;
        this.state = "closed";
      };
    }
    Object.assign(window, { AudioContext: MockAudioContext, webkitAudioContext: MockAudioContext });
  });
}

async function importStickers(page: Page, count: number): Promise<void> {
  await page.goto("/?jar=2d");
  await page.getByRole("button", { name: "メニュー" }).click();
  await page.getByLabel("読み込む").setInputFiles({
    name: "b.json",
    mimeType: "application/json",
    buffer: Buffer.from(await bigBackup(count, 0)),
  });
  await expect(page.getByRole("status")).toContainText(`${count}枚を貼った`, { timeout: 30_000 });
  await page.keyboard.press("Escape");
}

async function openJar(page: Page, count = 12): Promise<void> {
  await importStickers(page, count);
  await toggleToJar(page).click();
  await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 30_000 });
}

// the setting is written asynchronously: wait for it before reloading
const savedSound = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<unknown>((resolve) => {
        const open = indexedDB.open("sticker-notes");
        open.onsuccess = () => {
          const q = open.result.transaction("settings").objectStore("settings").get("sound");
          q.onsuccess = () => {
            open.result.close();
            resolve(q.result?.value);
          };
        };
      }),
  );

const colours = (page: Page) =>
  page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    const theme = document.querySelector('meta[name="theme-color"]')?.getAttribute("content");
    return {
      scheme: root.colorScheme,
      background: body.backgroundColor,
      ink: body.color,
      theme,
      view: document.documentElement.dataset.view ?? null,
    };
  });

for (const system of ["light", "dark"] as const) {
  test(`jar room: dark when the system is ${system}; the album keeps the system theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: system });
    await importStickers(page, 12);
    const album = await colours(page);
    expect(album.view).toBeNull();
    expect(album.scheme).toBe("light dark");
    expect(album.background).toBe(system === "light" ? "rgb(255, 255, 255)" : "rgb(20, 20, 20)");

    await toggleToJar(page).click();
    await expect(canvasOf(page)).toHaveAttribute("data-blocks", "12");
    const jar = await colours(page);
    expect(jar).toMatchObject({
      view: "jar",
      scheme: "dark",
      background: "rgb(8, 8, 10)",
      ink: "rgb(230, 228, 223)",
      theme: "#08080a",
    });

    await toggleToAlbum(page).click();
    await expect(page.locator("[data-scroller]")).toBeVisible();
    expect(await colours(page)).toEqual(album);
  });
}

test("jar room: dialogs opened in the jar are dark too, and the QR stays white", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openJar(page);
  await page.getByRole("button", { name: "選ぶ" }).click();
  const dialog = page.getByRole("dialog", { name: "瓶に入れるステッカー" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("background-color", "rgb(8, 8, 10)");
  await expect(dialog).toHaveCSS("color", "rgb(230, 228, 223)");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: "メニュー" }).click();
  await expect(page.getByRole("dialog").first()).toHaveCSS("background-color", "rgb(8, 8, 10)");
  await page.keyboard.press("Escape");
  // the album's colours are back once the jar is left, dialogs included
  await toggleToAlbum(page).click();
  await page.getByRole("button", { name: "メニュー" }).click();
  await expect(page.getByRole("dialog").first()).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
});

test("jar room: a reload in the jar is dark from the first frame, never the album's colours", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openJar(page);
  await page.addInitScript(() => {
    const w = window as unknown as Win;
    w.__viewLog = [];
    const log = () => w.__viewLog.push(document.documentElement?.dataset.view ?? null);
    log();
    // the root element does not exist yet when this runs: watch the whole document
    new MutationObserver(log).observe(document, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-view"],
    });
  });
  await page.reload();
  await expect(canvasOf(page)).toHaveAttribute("data-blocks", "12");
  const log = await page.evaluate(() => (window as unknown as Win).__viewLog);
  // set by the early script; it never goes away and comes back while the jar boots
  expect(log.filter((v) => v === "jar").length).toBeGreaterThan(0);
  expect(log.slice(log.indexOf("jar")).every((v) => v === "jar")).toBe(true);
  expect((await colours(page)).background).toBe("rgb(8, 8, 10)");
});

test("jar room: the speaker button toggles and is remembered across a reload", async ({ page }) => {
  await openJar(page);
  const button = speaker(page);
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => savedSound(page)).toBe(false);

  await page.reload();
  await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 30_000 });
  await expect(speaker(page)).toHaveAttribute("aria-pressed", "false");
  await speaker(page).click();
  await expect(speaker(page)).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => savedSound(page)).toBe(true);
  await page.reload();
  await expect(speaker(page)).toHaveAttribute("aria-pressed", "true");
});

test("jar room: reduced motion has no speaker button and never opens the audio", async ({
  page,
}) => {
  await mockAudio(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await importStickers(page, 12);
  await toggleToJar(page).click();
  await expect(canvasOf(page)).toHaveAttribute("data-state", "still");
  await expect(speaker(page)).toHaveCount(0);
  expect((await audio(page)).created).toBe(0);
});

test("jar sound: lazy, gesture-started, rate-limited and closed when the jar is left", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await mockAudio(page);
  await importStickers(page, 20);
  // nothing touches the audio before the first jar gesture
  expect((await audio(page)).created).toBe(0);

  await toggleToJar(page).click();
  await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 30_000 });
  expect((await audio(page)).created).toBe(1);
  expect((await audio(page)).resumed).toBeGreaterThan(0);
  const poured = await voices(page);
  expect(poured).toBeGreaterThan(0);

  // a settled pile is silent
  await page.waitForTimeout(500);
  expect(await voices(page)).toBe(poured);

  await page.getByRole("button", { name: "振る" }).click();
  await expect(canvasOf(page)).toHaveAttribute("data-state", "moving");
  await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 30_000 });
  const shaken = (await voices(page)) - poured;
  expect(shaken).toBeGreaterThan(0);
  // gaps per voice class and a rattle of a dozen ticks per pulse: far fewer than the contacts
  expect(shaken).toBeLessThanOrEqual(400);

  // the page going to the background silences it, coming back wakes it
  const before = await audio(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(async () => (await audio(page)).suspended).toBe(before.suspended + 1);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(async () => (await audio(page)).resumed).toBe(before.resumed + 1);

  await toggleToAlbum(page).click();
  await expect.poll(async () => (await audio(page)).closed).toBe(1);
  expect((await audio(page)).created).toBe(1);
});

test("jar sound: a reloaded jar is silent until the first gesture; off stays off", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await mockAudio(page);
  await openJar(page, 12);
  await page.reload();
  await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 30_000 });
  expect((await audio(page)).created).toBe(0);
  await page.getByRole("button", { name: "振る" }).click();
  await expect.poll(async () => (await audio(page)).created).toBe(1);
  await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 30_000 });

  // switched off: the context is released and a shake makes no new one
  await speaker(page).click();
  await expect.poll(async () => (await audio(page)).closed).toBe(1);
  await page.getByRole("button", { name: "振る" }).click();
  await expect(canvasOf(page)).toHaveAttribute("data-state", "settled", { timeout: 30_000 });
  expect((await audio(page)).created).toBe(1);

  // switched on again: it is a gesture, so the audio opens right away
  await speaker(page).click();
  await expect.poll(async () => (await audio(page)).created).toBe(2);
});
