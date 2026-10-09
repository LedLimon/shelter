import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const port = Number(process.env.E2E_PORT ?? 3100);
// The standalone server binds to HOSTNAME, so pin it (CI runners set their own);
// `next dev` serves its HMR socket only to localhost.
const host = isCI ? "127.0.0.1" : "localhost";
const baseURL = `http://${host}:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // CI tests the production build (`pnpm build` runs in an earlier step);
    // locally the dev server is enough and needs no build.
    command: isCI
      ? "node .next/standalone/server.js"
      : `pnpm dev --port ${port}`,
    url: baseURL,
    env: { PORT: String(port), HOSTNAME: host },
    // Never reuse: another worktree's server on the same port would be tested instead.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
