import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // A single `next dev` server backs every test, and each test spins up its
  // own real WebGL context. Running these in parallel oversubscribes the
  // GPU/CPU enough to blow past reasonable action timeouts on anything but
  // a beefy machine — serial execution is slower but deterministic.
  workers: 1,
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
