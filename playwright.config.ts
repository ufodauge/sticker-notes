import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}/` },
  projects: [
    { name: "chromium", use: { ...devices["Pixel 7"] } },
    { name: "webkit", use: { ...devices["iPhone 15"] } },
  ],
  webServer: {
    command: `vp build && vp preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    env: { VITE_JAR_PROBE: "1" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
