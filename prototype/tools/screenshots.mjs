// Takes the screenshots in prototype/screenshots from the built prototype.
// Needs the project's dev dependencies and the Playwright browser:
//
//   node prototype/build.mjs && node prototype/tools/screenshots.mjs
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "screenshots");

const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 375, height: 812 };

const signIn = async (page) => {
  await page.goto(`${page.url().split("#")[0]}#/admin/login`);
  await page.click("#login-next");
  await page.click("#login-enter");
  await page.waitForSelector(".admin-nav");
};

/** name, route, viewport, theme, and what to do on the page before the shot. */
const SHOTS = [
  { name: "hub-desktop-light", route: "#/", size: DESKTOP },
  { name: "home-desktop-light", route: "#/home", size: DESKTOP },
  { name: "home-desktop-dark", route: "#/home", size: DESKTOP, dark: true },
  { name: "home-mobile-light", route: "#/home", size: MOBILE },
  { name: "home-mobile-dark", route: "#/home", size: MOBILE, dark: true },
  {
    name: "home-notes-desktop-light",
    route: "#/home",
    size: DESKTOP,
    before: async (page) => {
      await page.click("label[for=notes-switch]");
      await page.locator("#urgent-title").scrollIntoViewIfNeeded();
      await page.mouse.wheel(0, 260);
    },
  },
  {
    name: "donate-sheet-mobile-light",
    route: "#/needs/buran-surgery",
    size: MOBILE,
    before: async (page) => {
      await page.click("#tab-buran-surgery-100000-hero");
      await page.waitForSelector(".layer-panel");
    },
  },
  {
    name: "thanks-overpay-mobile-light",
    route: "#/needs/buran-surgery",
    size: MOBILE,
    before: async (page) => {
      await page.click("#tab-buran-surgery-100000-hero");
      await page.check("#donate-offer");
      await page.click("#donate-submit");
      await page.click("#pay-race");
      await page.waitForSelector(".ok");
    },
  },
  { name: "dog-profile-mobile-light", route: "#/dogs/marta", size: MOBILE },
  {
    name: "adopt-sheet-mobile-dark",
    route: "#/dogs/marta",
    size: MOBILE,
    dark: true,
    before: async (page) => {
      await page.click("#adopt-marta-profile");
      await page.waitForSelector(".channels");
    },
  },
  {
    name: "ledger-desktop-light",
    route: "#/transparency/ledger",
    size: DESKTOP,
  },
  { name: "map-desktop-light", route: "#/map?zone=a", size: DESKTOP },
  {
    name: "admin-need-desktop-light",
    route: "#/admin/needs/boards-floor",
    size: DESKTOP,
    admin: true,
  },
  {
    name: "admin-expense-mobile-dark",
    route: "#/admin/needs/boards-floor/expense",
    size: MOBILE,
    dark: true,
    admin: true,
    before: async (page) => {
      await page.click("#fill-expense");
      await page.click("#save-expense");
      await page.locator("#exp-redacted").scrollIntoViewIfNeeded();
    },
  },
];

const server = createServer(async (request, response) => {
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(await readFile(join(root, "dist/preview.html")));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/preview.html`;

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  for (const shot of SHOTS) {
    const context = await browser.newContext({
      viewport: shot.size,
      deviceScaleFactor: shot.size === MOBILE ? 2 : 1,
      colorScheme: shot.dark ? "dark" : "light",
      locale: "ru-RU",
    });
    const page = await context.newPage();
    await page.goto(base);
    if (shot.admin) await signIn(page);
    await page.goto(`${base}${shot.route}`);
    await page.evaluate(() => document.fonts.ready);
    await shot.before?.(page);
    // The progress hatching draws itself for about a second.
    await page.waitForTimeout(1300);
    await page.screenshot({
      path: join(out, `${shot.name}.jpg`),
      type: "jpeg",
      quality: 60,
    });
    await context.close();
    console.log(shot.name);
  }
} finally {
  await browser.close();
  server.close();
}
