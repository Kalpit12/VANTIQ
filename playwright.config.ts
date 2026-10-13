import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3100",
    // Use a preinstalled Chromium when PLAYWRIGHT_CHROMIUM is set (CI images, cloud dev boxes).
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
  },
  webServer: {
    command: "pnpm --filter @vantiq/web build && pnpm --filter @vantiq/web exec next start -p 3100",
    url: "http://localhost:3100",
    timeout: 300_000,
    reuseExistingServer: true,
  },
});
