import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}/`,
    // the first-visit tutorial (and its sample stickers) is left out; e2e/tutorial.spec.ts has it
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://localhost:${PORT}`,
          localStorage: [{ name: "sticker-notes:skip-tutorial", value: "1" }],
        },
      ],
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Pixel 7"] } },
    { name: "webkit", use: { ...devices["iPhone 15"] } },
  ],
  webServer: {
    command: `vp build && vp preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    env: { VITE_DEBUG: "1" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
