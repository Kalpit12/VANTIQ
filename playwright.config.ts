import { defineConfig } from "@playwright/test";

/**
 * Two copies of the app:
 * - demo: no database, built-in sample company (what a fresh deploy shows)
 * - workspace: Postgres, sign-in, imports. Uses E2E_DATABASE_URL, a database
 *   the tests may fill freely, owned by a non-superuser role.
 * `pnpm e2e` builds once, then both servers start from that build.
 */
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://vantiq:vantiq@localhost:5432/vantiq_e2e";
const launchOptions = process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  projects: [
    { name: "demo", testMatch: /smoke\.spec\.ts/, use: { baseURL: "http://localhost:3100", launchOptions } },
    { name: "workspace", testMatch: /workspace\.spec\.ts/, use: { baseURL: "http://localhost:3101", launchOptions } },
  ],
  webServer: [
    {
      command: "pnpm --filter @vantiq/web exec next start -p 3100",
      url: "http://localhost:3100",
      timeout: 120_000,
      reuseExistingServer: true,
      env: { DATABASE_URL: "" },
    },
    {
      command: "pnpm --filter @vantiq/db migrate && pnpm --filter @vantiq/web exec next start -p 3101",
      url: "http://localhost:3101/sign-in",
      timeout: 120_000,
      reuseExistingServer: true,
      env: { DATABASE_URL: E2E_DATABASE_URL, CRON_SECRET: "e2e-cron-secret" },
    },
  ],
});
