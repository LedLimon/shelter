import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// The e2e users are created in the app's database (e2e/global-setup.ts):
// locally its URL and BETTER_AUTH_SECRET are in .env, like for `pnpm dev`.
// Variables already set in the shell (CI) win.
if (existsSync(".env")) process.loadEnvFile(".env");

const isCI = Boolean(process.env.CI);
const port = Number(process.env.E2E_PORT ?? 3100);
// The standalone server binds to HOSTNAME, so pin it (CI runners set their own);
// `next dev` serves its HMR socket only to localhost.
const host = isCI ? "127.0.0.1" : "localhost";
// E2E_BASE_URL points the tests at a server that is already running
// (Next.js refuses a second `next dev` in the same checkout).
const externalBaseURL = process.env.E2E_BASE_URL;
const baseURL = externalBaseURL ?? `http://${host}:${port}`;
// The /dev showcases (components, letters) exist only in `next dev`. CI tests
// the production build, so it starts a dev server next to it for the
// showcase project.
const devPort = port + 1;
const showcaseBaseURL =
  externalBaseURL ?? (isCI ? `http://localhost:${devPort}` : baseURL);
const SHOWCASE_SPEC = /dev-(ui|email)\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
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
    {
      name: "desktop",
      testIgnore: SHOWCASE_SPEC,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      testIgnore: SHOWCASE_SPEC,
      // The project's reference phone width is 375 px (docs/testing.md).
      use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } },
    },
    {
      name: "showcase",
      testMatch: SHOWCASE_SPEC,
      use: { ...devices["Desktop Chrome"], baseURL: showcaseBaseURL },
    },
  ],
  webServer: externalBaseURL
    ? undefined
    : [
        {
          // CI tests the production build (`pnpm build` runs in an earlier step);
          // locally the dev server is enough and needs no build.
          command: isCI
            ? "node .next/standalone/server.js"
            : `pnpm dev --port ${port}`,
          url: baseURL,
          // APP_URL is the only origin Better Auth accepts sign-in from.
          // Payments go through the emulator, whatever .env says: e2e never
          // talks to a real provider.
          env: {
            PORT: String(port),
            HOSTNAME: host,
            APP_URL: baseURL,
            PAYMENT_PROVIDER: "fake",
          },
          // Never reuse: another worktree's server on the same port would be tested instead.
          reuseExistingServer: false,
          timeout: 120_000,
        },
        ...(isCI
          ? [
              {
                command: `pnpm dev --port ${devPort}`,
                url: showcaseBaseURL,
                reuseExistingServer: false,
                timeout: 120_000,
              },
            ]
          : []),
      ],
});
